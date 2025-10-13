export interface StripePlan {
  name: string;
  description: string;
  amount: number;
  currency: string;
  type: 'subscription' | 'one-time';
  interval?: 'day' | 'week' | 'month' | 'year';
}