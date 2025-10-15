import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

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
export class StripePaymentService {
  private readonly logger = new Logger(StripePaymentService.name);

  constructor(
    private configService: ConfigService,
  ) {}

  /**
   * Create a payment session for one-time payments
   */
  async createPaymentSession(stripe: Stripe, data: CreatePaymentSessionData): Promise<Stripe.Checkout.Session> {
    const paymentsMode = this.configService.get<string>('PAYMENTS_MODE', 'none');
    if (paymentsMode !== 'single' && paymentsMode !== 'both') {
      throw new Error('Single payments are not enabled in PAYMENTS_MODE');
    }

    try {
      const session = await stripe.checkout.sessions.create({
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
  async createSubscriptionSession(stripe: Stripe, data: CreateSubscriptionSessionData): Promise<Stripe.Checkout.Session> {
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

      const session = await stripe.checkout.sessions.create(sessionOptions);

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
   * Create customer portal session
   */
  async createPortalSession(stripe: Stripe, customerId: string, returnUrl: string): Promise<Stripe.BillingPortal.Session> {
    try {
      const session = await stripe.billingPortal.sessions.create({
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
   * List all active prices
   */
  async listPrices(stripe: Stripe): Promise<Stripe.Price[]> {
    try {
      const prices = await stripe.prices.list({
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
}