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

## 🔧 Integration

Add the StripeModule to your main `app.module.ts`:

```typescript
import { StripeModule } from './modules/stripe/stripe.module';
import stripeConfig from './modules/stripe/config/stripe.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        // ... other configs
        stripeConfig,
      ],
    }),
    // ... other modules
    StripeModule,
  ],
})
export class AppModule {}
```

## 📡 API Endpoints

Once setup is complete, the following endpoints will be available:

### Payment Sessions
```http
POST /api/stripe/session
Content-Type: application/json

{
  "priceId": "price_1234567890",
  "mode": "payment",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel",
  "customerEmail": "customer@example.com"
}
```

### Subscription Sessions
```http
POST /api/stripe/subscription-session
Content-Type: application/json

{
  "priceId": "price_1234567890",
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel",
  "customerEmail": "customer@example.com",
  "trialPeriodDays": 14
}
```

### Available Plans
```http
GET /api/stripe/plans
```

### Customer Portal
```http
POST /api/stripe/portal-session
Content-Type: application/json

{
  "customerId": "cus_1234567890",
  "returnUrl": "https://yourapp.com/account"
}
```

### Service Status
```http
GET /api/stripe/status
```

### Webhooks
```http
POST /api/stripe/webhook
```

## ⚙️ Configuration Modes

Set `PAYMENTS_MODE` in your `.env` file to control functionality:

- **`single`** - Only one-time payments enabled
- **`subscription`** - Only recurring subscriptions enabled  
- **`both`** - All payment types enabled (default)
- **`none`** - Stripe module disabled

## 🔗 Webhook Configuration

### Development
For local development, use [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### Production
1. Go to your [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Create a new webhook endpoint
3. Point it to: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

## 🔄 Handled Webhook Events

The module automatically processes these Stripe events:

- **`checkout.session.completed`** - Payment/subscription completion
- **`invoice.payment_succeeded`** - Successful recurring payment
- **`invoice.payment_failed`** - Failed payment attempt
- **`customer.subscription.created`** - New subscription created
- **`customer.subscription.updated`** - Subscription changes
- **`customer.subscription.deleted`** - Subscription cancelled

## 🎨 Frontend Integration

### React Example
```typescript
// Create a payment session
const response = await fetch('/api/stripe/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    priceId: 'price_1234567890',
    mode: 'payment',
    successUrl: window.location.origin + '/success',
    cancelUrl: window.location.origin + '/cancel',
  }),
});

const { url } = await response.json();
window.location.href = url; // Redirect to Stripe Checkout
```

## 🛠️ Advanced Usage

### Using the Service Directly
```typescript
import { StripeService } from './modules/stripe/stripe.service';

@Injectable()
export class PaymentService {
  constructor(private stripeService: StripeService) {}

  async createCustomPayment() {
    if (!this.stripeService.isConfigured()) {
      throw new Error('Stripe not configured');
    }

    const session = await this.stripeService.createPaymentSession({
      priceId: 'price_1234567890',
      mode: 'payment',
      successUrl: 'https://yourapp.com/success',
      cancelUrl: 'https://yourapp.com/cancel',
    });

    return session.url;
  }
}
```

### Custom Plan Configuration
Create additional plan files for different environments:

```typescript
// stripe.plans.staging.config.ts
export const STRIPE_PLANS_STAGING: StripePlan[] = [
  {
    name: 'Test Plan',
    description: 'Testing subscription',
    amount: 100, // $1.00 for testing
    currency: 'usd',
    interval: 'month',
    type: 'subscription',
  },
];
```

## 🐛 Troubleshooting

### Common Issues

**❌ "Stripe is not configured"**
- Check that `STRIPE_SECRET_KEY` is set in your `.env`
- Verify `PAYMENTS_MODE` is not set to `'none'`

**❌ "Invalid webhook signature"**
- Ensure `STRIPE_WEBHOOK_SECRET` is correctly set
- Verify the webhook is sending to the correct endpoint

**❌ "Price not found"**
- Run `npm run stripe:init` to create missing prices
- Check that price IDs in your code match those in Stripe

**❌ Module import errors**
- Ensure you've added `StripeModule` to your main app module
- Check that the stripe config is loaded in ConfigModule

### Debug Mode
Set `NODE_ENV=development` for detailed logging:

```bash
NODE_ENV=development npm run start:dev
```

## 📚 Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [NestJS Documentation](https://docs.nestjs.com/)

## 🔒 Security Notes

- Never expose your secret key in client-side code
- Always validate webhook signatures in production
- Use HTTPS for all webhook endpoints
- Regularly rotate your API keys

## 🎯 Next Steps

1. **Test the integration** with Stripe's test cards
2. **Set up proper error handling** in your application
3. **Implement user feedback** for payment success/failure
4. **Add logging and monitoring** for payment events
5. **Configure proper webhook retry logic**

---

✅ **Your Stripe module is now ready for production use!**