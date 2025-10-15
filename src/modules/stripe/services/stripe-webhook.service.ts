import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { 
  WebhookEventEntity,
  WebhookProcessingStatus
} from '../entities';

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(WebhookEventEntity)
    private webhookEventRepository: Repository<WebhookEventEntity>,
  ) {}

  /**
   * Construct event from webhook payload
   */
  constructEvent(stripe: Stripe, payload: string | Buffer, signature: string): Stripe.Event {
    const endpointSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!endpointSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    try {
      const event = stripe.webhooks.constructEvent(
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
}