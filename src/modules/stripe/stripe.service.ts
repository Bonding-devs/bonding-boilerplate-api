import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { StripePlan } from './interfaces/stripe-plan.interface';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';
import { 
  PaymentMethodEntity, 
  StripeTransactionEntity, 
  WebhookEventEntity,
  UserSubscriptionEntity,
  TransactionStatus,
  TransactionType,
  WebhookProcessingStatus,
  SubscriptionStatus
} from './entities';

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

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(PaymentMethodEntity)
    private paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(StripeTransactionEntity)
    private transactionRepository: Repository<StripeTransactionEntity>,
    @InjectRepository(WebhookEventEntity)
    private webhookEventRepository: Repository<WebhookEventEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private subscriptionRepository: Repository<UserSubscriptionEntity>,
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

  /**
   * Safely convert a Stripe timestamp to a Date object
   */
  private convertStripeTimestamp(timestamp: number | null | undefined): Date | null {
    this.logger.debug(`Converting timestamp: ${timestamp} (type: ${typeof timestamp})`);
    if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
      this.logger.warn(`Invalid timestamp received: ${timestamp}`);
      return null;
    }
    const result = new Date(timestamp * 1000);
    this.logger.debug(`Converted to date: ${result.toISOString()}`);
    return result;
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

      this.logger.log('Payment session created', {
        sessionId: session.id,
        mode: data.mode,
        priceId: data.priceId,
      });

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
      const sessionOptions: Stripe.Checkout.SessionCreateParams = {
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
        sessionOptions.subscription_data = {
          trial_period_days: data.trialPeriodDays,
        };
      }

      const session = await this.stripe.checkout.sessions.create(sessionOptions);

      this.logger.log('Subscription session created', {
        sessionId: session.id,
        priceId: data.priceId,
        trialPeriodDays: data.trialPeriodDays,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create subscription session', error);
      throw error;
    }
  }

  /**
   * Construct event from webhook payload
   */
  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const endpointSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!endpointSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        endpointSecret,
      );

      this.logger.log('Webhook event constructed', {
        eventId: event.id,
        type: event.type,
      });

      return event;
    } catch (error) {
      this.logger.error('Failed to construct webhook event', error);
      throw error;
    }
  }

  /**
   * Retrieve Stripe plans (prices)
   */
  async getPlans(): Promise<StripePlan[]> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const prices = await this.stripe.prices.list({
        active: true,
        expand: ['data.product'],
      });

      const plans: StripePlan[] = prices.data.map((price) => {
        const product = price.product as Stripe.Product;
        return {
          id: price.id,
          name: product.name,
          description: product.description || '',
          amount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval as 'day' | 'week' | 'month' | 'year' | undefined,
          intervalCount: price.recurring?.interval_count || undefined,
          metadata: price.metadata,
          productId: product.id,
        };
      });

      this.logger.log(`Retrieved ${plans.length} plans from Stripe`);
      return plans;
    } catch (error) {
      this.logger.error('Failed to retrieve plans from Stripe', error);
      throw error;
    }
  }

  /**
   * Get a specific plan by ID
   */
  async getPlan(priceId: string): Promise<StripePlan | null> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      const price = await this.stripe.prices.retrieve(priceId, {
        expand: ['product'],
      });

      if (!price.active) {
        return null;
      }

      const product = price.product as Stripe.Product;
      return {
        id: price.id,
        name: product.name,
        description: product.description || '',
        amount: price.unit_amount || 0,
        currency: price.currency,
        interval: price.recurring?.interval as 'day' | 'week' | 'month' | 'year' | undefined,
        intervalCount: price.recurring?.interval_count || undefined,
        metadata: price.metadata,
        productId: product.id,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve plan ${priceId}`, error);
      return null;
    }
  }

  /**
   * List all active prices
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

      this.logger.log(`Retrieved ${prices.data.length} prices from Stripe`);
      return prices.data;
    } catch (error) {
      this.logger.error('Failed to retrieve prices from Stripe', error);
      throw error;
    }
  }

  /**
   * Create customer portal session
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

      this.logger.log('Customer portal session created', {
        sessionId: session.id,
        customerId,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create customer portal session', error);
      throw error;
    }
  }

  /**
   * Create or retrieve Stripe customer for user
   */
  async createCustomerForUser(user: UserEntity, name?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    // Return existing customer ID if already exists
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    try {
      const customer = await this.stripe.customers.create({
        email: user.email || undefined,
        name: name || user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined,
        metadata: {
          userId: user.id.toString(),
        },
      });

      // Update user with Stripe customer ID
      await this.userRepository.update(user.id, {
        stripeCustomerId: customer.id,
      });

      this.logger.log(`Created Stripe customer for user ${user.id}`, {
        customerId: customer.id,
        userEmail: user.email,
      });

      return customer.id;
    } catch (error) {
      this.logger.error(`Failed to create Stripe customer for user ${user.id}`, error);
      throw error;
    }
  }

  /**
   * Create Stripe customer using basic user data (for domain objects)
   */
  async createCustomerForUserData(userData: {
    id: number | string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }, name?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      // Check if user already has a Stripe customer
      const existingUser = await this.userRepository.findOne({
        where: { id: userData.id.toString() },
      });

      if (existingUser?.stripeCustomerId) {
        return existingUser.stripeCustomerId;
      }

      const customer = await this.stripe.customers.create({
        email: userData.email || undefined,
        name: name || userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : undefined,
        metadata: {
          userId: userData.id.toString(),
        },
      });

      // Update user with Stripe customer ID
      await this.userRepository.update(userData.id.toString(), {
        stripeCustomerId: customer.id,
      });

      this.logger.log(`Created Stripe customer for user ${userData.id}`, {
        customerId: customer.id,
        userEmail: userData.email,
      });

      return customer.id;
    } catch (error) {
      this.logger.error(`Failed to create Stripe customer for user ${userData.id}`, error);
      throw error;
    }
  }

  /**
   * Save payment method to database
   */
  async savePaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
    type: string,
    last4?: string,
    brand?: string,
    expMonth?: number,
    expYear?: number,
  ): Promise<PaymentMethodEntity> {
    try {
      const paymentMethod = this.paymentMethodRepository.create({
        userId,
        stripePaymentMethodId,
        type,
        last4,
        brand,
        expMonth,
        expYear,
        isDefault: false,
      });

      const savedPaymentMethod = await this.paymentMethodRepository.save(paymentMethod);

      this.logger.log(`Payment method saved for user ${userId}`, {
        paymentMethodId: savedPaymentMethod.id,
        stripePaymentMethodId,
        type,
        last4,
      });

      return savedPaymentMethod;
    } catch (error) {
      this.logger.error(`Failed to save payment method for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Record transaction in database
   */
  async recordTransaction(
    userId: string,
    stripePaymentIntentId: string,
    type: TransactionType,
    amount: number,
    currency: string,
    status: TransactionStatus,
    description?: string,
    metadata?: Record<string, any>,
    failureReason?: string,
    stripeFee?: number,
    netAmount?: number,
    processedAt?: Date,
  ): Promise<StripeTransactionEntity> {
    try {
      const transaction = this.transactionRepository.create({
        userId,
        stripePaymentIntentId,
        transactionType: type,
        amount,
        currency: currency.toUpperCase(),
        status,
        description,
        metadata,
        failureReason,
        stripeFee,
        netAmount,
        processedAt,
      });

      const savedTransaction = await this.transactionRepository.save(transaction);

      this.logger.log(`Transaction recorded for user ${userId}`, {
        transactionId: savedTransaction.id,
        stripePaymentIntentId,
        type,
        amount,
        currency,
        status,
        failureReason,
      });

      return savedTransaction;
    } catch (error) {
      this.logger.error(`Failed to record transaction for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    stripePaymentIntentId: string,
    status: TransactionStatus,
    failureReason?: string,
  ): Promise<void> {
    try {
      const updateData: Partial<StripeTransactionEntity> = {
        status,
        updatedAt: new Date(),
      };

      if (status === TransactionStatus.FAILED && failureReason) {
        updateData.metadata = { failureReason };
      }

      await this.transactionRepository.update(
        { stripePaymentIntentId },
        updateData,
      );

      this.logger.log(`Transaction status updated: ${stripePaymentIntentId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update transaction status for ${stripePaymentIntentId}`, error);
      throw error;
    }
  }

  /**
   * Log webhook event
   */
  async logWebhookEvent(
    stripeEventId: string,
    eventType: string,
    data: Record<string, any>,
  ): Promise<WebhookEventEntity | null> {
    try {
      // Check if webhook logging is enabled via environment variable
      const webhookLoggingEnabled = process.env.STRIPE_WEBHOOK_LOGGING_ENABLED === 'true';
      
      if (!webhookLoggingEnabled) {
        this.logger.log(`Webhook event skipped (logging disabled): ${stripeEventId}`, {
          eventType,
          reason: 'STRIPE_WEBHOOK_LOGGING_ENABLED=false',
        });
        return null;
      }

      const webhookEvent = this.webhookEventRepository.create({
        stripeEventId,
        eventType,
        rawPayload: data,
        processingStatus: WebhookProcessingStatus.PENDING,
        retryCount: 0,
      });

      const savedEvent = await this.webhookEventRepository.save(webhookEvent);

      this.logger.log(`Webhook event logged: ${stripeEventId}`, {
        eventType,
        eventId: savedEvent.id,
      });

      return savedEvent;
    } catch (error) {
      this.logger.error(`Failed to log webhook event ${stripeEventId}`, error);
      throw error;
    }
  }

  /**
   * Update webhook event processing status
   */
  async updateWebhookEventStatus(
    eventId: string,
    status: WebhookProcessingStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      // Check if webhook logging is enabled via environment variable
      const webhookLoggingEnabled = process.env.STRIPE_WEBHOOK_LOGGING_ENABLED === 'true';
      
      if (!webhookLoggingEnabled) {
        this.logger.log(`Webhook status update skipped (logging disabled): ${eventId} -> ${status}`, {
          reason: 'STRIPE_WEBHOOK_LOGGING_ENABLED=false',
        });
        return;
      }

      const updateData: Partial<WebhookEventEntity> = {
        processingStatus: status,
        errorMessage,
      };

      if (status === WebhookProcessingStatus.COMPLETED) {
        updateData.processedAt = new Date();
      }

      if (status === WebhookProcessingStatus.FAILED || status === WebhookProcessingStatus.RETRYING) {
        await this.webhookEventRepository.increment(
          { stripeEventId: eventId },
          'retryCount',
          1,
        );
      }

      await this.webhookEventRepository.update(
        { stripeEventId: eventId },
        updateData,
      );

      this.logger.log(`Webhook event status updated: ${eventId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update webhook event status for ${eventId}`, error);
      throw error;
    }
  }

  /**
   * Get user's payment methods
   */
  async getUserPaymentMethods(userId: string): Promise<PaymentMethodEntity[]> {
    try {
      return await this.paymentMethodRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to get payment methods for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get user's transactions
   */
  async getUserTransactions(userId: string, limit = 50): Promise<StripeTransactionEntity[]> {
    try {
      return await this.transactionRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: limit,
      });
    } catch (error) {
      this.logger.error(`Failed to get transactions for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Process checkout session completed webhook
   */
  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      this.logger.log(`Processing checkout session completed: ${session.id}`);

      // If customer exists, try to find the user
      if (session.customer) {
        const customerId = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Record the transaction
          await this.recordTransaction(
            user.id,
            session.payment_intent as string || session.subscription as string || session.id,
            session.mode === 'subscription' ? TransactionType.SUBSCRIPTION : TransactionType.PAYMENT,
            session.amount_total || 0,
            session.currency || 'usd',
            TransactionStatus.COMPLETED,
            `Checkout session completed - ${session.mode}`,
            {
              sessionId: session.id,
              mode: session.mode,
              customerEmail: session.customer_email,
            },
          );
        }
      }

      this.logger.log(`Checkout session processed successfully: ${session.id}`);
    } catch (error) {
      this.logger.error(`Failed to process checkout session completed: ${session.id}`, error);
      throw error;
    }
  }

  /**
   * Process invoice payment succeeded webhook
   */
  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      this.logger.log(`Processing invoice payment succeeded: ${invoice.id}`);

      if (invoice.customer) {
        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Get fee information from payment intent or charge if available
          let stripeFee = 0;
          let netAmount = (invoice.amount_paid || 0) / 100;
          
          if (invoice.payment_intent && typeof invoice.payment_intent === 'string') {
            try {
              const paymentIntent = await this.stripe.paymentIntents.retrieve(
                invoice.payment_intent,
                { expand: ['latest_charge'] }
              );
              
              if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object') {
                const charge = paymentIntent.latest_charge as Stripe.Charge;
                if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
                  const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction;
                  stripeFee = balanceTransaction.fee / 100; // Convert from cents
                  netAmount = balanceTransaction.net / 100; // Convert from cents
                }
              }
            } catch (error) {
              this.logger.warn(`Could not retrieve payment intent fee details: ${error.message}`);
            }
          }

          await this.recordTransaction(
            user.id,
            invoice.payment_intent as string || invoice.id,
            TransactionType.SUBSCRIPTION,
            (invoice.amount_paid || 0) / 100, // Convert from cents to dollars
            invoice.currency || 'usd',
            TransactionStatus.COMPLETED,
            `Invoice payment succeeded - ${invoice.number}`,
            {
              invoiceId: invoice.id,
              invoiceNumber: invoice.number,
              subscriptionId: invoice.subscription,
              periodStart: invoice.period_start,
              periodEnd: invoice.period_end,
            },
            undefined, // failureReason (not applicable for successful payments)
            stripeFee,
            netAmount,
            new Date() // processedAt
          );
        }
      }

      this.logger.log(`Invoice payment processed successfully: ${invoice.id}`);
    } catch (error) {
      this.logger.error(`Failed to process invoice payment succeeded: ${invoice.id}`, error);
      throw error;
    }
  }

  /**
   * Process payment method attached webhook
   */
  async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    try {
      this.logger.log(`Processing payment method attached: ${paymentMethod.id}`);

      if (paymentMethod.customer) {
        const customerId = typeof paymentMethod.customer === 'string' 
          ? paymentMethod.customer 
          : paymentMethod.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user && paymentMethod.card) {
          await this.savePaymentMethod(
            user.id,
            paymentMethod.id,
            paymentMethod.type,
            paymentMethod.card.last4,
            paymentMethod.card.brand,
            paymentMethod.card.exp_month,
            paymentMethod.card.exp_year,
          );
        }
      }

      this.logger.log(`Payment method processed successfully: ${paymentMethod.id}`);
    } catch (error) {
      this.logger.error(`Failed to process payment method attached: ${paymentMethod.id}`, error);
      throw error;
    }
  }

  /**
   * Handle payment intent succeeded event
   */
  async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      this.logger.log(`Processing payment intent succeeded: ${paymentIntent.id}`);

      if (paymentIntent.customer) {
        const customerId = typeof paymentIntent.customer === 'string' 
          ? paymentIntent.customer 
          : paymentIntent.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Check if this is a subscription payment by looking at the invoice
          // If it has an invoice, it's likely a subscription payment that will also trigger invoice.payment_succeeded
          let isSubscriptionPayment = false;
          if (paymentIntent.invoice) {
            isSubscriptionPayment = true;
            this.logger.log(`Payment intent ${paymentIntent.id} is for subscription, skipping to avoid duplicate with invoice.payment_succeeded`);
          }

          // Only record transaction if it's not a subscription payment (to avoid duplicates)
          if (!isSubscriptionPayment) {
            // Get fee information from charge if available
            let stripeFee = 0;
            let netAmount = paymentIntent.amount / 100;
            
            try {
              const paymentIntentExpanded = await this.stripe.paymentIntents.retrieve(
                paymentIntent.id,
                { expand: ['latest_charge'] }
              );
              
              if (paymentIntentExpanded.latest_charge && typeof paymentIntentExpanded.latest_charge === 'object') {
                const charge = paymentIntentExpanded.latest_charge as Stripe.Charge;
                if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
                  const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction;
                  stripeFee = balanceTransaction.fee / 100; // Convert from cents
                  netAmount = balanceTransaction.net / 100; // Convert from cents
                }
              }
            } catch (error) {
              this.logger.warn(`Could not retrieve charge fee details: ${error.message}`);
            }

            await this.recordTransaction(
              user.id,
              paymentIntent.id,
              TransactionType.PAYMENT,
              paymentIntent.amount / 100, // Convert from cents to dollars
              paymentIntent.currency,
              TransactionStatus.COMPLETED,
              paymentIntent.description || 'Payment completed',
              {
                paymentMethodId: paymentIntent.payment_method,
                metadata: paymentIntent.metadata,
              },
              undefined, // failureReason (not applicable for successful payments)
              stripeFee,
              netAmount,
              new Date() // processedAt
            );

            this.logger.log(`Transaction created for payment intent: ${paymentIntent.id}`, {
              userId: user.id,
              amount: paymentIntent.amount / 100,
              currency: paymentIntent.currency,
            });
          }
        } else {
          this.logger.warn(`User not found for customer: ${customerId}`);
        }
      } else {
        this.logger.warn(`Payment intent ${paymentIntent.id} has no customer associated`);
      }

      this.logger.log(`Payment intent processed successfully: ${paymentIntent.id}`);
    } catch (error) {
      this.logger.error(`Failed to process payment intent succeeded: ${paymentIntent.id}`, error);
      throw error;
    }
  }

  /**
   * Handle payment intent failed event
   */
  async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      this.logger.log(`Processing payment intent failed: ${paymentIntent.id}`);

      if (paymentIntent.customer) {
        const customerId = typeof paymentIntent.customer === 'string' 
          ? paymentIntent.customer 
          : paymentIntent.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          await this.recordTransaction(
            user.id,
            paymentIntent.id,
            TransactionType.PAYMENT,
            paymentIntent.amount / 100, // Convert from cents to dollars
            paymentIntent.currency,
            TransactionStatus.FAILED,
            paymentIntent.description || 'Payment failed',
            {
              paymentMethodId: paymentIntent.payment_method,
              failureCode: paymentIntent.last_payment_error?.code,
              failureMessage: paymentIntent.last_payment_error?.message,
              metadata: paymentIntent.metadata,
            }
          );

          this.logger.log(`Failed transaction recorded for payment intent: ${paymentIntent.id}`, {
            userId: user.id,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            failureCode: paymentIntent.last_payment_error?.code,
          });
        } else {
          this.logger.warn(`User not found for customer: ${customerId}`);
        }
      } else {
        this.logger.warn(`Payment intent ${paymentIntent.id} has no customer associated`);
      }

      this.logger.log(`Failed payment intent processed: ${paymentIntent.id}`);
    } catch (error) {
      this.logger.error(`Failed to process payment intent failed: ${paymentIntent.id}`, error);
      throw error;
    }
  }

  /**
   * Handle payment intent canceled event
   */
  async handlePaymentIntentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      this.logger.log(`Processing payment intent canceled: ${paymentIntent.id}`);

      if (paymentIntent.customer) {
        const customerId = typeof paymentIntent.customer === 'string' 
          ? paymentIntent.customer 
          : paymentIntent.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          await this.recordTransaction(
            user.id,
            paymentIntent.id,
            TransactionType.PAYMENT,
            paymentIntent.amount / 100, // Convert from cents to dollars
            paymentIntent.currency,
            TransactionStatus.CANCELLED,
            paymentIntent.description || 'Payment canceled',
            {
              paymentMethodId: paymentIntent.payment_method,
              cancellationReason: paymentIntent.cancellation_reason,
              metadata: paymentIntent.metadata,
            }
          );

          this.logger.log(`Canceled transaction recorded for payment intent: ${paymentIntent.id}`, {
            userId: user.id,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency,
            cancellationReason: paymentIntent.cancellation_reason,
          });
        } else {
          this.logger.warn(`User not found for customer: ${customerId}`);
        }
      } else {
        this.logger.warn(`Payment intent ${paymentIntent.id} has no customer associated`);
      }

      this.logger.log(`Canceled payment intent processed: ${paymentIntent.id}`);
    } catch (error) {
      this.logger.error(`Failed to process payment intent canceled: ${paymentIntent.id}`, error);
      throw error;
    }
  }

  /**
   * Handle charge refunded event
   */
  async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    try {
      this.logger.log(`Processing charge refunded: ${charge.id}`);

      if (charge.customer) {
        const customerId = typeof charge.customer === 'string' 
          ? charge.customer 
          : charge.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Get the refund information
          const refund = charge.refunds?.data?.[0]; // Most recent refund
          const refundAmount = refund ? refund.amount / 100 : charge.amount_refunded / 100;
          
          await this.recordTransaction(
            user.id,
            charge.payment_intent as string || charge.id,
            TransactionType.REFUND,
            refundAmount,
            charge.currency,
            TransactionStatus.REFUNDED,
            `Refund for charge ${charge.id}`,
            {
              originalChargeId: charge.id,
              refundId: refund?.id,
              refundReason: refund?.reason,
              refundStatus: refund?.status,
              metadata: charge.metadata,
            }
          );

          this.logger.log(`Refund transaction recorded for charge: ${charge.id}`, {
            userId: user.id,
            refundAmount,
            currency: charge.currency,
            refundId: refund?.id,
          });
        } else {
          this.logger.warn(`User not found for customer: ${customerId}`);
        }
      } else {
        this.logger.warn(`Charge ${charge.id} has no customer associated`);
      }

      this.logger.log(`Refunded charge processed: ${charge.id}`);
    } catch (error) {
      this.logger.error(`Failed to process charge refunded: ${charge.id}`, error);
      throw error;
    }
  }

  /**
   * Handle invoice payment failed event (Critical for subscriptions)
   */
  async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    try {
      this.logger.error(`🚨 PROCESSING INVOICE PAYMENT FAILED: ${invoice.id}`, {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        subscriptionId: invoice.subscription,
        attemptCount: invoice.attempt_count,
        amountDue: invoice.amount_due / 100,
        currency: invoice.currency,
      });

      if (invoice.customer) {
        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Find and update subscription
          if (invoice.subscription) {
            const subscriptionId = typeof invoice.subscription === 'string'
              ? invoice.subscription
              : invoice.subscription.id;

            const subscription = await this.subscriptionRepository.findOne({
              where: { stripeSubscriptionId: subscriptionId },
            });

            if (subscription) {
              // Increment failed payment count
              subscription.failedPaymentCount += 1;
              
              // Mark as past_due if this is the first failure
              if (subscription.failedPaymentCount === 1) {
                subscription.status = SubscriptionStatus.PAST_DUE;
              }

              await this.subscriptionRepository.save(subscription);

              this.logger.log(`Subscription marked as past_due: ${subscriptionId}`, {
                userId: user.id,
                failedPaymentCount: subscription.failedPaymentCount,
                amount: invoice.amount_due / 100,
              });
            }
          }

          // Get failure reason from payment intent if available
          let failureReason = 'Unknown failure reason';
          if (invoice.payment_intent && typeof invoice.payment_intent === 'string') {
            try {
              const paymentIntent = await this.stripe.paymentIntents.retrieve(invoice.payment_intent);
              if (paymentIntent.last_payment_error) {
                failureReason = paymentIntent.last_payment_error.message || 
                  paymentIntent.last_payment_error.code || 
                  'Payment failed';
              }
            } catch (error) {
              this.logger.warn(`Could not retrieve payment intent details: ${error.message}`);
            }
          }

          // Record failed transaction
          await this.recordTransaction(
            user.id,
            invoice.payment_intent as string,
            TransactionType.SUBSCRIPTION,
            invoice.amount_due / 100,
            invoice.currency,
            TransactionStatus.FAILED,
            `Subscription payment failed: ${invoice.id}`,
            {
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription,
              attemptCount: invoice.attempt_count,
              nextPaymentAttempt: invoice.next_payment_attempt,
            },
            failureReason
          );
        } else {
          this.logger.warn(`User not found for customer: ${customerId}`);
        }
      }

      this.logger.log(`Invoice payment failed processed: ${invoice.id}`);
    } catch (error) {
      this.logger.error(`Failed to process invoice payment failed: ${invoice.id}`, error);
      throw error;
    }
  }

  /**
   * Handle upcoming invoice event
   */
  async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    try {
      this.logger.log(`Processing upcoming invoice: ${invoice.id}`);

      if (invoice.customer) {
        const customerId = typeof invoice.customer === 'string' 
          ? invoice.customer 
          : invoice.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          this.logger.log(`Upcoming invoice for user: ${user.id}`, {
            invoiceId: invoice.id,
            amount: invoice.amount_due / 100,
            currency: invoice.currency,
            periodStart: this.convertStripeTimestamp(invoice.period_start),
            periodEnd: this.convertStripeTimestamp(invoice.period_end),
          });

          // Here you could send email notifications
          // await this.emailService.sendUpcomingInvoiceNotification(user, invoice);
        }
      }

      this.logger.log(`Upcoming invoice processed: ${invoice.id}`);
    } catch (error) {
      this.logger.error(`Failed to process upcoming invoice: ${invoice.id}`, error);
      throw error;
    }
  }

  /**
   * Handle subscription created event
   */
  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    try {
      this.logger.log(`Processing subscription created: ${subscription.id}`);

      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;

      this.logger.log(`Looking for user with Stripe customer ID: ${customerId}`);

      const user = await this.userRepository.findOne({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        this.logger.log(`Found user: ${user.id} for customer: ${customerId}`);
        
        // Get plan information
        const priceId = subscription.items.data[0]?.price.id;
        const price = subscription.items.data[0]?.price;

        this.logger.log(`Price details:`, {
          priceId,
          unitAmount: price?.unit_amount,
          currency: price?.currency,
          nickname: price?.nickname,
          productType: typeof price?.product,
        });

        this.logger.log(`Subscription period details:`, {
          subscription_current_period_start: subscription.current_period_start,
          subscription_current_period_end: subscription.current_period_end,
          billing_cycle_anchor: subscription.billing_cycle_anchor,
          created: subscription.created,
          start_date: (subscription as any).start_date,
          trial_start: subscription.trial_start,
          trial_end: subscription.trial_end,
          items_current_period_start: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_start : 'not_found',
          items_current_period_end: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_end : 'not_found',
        });

        // Get product name safely
        let planName = '';
        if (price?.nickname) {
          planName = price.nickname;
        } else if (price?.product) {
          if (typeof price.product === 'string') {
            planName = price.product; // Product ID
          } else if (price.product && typeof price.product === 'object') {
            // Handle both Product and DeletedProduct types
            const product = price.product as any;
            planName = product.name || product.id || 'Unknown Plan';
          }
        }

        this.logger.log(`Extracted plan name: ${planName}`);

        // Create new subscription record (multiple subscriptions per user allowed)
        const userSubscription = new UserSubscriptionEntity();
        userSubscription.userId = user.id;
        userSubscription.stripeSubscriptionId = subscription.id;
        userSubscription.status = this.mapStripeSubscriptionStatus(subscription.status);
        userSubscription.planId = priceId;
        userSubscription.planName = planName || 'Unknown Plan';
        userSubscription.amount = price?.unit_amount ? price.unit_amount / 100 : 0;
        userSubscription.currency = price?.currency || 'usd';
        userSubscription.interval = price?.recurring?.interval || 'month';
        userSubscription.intervalCount = price?.recurring?.interval_count || 1;
        
        // Handle period dates safely - get from subscription items where they are actually located
        const subscriptionItem = subscription.items?.data?.[0];
        
        // Extract period dates from subscription item first, with fallbacks
        let periodStart: Date | null = null;
        let periodEnd: Date | null = null;
        
        if (subscriptionItem && (subscriptionItem as any).current_period_start) {
          periodStart = this.convertStripeTimestamp((subscriptionItem as any).current_period_start);
          this.logger.log(`Found current_period_start in subscription item: ${(subscriptionItem as any).current_period_start}`);
        } else if (subscription.billing_cycle_anchor) {
          periodStart = this.convertStripeTimestamp(subscription.billing_cycle_anchor);
          this.logger.log(`Using billing_cycle_anchor as fallback: ${subscription.billing_cycle_anchor}`);
        } else {
          periodStart = this.convertStripeTimestamp(subscription.created);
          this.logger.log(`Using created timestamp as fallback: ${subscription.created}`);
        }
        
        if (subscriptionItem && (subscriptionItem as any).current_period_end) {
          periodEnd = this.convertStripeTimestamp((subscriptionItem as any).current_period_end);
          this.logger.log(`Found current_period_end in subscription item: ${(subscriptionItem as any).current_period_end}`);
        } else {
          this.logger.log(`No current_period_end found - will be populated by future Stripe updates`);
        }
        
        if (periodStart) {
          userSubscription.currentPeriodStart = periodStart;
          this.logger.log(`Set currentPeriodStart: ${userSubscription.currentPeriodStart}`);
        } else {
          this.logger.warn(`No valid current_period_start found in subscription`);
        }
        
        if (periodEnd) {
          userSubscription.currentPeriodEnd = periodEnd;
          this.logger.log(`Set currentPeriodEnd: ${userSubscription.currentPeriodEnd}`);
        } else {
          this.logger.warn(`No valid current_period_end found in subscription - will be populated when period data is available from Stripe`);
        }
        
        // Handle trial dates safely
        const trialStart = this.convertStripeTimestamp(subscription.trial_start);
        const trialEnd = this.convertStripeTimestamp(subscription.trial_end);
        
        if (trialStart && trialEnd) {
          userSubscription.trialStartDate = trialStart;
          userSubscription.trialEndDate = trialEnd;
        }

        userSubscription.metadata = subscription.metadata;

        this.logger.log(`Saving subscription record:`, {
          userId: userSubscription.userId,
          subscriptionId: userSubscription.stripeSubscriptionId,
          status: userSubscription.status,
          planId: userSubscription.planId,
          planName: userSubscription.planName,
          amount: userSubscription.amount,
        });

        await this.subscriptionRepository.save(userSubscription);

        this.logger.log(`Subscription created successfully for user: ${user.id}`, {
          subscriptionId: subscription.id,
          planId: priceId,
          status: subscription.status,
          amount: userSubscription.amount,
        });
      } else {
        this.logger.warn(`User not found for customer: ${customerId}`);
      }

      this.logger.log(`Subscription created processing completed: ${subscription.id}`);
    } catch (error) {
      this.logger.error(`Failed to process subscription created: ${subscription.id}`, {
        error: error.message,
        stack: error.stack,
        subscriptionData: {
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status,
          items: subscription.items?.data?.length || 0,
        },
      });
      throw error;
    }
  }

  /**
   * Handle subscription updated event
   */
  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    try {
      this.logger.log(`Processing subscription updated: ${subscription.id}`);

      const userSubscription = await this.subscriptionRepository.findOne({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (userSubscription) {
        const previousStatus = userSubscription.status;
        
        this.logger.log(`Subscription period data`, {
          subscriptionId: subscription.id,
          subscription_current_period_start: subscription.current_period_start,
          subscription_current_period_end: subscription.current_period_end,
          items_current_period_start: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_start : 'not_found',
          items_current_period_end: subscription.items?.data?.[0] ? (subscription.items.data[0] as any).current_period_end : 'not_found',
        });
        
        // Update subscription data
        userSubscription.status = this.mapStripeSubscriptionStatus(subscription.status);
        
        // Handle period dates safely - get from subscription items where they are actually located
        const subscriptionItem = subscription.items?.data?.[0];
        
        let periodStart: Date | null = null;
        let periodEnd: Date | null = null;
        
        if (subscriptionItem && (subscriptionItem as any).current_period_start) {
          periodStart = this.convertStripeTimestamp((subscriptionItem as any).current_period_start);
          this.logger.log(`Found current_period_start in subscription item: ${(subscriptionItem as any).current_period_start}`);
        } else if (subscription.billing_cycle_anchor) {
          periodStart = this.convertStripeTimestamp(subscription.billing_cycle_anchor);
          this.logger.log(`Using billing_cycle_anchor as fallback: ${subscription.billing_cycle_anchor}`);
        } else {
          periodStart = this.convertStripeTimestamp(subscription.created);
          this.logger.log(`Using created timestamp as fallback: ${subscription.created}`);
        }
        
        if (subscriptionItem && (subscriptionItem as any).current_period_end) {
          periodEnd = this.convertStripeTimestamp((subscriptionItem as any).current_period_end);
          this.logger.log(`Found current_period_end in subscription item: ${(subscriptionItem as any).current_period_end}`);
        }
        
        if (periodStart) {
          userSubscription.currentPeriodStart = periodStart;
          this.logger.log(`Updated currentPeriodStart: ${userSubscription.currentPeriodStart}`);
        }
        
        if (periodEnd) {
          userSubscription.currentPeriodEnd = periodEnd;
          this.logger.log(`Updated currentPeriodEnd: ${userSubscription.currentPeriodEnd}`);
        }
        
        // Safely handle canceled_at date
        const canceledAt = this.convertStripeTimestamp(subscription.canceled_at);
        if (canceledAt) {
          userSubscription.canceledAt = canceledAt;
        }
        
        // Safely handle ended_at date
        const endedAt = this.convertStripeTimestamp(subscription.ended_at);
        if (endedAt) {
          userSubscription.endedAt = endedAt;
        }

        // Reset failed payment count if subscription becomes active again
        if (userSubscription.status === SubscriptionStatus.ACTIVE && 
            previousStatus === SubscriptionStatus.PAST_DUE) {
          userSubscription.failedPaymentCount = 0;
        }

        userSubscription.metadata = subscription.metadata;

        await this.subscriptionRepository.save(userSubscription);

        this.logger.log(`Subscription updated for user: ${userSubscription.userId}`, {
          subscriptionId: subscription.id,
          previousStatus,
          newStatus: userSubscription.status,
          failedPaymentCount: userSubscription.failedPaymentCount,
        });
      } else {
        this.logger.warn(`Subscription not found in database: ${subscription.id}`);
      }

      this.logger.log(`Subscription updated processed: ${subscription.id}`);
    } catch (error) {
      this.logger.error(`Failed to process subscription updated: ${subscription.id}`, error);
      throw error;
    }
  }

  /**
   * Handle subscription deleted event
   */
  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      this.logger.log(`Processing subscription deleted: ${subscription.id}`);

      const userSubscription = await this.subscriptionRepository.findOne({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (userSubscription) {
        userSubscription.status = SubscriptionStatus.CANCELED;
        userSubscription.canceledAt = new Date();
        userSubscription.endedAt = new Date();

        await this.subscriptionRepository.save(userSubscription);

        this.logger.log(`Subscription deleted for user: ${userSubscription.userId}`, {
          subscriptionId: subscription.id,
          canceledAt: userSubscription.canceledAt,
        });
      } else {
        this.logger.warn(`Subscription not found in database: ${subscription.id}`);
      }

      this.logger.log(`Subscription deleted processed: ${subscription.id}`);
    } catch (error) {
      this.logger.error(`Failed to process subscription deleted: ${subscription.id}`, error);
      throw error;
    }
  }

  /**
   * Handle subscription trial will end event
   */
  async handleSubscriptionTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    try {
      this.logger.log(`Processing subscription trial will end: ${subscription.id}`);

      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;

      const user = await this.userRepository.findOne({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        const userSubscription = await this.subscriptionRepository.findOne({
          where: { stripeSubscriptionId: subscription.id },
        });

        if (userSubscription) {
          this.logger.log(`Trial ending soon for user: ${user.id}`, {
            subscriptionId: subscription.id,
            trialEnd: userSubscription.trialEndDate,
            planId: userSubscription.planId,
            amount: userSubscription.amount,
          });

          // Here you could send email notifications
          // await this.emailService.sendTrialEndingNotification(user, userSubscription);
        }
      } else {
        this.logger.warn(`User not found for customer: ${customerId}`);
      }

      this.logger.log(`Subscription trial will end processed: ${subscription.id}`);
    } catch (error) {
      this.logger.error(`Failed to process subscription trial will end: ${subscription.id}`, error);
      throw error;
    }
  }

  /**
   * Map Stripe subscription status to our enum
   */
  private mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
    switch (status) {
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'unpaid':
        return SubscriptionStatus.UNPAID;
      case 'incomplete':
        return SubscriptionStatus.INCOMPLETE;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(payload: Buffer | string, signature: string): Promise<void> {
    try {
      const event = this.constructEvent(payload, signature);
      
      // Log the webhook event (may return null if logging is disabled)
      const loggedEvent = await this.logWebhookEvent(event.id, event.type, event.data);

      // Update processing status to processing (only if logging is enabled)
      if (loggedEvent) {
        await this.updateWebhookEventStatus(event.id, WebhookProcessingStatus.PENDING);
      }

      // Process the event based on type
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

        case 'invoice.upcoming':
          await this.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
          break;

        case 'payment_method.attached':
          await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
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

        case 'customer.subscription.trial_will_end':
          await this.handleSubscriptionTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;
          
        case 'payment_intent.created':
          this.logger.log(`Payment intent created: ${(event.data.object as Stripe.PaymentIntent).id}`, {
            paymentIntentId: (event.data.object as Stripe.PaymentIntent).id,
            amount: (event.data.object as Stripe.PaymentIntent).amount / 100,
            currency: (event.data.object as Stripe.PaymentIntent).currency,
            status: (event.data.object as Stripe.PaymentIntent).status,
            customer: (event.data.object as Stripe.PaymentIntent).customer,
            description: (event.data.object as Stripe.PaymentIntent).description,
          });
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.canceled':
          await this.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.refunded':
          await this.handleChargeRefunded(event.data.object as Stripe.Charge);
          break;

        default:
          this.logger.warn(`⚠️  UNHANDLED WEBHOOK EVENT: ${event.type}`, {
            eventId: event.id,
            eventType: event.type,
            objectId: (event.data.object as any)?.id,
            objectType: (event.data.object as any)?.object,
          });
      }

      // Mark as completed (only if logging is enabled)
      if (loggedEvent) {
        await this.updateWebhookEventStatus(event.id, WebhookProcessingStatus.COMPLETED);
      }

      this.logger.log(`Webhook event processed successfully: ${event.id}`);
    } catch (error) {
      this.logger.error('Failed to process webhook event', error);
      
      // Check if webhook logging is enabled before trying to update status
      const webhookLoggingEnabled = process.env.STRIPE_WEBHOOK_LOGGING_ENABLED === 'true';
      
      // Try to update status if logging is enabled and we have the event ID
      if (webhookLoggingEnabled) {
        try {
          if (error.message && error.message.includes('event.id')) {
            const eventId = error.message.match(/event\.id:\s*(\w+)/)?.[1];
            if (eventId) {
              await this.updateWebhookEventStatus(
                eventId, 
                WebhookProcessingStatus.FAILED,
                error.message
              );
            }
          }
        } catch (updateError) {
          this.logger.error('Failed to update webhook event status', updateError);
        }
      }

      throw error;
    }
  }
}