import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripePlan } from './interfaces/stripe-plan.interface';

export interface CreatePaymentSessionData {
  priceId: string;
  mode: 'payment' | 'subscription';
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionSessionData {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    const apiVersion = this.configService.get<string>('STRIPE_API_VERSION') || '2024-06-20';
    const paymentsMode = this.configService.get<string>('PAYMENTS_MODE', 'none');
    
    this.isEnabled = paymentsMode !== 'none' && !!secretKey;

    if (this.isEnabled && secretKey) {
      this.stripe = new Stripe(secretKey, {
        apiVersion: apiVersion as Stripe.LatestApiVersion,
      });
      this.logger.log('Stripe service initialized successfully');
    } else {
      this.logger.warn('Stripe service disabled - missing configuration or PAYMENTS_MODE is "none"');
    }
  }

  /**
   * Check if Stripe is properly configured and enabled
   */
  isConfigured(): boolean {
    return this.isEnabled;
  }

  /**
   * Create a payment session for one-time payments
   */
  async createPaymentSession(data: CreatePaymentSessionData): Promise<Stripe.Checkout.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const paymentsMode = this.configService.get<string>('PAYMENTS_MODE', 'none');
    if (paymentsMode !== 'single' && paymentsMode !== 'both') {
      throw new Error('Single payments are not enabled in PAYMENTS_MODE');
    }

    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: data.mode,
        payment_method_types: ['card'],
        line_items: [
          {
            price: data.priceId,
            quantity: 1,
          },
        ],
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        customer_email: data.customerEmail,
        metadata: data.metadata || {},
      });

      this.logger.log(`Payment session created: ${session.id}`);
      return session;
    } catch (error) {
      this.logger.error('Failed to create payment session', error);
      throw error;
    }
  }

  /**
   * Create a subscription session
   */
  async createSubscriptionSession(data: CreateSubscriptionSessionData): Promise<Stripe.Checkout.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const paymentsMode = this.configService.get<string>('PAYMENTS_MODE', 'none');
    if (paymentsMode !== 'subscription' && paymentsMode !== 'both') {
      throw new Error('Subscriptions are not enabled in PAYMENTS_MODE');
    }

    try {
      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: data.priceId,
            quantity: 1,
          },
        ],
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        customer_email: data.customerEmail,
        metadata: data.metadata || {},
      };

      if (data.trialPeriodDays) {
        sessionConfig.subscription_data = {
          trial_period_days: data.trialPeriodDays,
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionConfig);

      this.logger.log(`Subscription session created: ${session.id}`);
      return session;
    } catch (error) {
      this.logger.error('Failed to create subscription session', error);
      throw error;
    }
  }

  /**
   * List all available prices
   */
  async listPrices(): Promise<Stripe.Price[]> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const prices = await this.stripe.prices.list({
        active: true,
        expand: ['data.product'],
      });

      return prices.data;
    } catch (error) {
      this.logger.error('Failed to list prices', error);
      throw error;
    }
  }

  /**
   * Get a specific price by ID
   */
  async getPrice(priceId: string): Promise<Stripe.Price> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const price = await this.stripe.prices.retrieve(priceId, {
        expand: ['product'],
      });

      return price;
    } catch (error) {
      this.logger.error(`Failed to get price ${priceId}`, error);
      throw error;
    }
  }

  /**
   * Create a product in Stripe
   */
  async createProduct(name: string, description: string): Promise<Stripe.Product> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const product = await this.stripe.products.create({
        name,
        description,
      });

      this.logger.log(`Product created: ${product.id} - ${name}`);
      return product;
    } catch (error) {
      this.logger.error(`Failed to create product ${name}`, error);
      throw error;
    }
  }

  /**
   * Create a price for a product
   */
  async createPrice(productId: string, plan: StripePlan): Promise<Stripe.Price> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const priceData: Stripe.PriceCreateParams = {
        product: productId,
        unit_amount: plan.amount,
        currency: plan.currency,
      };

      if (plan.type === 'subscription' && plan.interval) {
        priceData.recurring = {
          interval: plan.interval,
        };
      }

      const price = await this.stripe.prices.create(priceData);

      this.logger.log(`Price created: ${price.id} for product ${productId}`);
      return price;
    } catch (error) {
      this.logger.error(`Failed to create price for product ${productId}`, error);
      throw error;
    }
  }

  /**
   * Find existing products by name
   */
  async findProductByName(name: string): Promise<Stripe.Product | null> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const products = await this.stripe.products.list({
        active: true,
      });

      const existingProduct = products.data.find(product => product.name === name);
      return existingProduct || null;
    } catch (error) {
      this.logger.error(`Failed to find product by name ${name}`, error);
      throw error;
    }
  }

  /**
   * Handle webhook events from Stripe
   */
  async handleWebhookEvent(body: Buffer, signature: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);

      this.logger.log(`Received webhook event: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      throw error;
    }
  }

  /**
   * Handle successful checkout session completion
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout session completed: ${session.id}`);
    
    // Here you would typically:
    // 1. Update user records in your database
    // 2. Grant access to purchased features
    // 3. Send confirmation emails
    // 4. Update subscription status
    
    if (session.mode === 'subscription') {
      this.logger.log(`New subscription created for customer: ${session.customer}`);
    } else if (session.mode === 'payment') {
      this.logger.log(`One-time payment completed for customer: ${session.customer}`);
    }
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`);
    
    // Handle recurring subscription payments
    if (invoice.subscription) {
      this.logger.log(`Subscription payment successful: ${invoice.subscription}`);
      // Update subscription status, extend access period, etc.
    }
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.warn(`Invoice payment failed: ${invoice.id}`);
    
    // Handle payment failures
    if (invoice.subscription) {
      this.logger.warn(`Subscription payment failed: ${invoice.subscription}`);
      // Send notification emails, update user status, etc.
    }
  }

  /**
   * Handle subscription creation
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}`);
    
    // Update user subscription status in database
    // Grant access to subscription features
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);
    
    // Handle subscription status changes
    // Update user access based on new subscription status
  }

  /**
   * Handle subscription deletion/cancellation
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);
    
    // Revoke access to subscription features
    // Update user status in database
    // Send cancellation confirmation
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const subscription = await this.stripe.subscriptions.cancel(subscriptionId);
      this.logger.log(`Subscription cancelled: ${subscriptionId}`);
      return subscription;
    } catch (error) {
      this.logger.error(`Failed to cancel subscription ${subscriptionId}`, error);
      throw error;
    }
  }

  /**
   * Create a customer portal session
   */
  async createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      this.logger.log(`Portal session created for customer: ${customerId}`);
      return session;
    } catch (error) {
      this.logger.error(`Failed to create portal session for customer ${customerId}`, error);
      throw error;
    }
  }
}