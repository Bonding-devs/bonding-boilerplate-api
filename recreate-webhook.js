require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function recreateWebhookForLocalhost() {
  try {
    console.log('🔧 Recreando webhook que se borró accidentalmente...\n');
    
    // Crear webhook para desarrollo local usando ngrok o túnel
    // Como no podemos usar localhost directo, usaremos una URL temporal
    console.log('⚠️  IMPORTANTE: Stripe requiere URLs públicas para webhooks.');
    console.log('📋 Vas a necesitar usar ngrok o similar para exponer localhost:3000');
    console.log('🌐 Por ahora, voy a crear el webhook con una URL placeholder que debes actualizar.\n');
    
    const webhookUrl = 'https://tu-dominio-temporal.ngrok.io/api/v1/stripe/webhook';
    
    const newWebhook = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [
        'checkout.session.completed',
        'invoice.payment_succeeded', 
        'invoice.payment_failed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'payment_method.attached',
        'payment_method.detached',
        'payment_method.updated',
        'setup_intent.succeeded',
        'setup_intent.setup_failed',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'customer.created',
        'customer.updated'
      ]
    });
    
    console.log('✅ ¡Webhook recreado exitosamente!');
    console.log(`🆔 ID: ${newWebhook.id}`);
    console.log(`🌐 URL: ${newWebhook.url}`);
    console.log(`🔑 Secret: ${newWebhook.secret}`);
    console.log(`📊 Eventos: ${newWebhook.enabled_events.length}`);
    
    console.log('\n🔧 PASOS SIGUIENTES:');
    console.log('1. Instala ngrok: https://ngrok.com/download');
    console.log('2. Ejecuta: ngrok http 3000');
    console.log('3. Copia la URL https que te da ngrok');
    console.log('4. Ve a Stripe Dashboard > Webhooks');
    console.log(`5. Edita el webhook ${newWebhook.id}`);
    console.log('6. Cambia la URL por: https://tu-url-ngrok.ngrok.io/api/v1/stripe/webhook');
    
    console.log('\n🔑 ACTUALIZA TU .ENV:');
    console.log(`STRIPE_WEBHOOK_SECRET=${newWebhook.secret}`);
    
    console.log('\n🚀 Una vez que hagas eso, SÍ vas a poder recibir eventos desde Dashboard!');
    
  } catch (error) {
    console.error('❌ Error recreando webhook:', error.message);
    
    if (error.message.includes('Invalid URL')) {
      console.log('\n💡 ALTERNATIVA: Crear webhook manualmente');
      console.log('1. Ve a https://dashboard.stripe.com/webhooks');
      console.log('2. Haz clic en "Add endpoint"');
      console.log('3. URL: https://tu-url-ngrok.ngrok.io/api/v1/stripe/webhook');
      console.log('4. Selecciona estos eventos:');
      console.log('   - payment_method.attached');
      console.log('   - payment_method.detached');
      console.log('   - payment_method.updated');
      console.log('   - checkout.session.completed');
      console.log('   - customer.created');
      console.log('   - Y todos los otros que necesites');
    }
  }
}

recreateWebhookForLocalhost();