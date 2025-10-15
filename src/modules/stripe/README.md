# Stripe Module Setup Guide

A complete, generic Stripe integration module for NestJS applications supporting both one-time payments and subscriptions.

## 🎯 Features

- **One-time payments** - Single purchases, credit packs, etc.
- **Subscription management** - Recurring billing with trial periods
- **Webhook handling** - Automatic event processing from Stripe
- **Customer portal** - Self-service billing management
- **Configurable modes** - Enable/disable payment types as needed
- **Automatic setup** - Script-based initialization of products and prices
- **Type-safe** - Full TypeScript support with proper interfaces

## 📋 Prerequisites

1. **Stripe Account**: Create an account at [stripe.com](https://stripe.com)
2. **API Keys**: Retrieve your publishable and secret keys from the Stripe dashboard
3. **Webhook Secret**: Optional but recommended for production

## 🚀 Quick Setup

### 1️⃣ Environment Configuration

Copy the Stripe variables from `env-example-relational` to your `.env` file:

```bash
# Stripe credentials
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_API_VERSION=2024-06-20

# Payments module configuration
PAYMENTS_MODE=both  # Options: "single", "subscription", "both", "none"
```

### 2️⃣ Define Your Plans

Edit `/src/modules/stripe/config/stripe.plans.config.ts` to define your products:

```typescript
export const STRIPE_PLANS: StripePlan[] = [
  {
    name: 'Basic Plan',
    description: 'Basic monthly subscription',
    amount: 9900, // $99.00 in cents
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
  {
    name: 'Credit Pack',
    description: '1000 credits one-time purchase',
    amount: 29900, // $299.00 in cents
    currency: 'usd',
    type: 'one-time',
  },
];
```

### 3️⃣ Run Setup Script

Execute the automatic initialization script:

```bash
npm run stripe:init
```

This script will:
- ✅ Validate your Stripe configuration
- ✅ Create products and prices in your Stripe account
- ✅ Generate `.stripe.generated.env` with price IDs
- ✅ Display a summary of created resources

### 4️⃣ Update Environment Variables

Copy the generated price IDs from `.stripe.generated.env` to your main `.env` file.

### 5️⃣ Add to Main Module

The Stripe module is automatically integrated when you follow the integration steps below.