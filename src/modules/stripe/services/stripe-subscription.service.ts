import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { UserEntity } from '../../../users/infrastructure/persistence/relational/entities/user.entity';
import { 
  UserSubscriptionEntity,
  SubscriptionStatus
} from '../entities';

@Injectable()
export class StripeSubscriptionService {
  private readonly logger = new Logger(StripeSubscriptionService.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(UserSubscriptionEntity)
    private subscriptionRepository: Repository<UserSubscriptionEntity>,
  ) {}

  /**
   * Safely convert a Stripe timestamp to a Date object
   */
  private convertStripeTimestamp(timestamp: number | null | undefined): Date | null {
    if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
      return null;
    }
    return new Date(timestamp * 1000);
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
   * Handle subscription created event
   */
  async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    try {
      this.logger.log(`Processing subscription created: ${subscription.id}`);

      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id;

      const user = await this.userRepository.findOne({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        // Get plan information
        const priceId = subscription.items.data[0]?.price.id;
        const price = subscription.items.data[0]?.price;

        // Get product name safely
        let planName = '';
        if (price?.nickname) {
          planName = price.nickname;
        } else if (price?.product) {
          if (typeof price.product === 'string') {
            planName = price.product;
          } else if (price.product && typeof price.product === 'object') {
            const product = price.product as any;
            planName = product.name || product.id || 'Unknown Plan';
          }
        }

        // Create new subscription record
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
        
        // Extract period dates from subscription item
        const subscriptionItem = subscription.items?.data?.[0];
        const periodStart = this.convertStripeTimestamp((subscriptionItem as any)?.current_period_start || subscription.billing_cycle_anchor || subscription.created);
        const periodEnd = this.convertStripeTimestamp((subscriptionItem as any)?.current_period_end);
        
        if (periodStart) {
          userSubscription.currentPeriodStart = periodStart;
        }
        
        if (periodEnd) {
          userSubscription.currentPeriodEnd = periodEnd;
        }
        
        // Handle trial dates
        const trialStart = this.convertStripeTimestamp(subscription.trial_start);
        const trialEnd = this.convertStripeTimestamp(subscription.trial_end);
        
        if (trialStart && trialEnd) {
          userSubscription.trialStartDate = trialStart;
          userSubscription.trialEndDate = trialEnd;
        }

        userSubscription.metadata = subscription.metadata;

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
    } catch (error) {
      this.logger.error(`Failed to process subscription created: ${subscription.id}`, error);
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
        
        // Update subscription data
        userSubscription.status = this.mapStripeSubscriptionStatus(subscription.status);
        
        // Handle period dates from subscription items
        const subscriptionItem = subscription.items?.data?.[0];
        const periodStart = this.convertStripeTimestamp((subscriptionItem as any)?.current_period_start || subscription.billing_cycle_anchor || subscription.created);
        const periodEnd = this.convertStripeTimestamp((subscriptionItem as any)?.current_period_end);
        
        if (periodStart) {
          userSubscription.currentPeriodStart = periodStart;
        }
        
        if (periodEnd) {
          userSubscription.currentPeriodEnd = periodEnd;
        }
        
        // Handle canceled and ended dates
        const canceledAt = this.convertStripeTimestamp(subscription.canceled_at);
        if (canceledAt) {
          userSubscription.canceledAt = canceledAt;
        }
        
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
    } catch (error) {
      this.logger.error(`Failed to process subscription trial will end: ${subscription.id}`, error);
      throw error;
    }
  }

  /**
   * Handle invoice payment failed to update subscription status
   */
  async handleInvoicePaymentFailedForSubscription(invoice: Stripe.Invoice): Promise<void> {
    try {
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
            userId: subscription.userId,
            failedPaymentCount: subscription.failedPaymentCount,
            amount: invoice.amount_due / 100,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update subscription for failed payment: ${invoice.id}`, error);
      throw error;
    }
  }
}