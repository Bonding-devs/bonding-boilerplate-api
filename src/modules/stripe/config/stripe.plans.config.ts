import { StripePlan } from '../interfaces/stripe-plan.interface';

export const STRIPE_PLANS: StripePlan[] = [
  {
    name: 'Basic',
    description: 'Basic monthly plan',
    amount: 9900, // cents
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
  {
    name: 'Pro',
    description: 'Pro monthly plan with advanced features',
    amount: 19900, // cents
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
  {
    name: 'One-Time Credit Pack',
    description: '1000 credits one-time purchase',
    amount: 29900,
    currency: 'usd',
    type: 'one-time',
  },
];