import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { 
  StripeWebhookService,
  StripePaymentService,
  StripeCustomerService,
  StripeSubscriptionService,
  StripeTransactionService,
  StripePlanService,
  CreatePaymentSessionData,
  CreateSubscriptionSessionData
} from './services';
import { StripePlan } from './interfaces/stripe-plan.interface';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';
import { 
  PaymentMethodEntity,
  StripeTransactionEntity,
  PlanEntity,
  WebhookProcessingStatus
} from './entities';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;
  private readonly isEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private webhookService: StripeWebhookService,
    private paymentService: StripePaymentService,
    private customerService: StripeCustomerService,
    private subscriptionService: StripeSubscriptionService,
    private transactionService: StripeTransactionService,
    private planService: StripePlanService,
  ) {
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

  // ===============================
  // PAYMENT METHODS (Delegated)
  // ===============================

  async createPaymentSession(data: CreatePaymentSessionData): Promise<Stripe.Checkout.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.paymentService.createPaymentSession(this.stripe, data);
  }

  async createSubscriptionSession(data: CreateSubscriptionSessionData): Promise<Stripe.Checkout.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.paymentService.createSubscriptionSession(this.stripe, data);
  }

  async createPortalSession(customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.paymentService.createPortalSession(this.stripe, customerId, returnUrl);
  }

  async listPrices(): Promise<Stripe.Price[]> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.paymentService.listPrices(this.stripe);
  }

  // ===============================
  // CUSTOMER METHODS (Delegated)
  // ===============================

  async createCustomerForUser(user: UserEntity, name?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.customerService.createCustomerForUser(this.stripe, user, name);
  }

  async createCustomerForUserData(userData: {
    id: number | string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }, name?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.customerService.createCustomerForUserData(this.stripe, userData, name);
  }

  async getUserPaymentMethods(userId: string): Promise<PaymentMethodEntity[]> {
    return this.customerService.getUserPaymentMethods(userId);
  }

  // ===============================
  // TRANSACTION METHODS (Delegated)
  // ===============================

  async getUserTransactions(userId: string, limit = 50): Promise<StripeTransactionEntity[]> {
    return this.transactionService.getUserTransactions(userId, limit);
  }

  // ===============================
  // PLAN METHODS (Delegated)
  // ===============================

  async getPlans(): Promise<PlanEntity[]> {
    return this.planService.getPlans();
  }

  async getPlansByType(type: 'subscription' | 'one-time'): Promise<PlanEntity[]> {
    return this.planService.getPlansByType(type);
  }

  async getPlanByStripePriceId(stripePriceId: string): Promise<PlanEntity | null> {
    return this.planService.getPlanByStripePriceId(stripePriceId);
  }

  async getPlanById(id: string): Promise<PlanEntity | null> {
    return this.planService.getPlanById(id);
  }

  async getStripePlan(priceId: string): Promise<StripePlan | null> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.planService.getStripePlan(this.stripe, priceId);
  }

  async createPaymentSessionFromPlan(
    planId: string, 
    data: Omit<CreatePaymentSessionData, 'priceId'>
  ): Promise<Stripe.Checkout.Session> {
    const plan = await this.planService.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const mode = plan.interval === 'one-time' ? 'payment' : 'subscription';
    
    return this.createPaymentSession({
      ...data,
      priceId: plan.stripePriceId,
      mode
    });
  }

  async createSubscriptionSessionFromPlan(
    planId: string,
    data: Omit<CreateSubscriptionSessionData, 'priceId'>
  ): Promise<Stripe.Checkout.Session> {
    const plan = await this.planService.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (plan.interval === 'one-time') {
      throw new Error(`Plan ${planId} is not a subscription plan`);
    }

    return this.createSubscriptionSession({
      ...data,
      priceId: plan.stripePriceId,
      trialPeriodDays: data.trialPeriodDays || plan.trialPeriodDays
    });
  }

  // ===============================
  // WEBHOOK METHODS (Delegated)
  // ===============================

  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }
    return this.webhookService.constructEvent(this.stripe, payload, signature);
  }

  async handleWebhookEvent(payload: Buffer | string, signature: string): Promise<void> {
    try {
      const event = this.constructEvent(payload, signature);
      
      // Log the webhook event
      const loggedEvent = await this.webhookService.logWebhookEvent(event.id, event.type, event.data);

      // Process the event based on type
      switch (event.type) {
        case 'checkout.session.completed':
          await this.transactionService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'invoice.payment_succeeded':
          await this.transactionService.handleInvoicePaymentSucceeded(this.stripe, event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.transactionService.handleInvoicePaymentFailed(this.stripe, event.data.object as Stripe.Invoice);
          await this.subscriptionService.handleInvoicePaymentFailedForSubscription(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.upcoming':
          // Just log for now - could extend with notification logic
          this.logger.log(`Upcoming invoice: ${(event.data.object as Stripe.Invoice).id}`);
          break;

        case 'payment_method.attached':
          const paymentMethod = event.data.object as Stripe.PaymentMethod;
          if (paymentMethod.customer && paymentMethod.card) {
            const customerId = typeof paymentMethod.customer === 'string' 
              ? paymentMethod.customer 
              : paymentMethod.customer.id;
            
            // Find user and save payment method
            // This could be moved to customer service if needed
            this.logger.log(`Payment method attached: ${paymentMethod.id} for customer: ${customerId}`);
          }
          break;

        case 'customer.subscription.created':
          await this.subscriptionService.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.subscriptionService.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.subscriptionService.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.trial_will_end':
          await this.subscriptionService.handleSubscriptionTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case 'payment_intent.succeeded':
          await this.transactionService.handlePaymentIntentSucceeded(this.stripe, event.data.object as Stripe.PaymentIntent);
          break;
          
        case 'payment_intent.created':
          this.logger.log(`Payment intent created: ${(event.data.object as Stripe.PaymentIntent).id}`);
          break;

        case 'payment_intent.payment_failed':
          await this.transactionService.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.transactionService.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.refunded':
          await this.transactionService.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          this.logger.warn(`⚠️  UNHANDLED WEBHOOK EVENT: ${event.type}`, {
            eventId: event.id,
            eventType: event.type,
            objectId: (event.data.object as any)?.id,
            objectType: (event.data.object as any)?.object,
          });
      }

      // Mark as completed
      if (loggedEvent) {
        await this.webhookService.updateWebhookEventStatus(event.id, WebhookProcessingStatus.COMPLETED);
      }

      this.logger.log(`Webhook event processed successfully: ${event.id}`);
    } catch (error) {
      this.logger.error('Failed to process webhook event', error);
      throw error;
    }
  }
}