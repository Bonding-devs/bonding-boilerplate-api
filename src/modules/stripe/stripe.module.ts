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
  providers: [StripeService, PlanRepository],
  exports: [StripeService, PlanRepository],
})
export class StripeModule {}