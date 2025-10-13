import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { StripeService, CreatePaymentSessionData, CreateSubscriptionSessionData } from './stripe.service';

class CreatePaymentSessionDto {
  priceId: string;
  mode: 'payment' | 'subscription';
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

class CreateSubscriptionSessionDto {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}

class CreatePortalSessionDto {
  customerId: string;
  returnUrl: string;
}

@ApiTags('stripe')
@Controller('stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(private readonly stripeService: StripeService) {}

  @Post('session')
  @ApiOperation({ summary: 'Create a payment session' })
  @ApiBody({ type: CreatePaymentSessionDto })
  @ApiResponse({
    status: 201,
    description: 'Payment session created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid parameters',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Stripe not configured',
  })
  async createPaymentSession(@Body() data: CreatePaymentSessionDto) {
    try {
      if (!this.stripeService.isConfigured()) {
        throw new HttpException(
          'Payment service is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const session = await this.stripeService.createPaymentSession(data);
      
      return {
        success: true,
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('Failed to create payment session', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to create payment session',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('subscription-session')
  @ApiOperation({ summary: 'Create a subscription session' })
  @ApiBody({ type: CreateSubscriptionSessionDto })
  @ApiResponse({
    status: 201,
    description: 'Subscription session created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid parameters',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Stripe not configured',
  })
  async createSubscriptionSession(@Body() data: CreateSubscriptionSessionDto) {
    try {
      if (!this.stripeService.isConfigured()) {
        throw new HttpException(
          'Payment service is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const session = await this.stripeService.createSubscriptionSession(data);
      
      return {
        success: true,
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('Failed to create subscription session', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to create subscription session',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('plans')
  @ApiOperation({ summary: 'Get available pricing plans' })
  @ApiResponse({
    status: 200,
    description: 'List of available plans',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Stripe not configured',
  })
  async getPlans() {
    try {
      if (!this.stripeService.isConfigured()) {
        throw new HttpException(
          'Payment service is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const prices = await this.stripeService.listPrices();
      
      return {
        success: true,
        plans: prices.map(price => ({
          id: price.id,
          amount: price.unit_amount,
          currency: price.currency,
          interval: price.recurring?.interval || null,
          type: price.recurring ? 'subscription' : 'one-time',
          product: price.product,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get plans', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to retrieve plans',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('portal-session')
  @ApiOperation({ summary: 'Create a customer portal session' })
  @ApiBody({ type: CreatePortalSessionDto })
  @ApiResponse({
    status: 201,
    description: 'Portal session created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid parameters',
  })
  @ApiResponse({
    status: 503,
    description: 'Service unavailable - Stripe not configured',
  })
  async createPortalSession(@Body() data: CreatePortalSessionDto) {
    try {
      if (!this.stripeService.isConfigured()) {
        throw new HttpException(
          'Payment service is not available',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const session = await this.stripeService.createPortalSession(
        data.customerId,
        data.returnUrl,
      );
      
      return {
        success: true,
        url: session.url,
      };
    } catch (error) {
      this.logger.error('Failed to create portal session', error);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to create portal session',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Stripe service status' })
  @ApiResponse({
    status: 200,
    description: 'Service status information',
  })
  getStatus() {
    const isConfigured = this.stripeService.isConfigured();
    
    return {
      success: true,
      configured: isConfigured,
      status: isConfigured ? 'active' : 'disabled',
      message: isConfigured 
        ? 'Stripe service is active and ready'
        : 'Stripe service is disabled or not configured',
    };
  }
}