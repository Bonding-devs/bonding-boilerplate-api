import { registerAs } from '@nestjs/config';
import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import validateConfig from 'src/utils/validate-config';

export type StripeConfig = {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  apiVersion: string;
  paymentsMode: 'single' | 'subscription' | 'both' | 'none';
};

class EnvironmentVariablesValidator {
  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY: string;

  @IsOptional()
  @IsString()
  STRIPE_PUBLISHABLE_KEY: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET: string;

  @IsOptional()
  @IsString()
  STRIPE_API_VERSION: string;

  @IsOptional()
  @IsEnum(['single', 'subscription', 'both', 'none'])
  PAYMENTS_MODE: 'single' | 'subscription' | 'both' | 'none';
}

export default registerAs<StripeConfig>('stripe', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  const paymentsMode = (process.env.PAYMENTS_MODE as StripeConfig['paymentsMode']) || 'none';

  return {
    secretKey: process.env.STRIPE_SECRET_KEY || undefined,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,
    apiVersion: process.env.STRIPE_API_VERSION || '2024-06-20',
    paymentsMode,
  };
});