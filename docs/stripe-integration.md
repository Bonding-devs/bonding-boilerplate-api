# Stripe Integration Module

This module provides a comprehensive Stripe integration for the NestJS boilerplate, supporting both one-time payments and subscriptions with webhook handling, transaction logging, and customer management.

## Table of Contents

- [Features](#features)
- [Setup and Configuration](#setup-and-configuration)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Webhook Integration](#webhook-integration)
- [Usage Examples](#usage-examples)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Features

- ✅ **Payment Processing**: One-time payments and subscriptions
- ✅ **Customer Management**: Automatic Stripe customer creation and management
- ✅ **Payment Methods**: Store and manage customer payment methods
- ✅ **Transaction Logging**: Complete transaction history with status tracking
- ✅ **Webhook Processing**: Secure webhook event handling with retry logic
- ✅ **Customer Portal**: Stripe-hosted customer portal for subscription management
- ✅ **Comprehensive Logging**: Detailed logging for debugging and monitoring
- ✅ **TypeScript Support**: Full type safety and intellisense
- ✅ **Database Integration**: TypeORM entities for data persistence

## Setup and Configuration

### 1. Environment Variables

Copy the Stripe configuration section from `env-example-relational` to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_API_VERSION=2024-06-20
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
WEBHOOK_ENDPOINT_URL=https://yourdomain.com/api/stripe/webhook
PAYMENTS_MODE=both  # Options: none, single, subscription, both
```

### 2. Database Migration

Run the database migration to create the required tables:

```bash
npm run migration:run
```

This creates the following tables:
- `payment_method`: Store customer payment methods
- `stripe_transaction`: Log all transactions and their status
- `webhook_event`: Track webhook events and processing status
- Updates `users` table with `stripeCustomerId` field

### 3. Automatic Stripe Setup

Use the setup script to automatically create products and prices in Stripe:

```bash
npx ts-node src/modules/stripe/scripts/setupStripe.ts
```

This script will:
- Create products and prices based on `stripe.plans.config.ts`
- Generate a `.stripe.generated.env` file with price IDs
- Set up webhook endpoints (for public URLs)

### 4. Module Import

The Stripe module is automatically imported in the main application. No additional setup required.

## Database Schema

### Tables Created

#### `payment_method`
```sql
- id: UUID (Primary Key)
- userId: Integer (Foreign Key to users)
- stripePaymentMethodId: String (Unique)
- type: String (default: 'card')
- last4: String (nullable)
- brand: String (nullable)
- expMonth: Integer (nullable)
- expYear: Integer (nullable)
- isDefault: Boolean (default: false)
- createdAt: Timestamp
- updatedAt: Timestamp
```

#### `stripe_transaction`
```sql
- id: UUID (Primary Key)
- userId: Integer (Foreign Key to users)
- stripePaymentIntentId: String (nullable, indexed)
- stripeSessionId: String (nullable, indexed)
- amount: Decimal(10,2)
- currency: String(3, default: 'usd')
- status: Enum (pending, processing, completed, failed, refunded, cancelled)
- transactionType: Enum (payment, subscription, refund, payout, setup)
- description: Text (nullable)
- metadata: JSON (nullable)
- stripeFee: Decimal(10,2, nullable)
- netAmount: Decimal(10,2, nullable)
- failureReason: Text (nullable)
- processedAt: Timestamp (nullable)
- createdAt: Timestamp
- updatedAt: Timestamp
```

#### `webhook_event`
```sql
- id: UUID (Primary Key)
- stripeEventId: String (Unique, indexed)
- eventType: String (indexed)
- processingStatus: Enum (pending, completed, failed, retrying)
- errorMessage: Text (nullable)
- retryCount: Integer (default: 0)
- rawPayload: JSON (nullable)
- processedAt: Timestamp (nullable)
- createdAt: Timestamp
```

#### Users Table Update
```sql
ALTER TABLE users ADD COLUMN stripeCustomerId VARCHAR(255) UNIQUE;
```

## API Endpoints

### Payment Operations

#### Create Payment Session
```http
POST /api/stripe/payment-session
Content-Type: application/json

{
  "priceId": "price_1234567890",
  "mode": "payment",
  "successUrl": "https://your-app.com/success",
  "cancelUrl": "https://your-app.com/cancel",
  "customerEmail": "customer@example.com",
  "metadata": {
    "orderId": "order_123"
  }
}
```

#### Create Subscription Session
```http
POST /api/stripe/subscription-session
Content-Type: application/json

{
  "priceId": "price_1234567890",
  "successUrl": "https://your-app.com/success",
  "cancelUrl": "https://your-app.com/cancel",
  "customerEmail": "customer@example.com",
  "trialPeriodDays": 7
}
```

### Customer Management

#### Get Available Plans
```http
GET /api/stripe/plans
```

#### Create Customer Portal Session
```http
POST /api/stripe/portal-session
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "returnUrl": "https://your-app.com/account"
}
```

#### Get User Payment Methods
```http
GET /api/stripe/user/{userId}/payment-methods
```

#### Get User Transaction History
```http
GET /api/stripe/user/{userId}/transactions?limit=50
```

#### Create Stripe Customer for User
```http
POST /api/stripe/user/{userId}/customer
Content-Type: application/json

{
  "name": "John Doe"
}
```

### Service Status

#### Check Stripe Service Status
```http
GET /api/stripe/status
```

### Webhook Endpoint

#### Stripe Webhook Handler
```http
POST /api/stripe/webhook
Content-Type: application/json
Stripe-Signature: t=timestamp,v1=signature

{
  // Stripe webhook payload
}
```

## Webhook Integration

### Supported Events

The module automatically handles the following Stripe webhook events:

- `checkout.session.completed`: Process successful payments
- `invoice.payment_succeeded`: Handle subscription payments
- `payment_method.attached`: Save customer payment methods
- `customer.subscription.created`: Log subscription creation
- `customer.subscription.updated`: Track subscription changes
- `customer.subscription.deleted`: Handle subscription cancellation
- `payment_intent.succeeded`: Log successful payments
- `payment_intent.payment_failed`: Handle payment failures

### Webhook Security

- All webhooks are verified using Stripe signatures
- Events are logged in the database with processing status
- Failed events can be retried automatically
- Duplicate events are handled gracefully

### Local Testing

For local development, use Stripe CLI to forward webhooks:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

This will provide a webhook secret for testing.

## Usage Examples

### Frontend Integration

#### Create a Payment Session
```javascript
// Frontend code example
const response = await fetch('/api/stripe/payment-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    priceId: 'price_1234567890',
    mode: 'payment',
    successUrl: window.location.origin + '/success',
    cancelUrl: window.location.origin + '/cancel',
    customerEmail: user.email
  })
});

