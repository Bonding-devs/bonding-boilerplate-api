import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { UserEntity } from '../../../users/infrastructure/persistence/relational/entities/user.entity';
import { 
  StripeTransactionEntity,
  TransactionStatus,
  TransactionType
} from '../entities';

@Injectable()
export class StripeTransactionService {
  private readonly logger = new Logger(StripeTransactionService.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(StripeTransactionEntity)
    private transactionRepository: Repository<StripeTransactionEntity>,
  ) {}

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
   * Handle checkout session completed webhook
   */
  async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    try {
      this.logger.log(`Processing checkout session completed: ${session.id}`);

      if (session.customer) {
        const customerId = typeof session.customer === 'string' 
          ? session.customer 
          : session.customer.id;

        const user = await this.userRepository.findOne({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
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
   * Handle invoice payment succeeded webhook
   */
  async handleInvoicePaymentSucceeded(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
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
          // Get fee information from payment intent if available
          let stripeFee = 0;
          let netAmount = (invoice.amount_paid || 0) / 100;
          
          if (invoice.payment_intent && typeof invoice.payment_intent === 'string') {
            try {
              const paymentIntent = await stripe.paymentIntents.retrieve(
                invoice.payment_intent,
                { expand: ['latest_charge'] }
              );
              
              if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object') {
                const charge = paymentIntent.latest_charge as Stripe.Charge;
                if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
                  const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction;
                  stripeFee = balanceTransaction.fee / 100;
                  netAmount = balanceTransaction.net / 100;
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
            (invoice.amount_paid || 0) / 100,
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
            undefined,
            stripeFee,
            netAmount,
            new Date()
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
   * Handle payment intent succeeded event
   */
  async handlePaymentIntentSucceeded(stripe: Stripe, paymentIntent: Stripe.PaymentIntent): Promise<void> {
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
          // Skip if it's a subscription payment to avoid duplicates
          let isSubscriptionPayment = false;
          if (paymentIntent.invoice) {
            isSubscriptionPayment = true;
            this.logger.log(`Payment intent ${paymentIntent.id} is for subscription, skipping to avoid duplicate`);
          }

          if (!isSubscriptionPayment) {
            // Get fee information from charge if available
            let stripeFee = 0;
            let netAmount = paymentIntent.amount / 100;
            
            try {
              const paymentIntentExpanded = await stripe.paymentIntents.retrieve(
                paymentIntent.id,
                { expand: ['latest_charge'] }
              );
              
              if (paymentIntentExpanded.latest_charge && typeof paymentIntentExpanded.latest_charge === 'object') {
                const charge = paymentIntentExpanded.latest_charge as Stripe.Charge;
                if (charge.balance_transaction && typeof charge.balance_transaction === 'object') {
                  const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction;
                  stripeFee = balanceTransaction.fee / 100;
                  netAmount = balanceTransaction.net / 100;
                }
              }
            } catch (error) {
              this.logger.warn(`Could not retrieve charge fee details: ${error.message}`);
            }

            await this.recordTransaction(
              user.id,
              paymentIntent.id,
              TransactionType.PAYMENT,
              paymentIntent.amount / 100,
              paymentIntent.currency,
              TransactionStatus.COMPLETED,
              paymentIntent.description || 'Payment completed',
              {
                paymentMethodId: paymentIntent.payment_method,
                metadata: paymentIntent.metadata,
              },
              undefined,
              stripeFee,
              netAmount,
              new Date()
            );
          }
        }
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
            paymentIntent.amount / 100,
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
        }
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
            paymentIntent.amount / 100,
            paymentIntent.currency,
            TransactionStatus.CANCELLED,
            paymentIntent.description || 'Payment canceled',
            {
              paymentMethodId: paymentIntent.payment_method,
              cancellationReason: paymentIntent.cancellation_reason,
              metadata: paymentIntent.metadata,
            }
          );
        }
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
          const refund = charge.refunds?.data?.[0];
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
        }
      }

      this.logger.log(`Refunded charge processed: ${charge.id}`);
    } catch (error) {
      this.logger.error(`Failed to process charge refunded: ${charge.id}`, error);
      throw error;
    }
  }

  /**
   * Handle invoice payment failed event
   */
  async handleInvoicePaymentFailed(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
    try {
      this.logger.error(`Processing invoice payment failed: ${invoice.id}`, {
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
          // Get failure reason from payment intent if available
          let failureReason = 'Unknown failure reason';
          if (invoice.payment_intent && typeof invoice.payment_intent === 'string') {
            try {
              const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
              if (paymentIntent.last_payment_error) {
                failureReason = paymentIntent.last_payment_error.message || 
                  paymentIntent.last_payment_error.code || 
                  'Payment failed';
              }
            } catch (error) {
              this.logger.warn(`Could not retrieve payment intent details: ${error.message}`);
            }
          }

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
        }
      }

      this.logger.log(`Invoice payment failed processed: ${invoice.id}`);
    } catch (error) {
      this.logger.error(`Failed to process invoice payment failed: ${invoice.id}`, error);
      throw error;
    }
  }
}