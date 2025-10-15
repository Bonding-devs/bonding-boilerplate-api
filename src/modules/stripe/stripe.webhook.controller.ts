import {
  Controller,
  Post,
  Req,
  HttpException,
  HttpStatus,
  Logger,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { StripeService } from './stripe.service';

@ApiTags('stripe-webhooks')
@Controller('v1/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Handle Stripe webhook events' })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid webhook signature',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Stripe not configured',
  })
  async handleWebhook(
    @Req() request: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    try {
      if (!this.stripeService.isConfigured()) {
        this.logger.warn('Webhook received but Stripe is not configured');
        throw new HttpException(
          'Payment service is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      if (!signature) {
        this.logger.error('Webhook signature missing');
        throw new HttpException(
          'Webhook signature required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get raw body as Buffer
      const body = request.body;
      if (!Buffer.isBuffer(body)) {
        this.logger.error('Webhook body must be raw buffer');
        throw new HttpException(
          'Invalid webhook payload format',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.stripeService.handleWebhookEvent(body, signature);

      this.logger.log('Webhook processed successfully');
      
      return {
        success: true,
        message: 'Webhook processed successfully',
      };
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Handle Stripe signature verification errors
      if (error.message?.includes('signature')) {
        throw new HttpException(
          'Invalid webhook signature',
          HttpStatus.BAD_REQUEST,
        );
      }
      
      throw new HttpException(
        'Webhook processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}