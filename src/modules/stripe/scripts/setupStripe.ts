#!/usr/bin/env node

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import Stripe from 'stripe';
import { STRIPE_PLANS } from '../config/stripe.plans.config';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(colorize(message, color));
}

function logSection(title: string): void {
  console.log('\n' + colorize('='.repeat(50), 'cyan'));
  console.log(colorize(`🚀 ${title}`, 'cyan'));
  console.log(colorize('='.repeat(50), 'cyan'));
}

function logSuccess(message: string): void {
  log(`✅ ${message}`, 'green');
}

function logError(message: string): void {
  log(`❌ ${message}`, 'red');
}

function logWarning(message: string): void {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message: string): void {
  log(`ℹ️  ${message}`, 'blue');
}

async function setupStripe(): Promise<void> {
  try {
    logSection('Stripe Setup Initialization');

    // Load environment variables
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      logSuccess('Environment variables loaded from .env');
    } else {
      logWarning('.env file not found, using process environment variables');
    }

    // Validate required environment variables
    const requiredVars = [
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logError('Missing required environment variables:');
      missingVars.forEach(varName => {
        log(`  - ${varName}`, 'red');
      });
      log('\nPlease add these variables to your .env file and try again.', 'red');
      process.exit(1);
    }

    logSuccess('All required environment variables found');

    // Initialize Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion) || '2024-06-20',
    });

    logSuccess('Stripe client initialized');

    // Validate API connection
    try {
      await stripe.accounts.retrieve();
      logSuccess('Stripe API connection validated');
    } catch (error) {
      logError('Failed to connect to Stripe API');
      logError(`Error: ${error.message}`);
      process.exit(1);
    }

    logSection('Processing Stripe Plans');

    const generatedPrices: Record<string, string> = {};
    const summary: Array<{
      name: string;
      type: string;
      amount: number;
      currency: string;
      productId: string;
      priceId: string;
    }> = [];

    for (const plan of STRIPE_PLANS) {
      logInfo(`Processing plan: ${plan.name}`);

      try {
        // Check if product already exists
        let product = await findProductByName(stripe, plan.name);
        
        if (product) {
          logInfo(`  Product "${plan.name}" already exists (${product.id})`);
        } else {
          // Create new product
          product = await stripe.products.create({
            name: plan.name,
            description: plan.description,
          });
          logSuccess(`  Created product "${plan.name}" (${product.id})`);
        }

        // Check if there are existing prices for this product
        const existingPrice = await findPriceForProduct(stripe, product.id, plan.amount, plan.currency, plan.interval);
        
        let price: Stripe.Price;
        
        if (existingPrice) {
          logInfo(`  Price for "${plan.name}" already exists with same amount (${existingPrice.id})`);
          price = existingPrice;
        } else {
          // Check if there are any active prices for this product (with different amounts)
          const allPricesForProduct = await stripe.prices.list({ 
            product: product.id, 
            active: true 
          });
          
          // Deactivate old prices if they exist (different amounts)
          for (const oldPrice of allPricesForProduct.data) {
            const isMatchingType = plan.interval 
              ? oldPrice.recurring?.interval === plan.interval
              : !oldPrice.recurring;
              
            if (isMatchingType && oldPrice.unit_amount !== plan.amount) {
              await stripe.prices.update(oldPrice.id, { active: false });
              const oldAmount = oldPrice.unit_amount ? `${oldPrice.unit_amount / 100} ${oldPrice.currency}` : 'unknown amount';
              logWarning(`  Deactivated old price ${oldPrice.id} (was ${oldAmount})`);
            }
          }
          
          // Create new price for the product
          const priceData: Stripe.PriceCreateParams = {
            product: product.id,
            unit_amount: plan.amount,
            currency: plan.currency,
          };

          // If the plan has an interval, it's a subscription
          if (plan.interval) {
            priceData.recurring = {
              interval: plan.interval,
              interval_count: plan.intervalCount || 1,
            };
          }

          price = await stripe.prices.create(priceData);
          const planType = plan.interval ? 'subscription' : 'one-time';
          logSuccess(`  Created new price for "${plan.name}" (${price.id}) - ${plan.amount / 100} ${plan.currency} - ${planType}`);
        }

        // Store for .env generation
        const envVarName = `STRIPE_PRICE_${plan.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        generatedPrices[envVarName] = price.id;

        summary.push({
          name: plan.name,
          type: plan.interval ? 'subscription' : 'one-time',
          amount: plan.amount,
          currency: plan.currency,
          productId: product.id,
          priceId: price.id,
        });

      } catch (error) {
        logError(`  Failed to process plan "${plan.name}": ${error.message}`);
      }
    }

    logSection('Generating Environment Configuration');

    // Generate .stripe.generated.env file
    const generatedEnvPath = path.join(process.cwd(), '.stripe.generated.env');
    const envContent = Object.entries(generatedPrices)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(generatedEnvPath, envContent);
    logSuccess(`.stripe.generated.env file created with ${Object.keys(generatedPrices).length} price IDs`);

    logSection('Configuring Webhook Endpoint');

    // Setup webhook automatically using BACKEND_DOMAIN
    const backendDomain = process.env.BACKEND_DOMAIN;
    const webhookUrl = backendDomain ? `${backendDomain}/api/v1/stripe/webhook` : null;
    
    if (!backendDomain || !webhookUrl) {
      logWarning('BACKEND_DOMAIN not found in environment variables');
      logInfo('To enable automatic webhook creation, make sure BACKEND_DOMAIN is set in your .env:');
      logInfo('BACKEND_DOMAIN=https://yourdomain.com');
      logInfo('');
      logInfo('For now, you can create it manually:');
      logInfo('1. Go to your Stripe Dashboard → Webhooks');
      logInfo('2. Click "Add endpoint"');
      logInfo('3. URL: https://yourdomain.com/api/v1/stripe/webhook'); 
      logInfo('4. Select the events listed in the documentation');
    } else {
      try {
        // Check if webhook already exists
        const existingWebhooks = await stripe.webhookEndpoints.list();
        const existingWebhook = existingWebhooks.data.find(hook => hook.url === webhookUrl);
        
        let webhookEndpoint;
        
        if (existingWebhook) {
          logInfo(`Webhook already exists: ${existingWebhook.id}`);
          webhookEndpoint = existingWebhook;
        } else {
          // Create new webhook
          logInfo(`Creating webhook endpoint: ${webhookUrl}`);
          
          webhookEndpoint = await stripe.webhookEndpoints.create({
            url: webhookUrl,
            enabled_events: [
              // Checkout and Sessions
              'checkout.session.completed',
              
              // Payment Intents
              'payment_intent.succeeded',
              'payment_intent.payment_failed',
              'payment_intent.canceled',
              
              // Charges and Refunds
              'charge.succeeded',
              'charge.failed',
              'charge.refunded',
              'charge.dispute.created',
              
              // Invoices (Critical for subscriptions)
              'invoice.payment_succeeded', 
              'invoice.payment_failed',
              'invoice.upcoming',
              'invoice.created',
              'invoice.finalized',
              
              // Subscriptions (Core subscription events)
              'customer.subscription.created',
              'customer.subscription.updated',
              'customer.subscription.deleted',
              'customer.subscription.trial_will_end',
              'customer.subscription.paused',
              'customer.subscription.resumed',
              
              // Payment Methods
              'payment_method.attached',
              'payment_method.detached',
              'payment_method.updated',
              'payment_method.automatically_updated',
              
              // Setup Intents
              'setup_intent.succeeded',
              'setup_intent.setup_failed',
              'setup_intent.canceled',
              
              // Customers
              'customer.created',
              'customer.updated',
              'customer.deleted',
              
              // Products and Prices (for plan changes)
              'price.created',
              'price.updated',
              'product.created',
              'product.updated'
            ],
          });
          
          logSuccess(`Webhook created successfully: ${webhookEndpoint.id}`);
        }
        
        // Add webhook secret to generated env file
        const webhookEnvContent = `${envContent}\nSTRIPE_WEBHOOK_SECRET=${webhookEndpoint.secret}`;
        fs.writeFileSync(generatedEnvPath, webhookEnvContent);
        
        logSuccess('Webhook secret added to .stripe.generated.env');
        logInfo('Copy the STRIPE_WEBHOOK_SECRET from .stripe.generated.env to your .env file');
        
      } catch (error) {
        logError(`Failed to setup webhook: ${error.message}`);
        logInfo('You can create the webhook manually in your Stripe Dashboard');
      }
    }

    logSection('Setup Summary');

    log('\n📊 Created/Verified Products and Prices:', 'bright');
    summary.forEach(item => {
      log(`\n• ${item.name} (${item.type})`);
      log(`  Amount: ${item.amount / 100} ${item.currency.toUpperCase()}`);
      log(`  Product ID: ${item.productId}`);
      log(`  Price ID: ${item.priceId}`);
    });

    log('\n📝 Next Steps:', 'bright');
    log('1. Copy ALL variables from .stripe.generated.env to your .env file');
    log('   (including price IDs and webhook secret)');
    log('2. Update your application code to use these price IDs');
    log('3. Test your payment flows with Stripe test cards');
    log('4. Deploy your application and update WEBHOOK_ENDPOINT_URL for production');

    log('\n🎉 Stripe setup completed successfully!', 'green');

  } catch (error) {
    logError(`Setup failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function findProductByName(stripe: Stripe, name: string): Promise<Stripe.Product | null> {
  try {
    const products = await stripe.products.list({ active: true });
    return products.data.find(product => product.name === name) || null;
  } catch (error) {
    throw new Error(`Failed to search for product "${name}": ${error.message}`);
  }
}

async function findPriceForProduct(
  stripe: Stripe, 
  productId: string, 
  unitAmount: number, 
  currency: string, 
  interval?: 'day' | 'week' | 'month' | 'year'
): Promise<Stripe.Price | null> {
  try {
    const prices = await stripe.prices.list({ 
      product: productId, 
      active: true 
    });
    
    return prices.data.find(price => {
      // Check basic price properties
      const basicMatch = price.unit_amount === unitAmount && price.currency === currency;
      
      // For subscription prices, also check the interval
      if (interval) {
        return basicMatch && price.recurring?.interval === interval;
      }
      
      // For one-time prices, ensure it's not a recurring price
      return basicMatch && !price.recurring;
    }) || null;
  } catch (error) {
    throw new Error(`Failed to search for price for product "${productId}": ${error.message}`);
  }
}

// Check if this script is being run directly
if (require.main === module) {
  setupStripe().catch(error => {
    logError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { setupStripe };