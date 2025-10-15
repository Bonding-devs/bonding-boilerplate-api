import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { UserEntity } from '../../../users/infrastructure/persistence/relational/entities/user.entity';
import { PaymentMethodEntity } from '../entities';

@Injectable()
export class StripeCustomerService {
  private readonly logger = new Logger(StripeCustomerService.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(PaymentMethodEntity)
    private paymentMethodRepository: Repository<PaymentMethodEntity>,
  ) {}

  /**
   * Create or retrieve Stripe customer for user
   */
  async createCustomerForUser(stripe: Stripe, user: UserEntity, name?: string): Promise<string> {
    // Return existing customer ID if already exists
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    try {
      const customer = await stripe.customers.create({
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
  async createCustomerForUserData(stripe: Stripe, userData: {
    id: number | string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }, name?: string): Promise<string> {
    try {
      // Check if user already has a Stripe customer
      const existingUser = await this.userRepository.findOne({
        where: { id: userData.id.toString() },
      });

      if (existingUser?.stripeCustomerId) {
        return existingUser.stripeCustomerId;
      }

      const customer = await stripe.customers.create({
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
}