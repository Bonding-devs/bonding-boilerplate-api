import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import Stripe from 'stripe';
import { StripePlan } from '../interfaces/stripe-plan.interface';
import { PlanEntity } from '../entities';
import { CreatePaymentSessionData, CreateSubscriptionSessionData } from './stripe-payment.service';

@Injectable()
export class StripePlanService {
  private readonly logger = new Logger(StripePlanService.name);

  constructor(
    @InjectRepository(PlanEntity)
    private planRepository: Repository<PlanEntity>,
  ) {}

  /**
   * Get all active plans from database
   */
  async getPlans(): Promise<PlanEntity[]> {
    return await this.planRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' }
    });
  }

  /**
   * Get plans by type (subscription or one-time)
   */
  async getPlansByType(type: 'subscription' | 'one-time'): Promise<PlanEntity[]> {
    const whereCondition = type === 'subscription' 
      ? { isActive: true, interval: Not('one-time') }
      : { isActive: true, interval: 'one-time' };

    return await this.planRepository.find({
      where: whereCondition,
      order: { sortOrder: 'ASC', createdAt: 'ASC' }
    });
  }

  /**
   * Get a plan by its Stripe price ID
   */
  async getPlanByStripePriceId(stripePriceId: string): Promise<PlanEntity | null> {
    return await this.planRepository.findOne({
      where: { stripePriceId, isActive: true }
    });
  }

  /**
   * Get a plan by its database ID
   */
  async getPlanById(id: string): Promise<PlanEntity | null> {
    return await this.planRepository.findOne({
      where: { id, isActive: true }
    });
  }

  /**
   * Get a specific plan by Stripe price ID (from Stripe directly)
   */
  async getStripePlan(stripe: Stripe, priceId: string): Promise<StripePlan | null> {
    try {
      const price = await stripe.prices.retrieve(priceId, {
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
}