const { sessionId, url } = await response.json();

// Redirect to Stripe Checkout
window.location.href = url;
```

#### Using Stripe.js (Alternative)
```javascript
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe('pk_test_your_publishable_key');

const response = await fetch('/api/stripe/payment-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    priceId: 'price_1234567890',
    mode: 'subscription',
    successUrl: window.location.origin + '/success',
    cancelUrl: window.location.origin + '/cancel'
  })
});

const { sessionId } = await response.json();

const { error } = await stripe.redirectToCheckout({
  sessionId: sessionId
});
```

### Backend Service Integration

#### Injecting StripeService
```typescript
import { Injectable } from '@nestjs/common';
import { StripeService } from './modules/stripe/stripe.service';

@Injectable()
export class OrderService {
  constructor(private readonly stripeService: StripeService) {}

  async processPayment(userId: number, amount: number) {
    // Create customer if not exists
    const user = await this.getUserById(userId);
    await this.stripeService.createCustomerForUser(user);

    // Record transaction
    const transaction = await this.stripeService.recordTransaction(
      userId,
      paymentIntentId,
      TransactionType.PAYMENT,
      amount,
      'usd',
      TransactionStatus.PENDING,
      'Order payment'
    );

    return transaction;
  }
}
```

## Testing

### Test Cards

Use Stripe's test cards for development:

- Success: `4242424242424242`
- Decline: `4000000000000002`
- Requires authentication: `4000002500003155`

### Testing Webhooks

1. Use Stripe CLI for local testing:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

2. Trigger test events:
```bash
stripe trigger checkout.session.completed
```

3. Check webhook logs in your application logs and database.

## Troubleshooting

### Common Issues

#### Webhook Signature Verification Failed
- Ensure `STRIPE_WEBHOOK_SECRET` is correctly set
- Check that webhook endpoint is receiving raw body (not parsed JSON)
- Verify the endpoint URL matches your Stripe webhook configuration

#### Payment Session Creation Fails
- Verify `STRIPE_SECRET_KEY` is valid and has the correct permissions
- Check that `PAYMENTS_MODE` allows the type of payment you're creating
- Ensure price IDs exist and are active in Stripe

#### Database Connection Issues
- Run migrations: `npm run migration:run`
- Check database connectivity
- Verify TypeORM configuration

#### API Endpoints Return 503 (Service Unavailable)
- Check if `PAYMENTS_MODE` is set to something other than 'none'
- Verify Stripe configuration is complete
- Check application logs for specific error messages

### Debugging

Enable detailed logging by setting log level to `debug` in your application configuration. The Stripe module provides comprehensive logging for:

- Payment session creation
- Webhook event processing
- Transaction recording
- Customer management operations

### Support

For issues related to:
- **Stripe Integration**: Check [Stripe Documentation](https://stripe.com/docs)
- **Webhook Configuration**: See [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- **Test Cards**: Use [Stripe Test Cards](https://stripe.com/docs/testing#cards)

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | Yes | - | Stripe secret API key |
| `STRIPE_PUBLISHABLE_KEY` | Yes | - | Stripe publishable key (for frontend) |
| `STRIPE_WEBHOOK_SECRET` | Yes | - | Webhook endpoint secret |
| `STRIPE_API_VERSION` | No | 2024-06-20 | Stripe API version |
| `PAYMENTS_MODE` | No | both | Payment modes: none, single, subscription, both |
| `WEBHOOK_ENDPOINT_URL` | No | - | Public webhook URL for setup script |

### Payment Modes

- **none**: Disable all payment functionality
- **single**: Enable only one-time payments
- **subscription**: Enable only subscription payments
- **both**: Enable both payment types (recommended)

### Stripe Plans Configuration

Edit `src/modules/stripe/config/stripe.plans.config.ts` to define your products and pricing:

```typescript
export const STRIPE_PLANS: StripePlan[] = [
  {
    id: 'price_basic_monthly',
    name: 'Basic Plan', 
    description: 'Basic monthly subscription',
    amount: 9900, // $99.00 in cents
    currency: 'usd',
    interval: 'month',
    intervalCount: 1,
    metadata: {},
    productId: 'prod_basic'
  }
  // ... more plans
];
```

## Security Considerations

1. **Webhook Signatures**: Always verify webhook signatures
2. **API Keys**: Never expose secret keys in frontend code
3. **HTTPS**: Use HTTPS for all webhook endpoints in production
4. **Environment Variables**: Store sensitive data in environment variables
5. **Database Access**: Limit database access to authenticated users
6. **Logging**: Avoid logging sensitive payment information

---

This integration provides a solid foundation for payment processing with Stripe. For advanced use cases, you can extend the service with additional Stripe features like Connect, Terminal, or Issuing APIs.