import { StripePlan } from '../interfaces/stripe-plan.interface';

export const STRIPE_PLANS: StripePlan[] = [
  {
    id: 'price_1_monthly', // This will be the actual Stripe price ID
    name: 'Basic Plan',
    description: 'Basic monthly plan',
    amount: 12900, // cents ($129)
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    metadata: {},
    productId: 'prod_basic',
  },
  {
    id: 'price_2_monthly',
    name: 'Pro Plan',
    description: 'Pro monthly plan with advanced features',
    amount: 19900, // cents
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    metadata: {},
    productId: 'prod_pro',
  },
  {
    id: 'price_3_onetime',
    name: '1000 Credits',
    description: '1000 credits one-time purchase',
    amount: 39900,
    currency: 'usd',
    metadata: {},
    productId: 'prod_credits_1000',
  },
  {
    id: 'price_4_onetime',
    name: '2500 Credits',
    description: '2500 credits one-time purchase',
    amount: 79900,
    currency: 'usd',
    metadata: {},
    productId: 'prod_credits_2500',
  },
];