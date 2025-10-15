import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeService } from './stripe.service';
import { StripeController } from './stripe.controller';
import { StripeWebhookController } from './stripe.webhook.controller';
import { PlanRepository } from './repositories/plan.repository';
import { UserEntity } from '../../users/infrastructure/persistence/relational/entities/user.entity';
import { 
  PaymentMethodEntity, 
  StripeTransactionEntity, 
  WebhookEventEntity,
  UserSubscriptionEntity,
  PlanEntity
} from './entities';
import {
  StripeWebhookService,
  StripePaymentService,
  StripeCustomerService,
  StripeSubscriptionService,
  StripeTransactionService,
  StripePlanService
} from './services';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      UserEntity,
      PaymentMethodEntity,
      StripeTransactionEntity,
      WebhookEventEntity,
      UserSubscriptionEntity,
      PlanEntity,
    ]),
  ],
  controllers: [StripeController, StripeWebhookController],
  providers: [
    // Main service (now refactored to delegate to specialized services)
    StripeService,
    
    // Specialized services
    StripeWebhookService,
    StripePaymentService,
    StripeCustomerService,
    StripeSubscriptionService,
    StripeTransactionService,
    StripePlanService,
    
    // Repository
    PlanRepository,
  ],
  exports: [
    StripeService,
    StripeWebhookService,
    StripePaymentService,
    StripeCustomerService,
    StripeSubscriptionService,
    StripeTransactionService,
    StripePlanService,
    PlanRepository,
  ],
})
export class StripeModule {}