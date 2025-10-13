import { StripePlan } from '../interfaces/stripe-plan.interface';

export const STRIPE_PLANS: StripePlan[] = [
  {
    name: 'plan 1',
    description: 'Basic monthly plan',
    amount: 12900, // cents ($129 instead of $99)
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
  {
    name: 'plan 2',
    description: 'Pro monthly plan with advanced features',
    amount: 19900, // cents
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
  {
    name: 'plan 3',
    description: '1000 credits one-time purchase',
    amount: 39900,
    currency: 'usd',
    type: 'one-time',
  },
    {
    name: 'plan 34',
    description: '1000 credits one-time purchase',
    amount: 79900,
    currency: 'usd',
    type: 'one-time',
  },
];