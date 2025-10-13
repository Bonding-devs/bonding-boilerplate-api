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

        // Create price for the product
        const priceData: Stripe.PriceCreateParams = {
          product: product.id,
          unit_amount: plan.amount,
          currency: plan.currency,
        };

        if (plan.type === 'subscription' && plan.interval) {
          priceData.recurring = {
            interval: plan.interval,
          };
        }

        const price = await stripe.prices.create(priceData);
        logSuccess(`  Created price for "${plan.name}" (${price.id})`);

        // Store for .env generation
        const envVarName = `STRIPE_PRICE_${plan.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        generatedPrices[envVarName] = price.id;

        summary.push({
          name: plan.name,
          type: plan.type,
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

    // Check for webhook configuration
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logWarning('STRIPE_WEBHOOK_SECRET not found in environment variables');
      logInfo('To enable webhooks:');
      logInfo('1. Create a webhook endpoint in your Stripe dashboard');
      logInfo('2. Point it to: https://yourdomain.com/api/stripe/webhook');
      logInfo('3. Add the webhook secret to your .env file as STRIPE_WEBHOOK_SECRET');
    } else {
      logSuccess('Webhook secret found in environment variables');
      
      try {
        const webhooks = await stripe.webhookEndpoints.list();
        logInfo(`Found ${webhooks.data.length} webhook endpoint(s) in your Stripe account`);
      } catch (error) {
        logWarning('Could not retrieve webhook information');
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
    log('1. Copy the price IDs from .stripe.generated.env to your .env file');
    log('2. Update your application code to use these price IDs');
    log('3. Configure webhooks if not already done');
    log('4. Test your payment flows');

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

// Check if this script is being run directly
if (require.main === module) {
  setupStripe().catch(error => {
    logError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { setupStripe };