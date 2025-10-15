export interface StripePlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
  metadata?: Record<string, string>;
  productId: string;
}