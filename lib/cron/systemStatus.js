export function getSystemStatus() {
  return {
    core: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      appUrl: Boolean(process.env.APP_URL)
    },
    billing: {
      interactionBillingEnabled: process.env.INTERACTION_BILLING_ENABLED === "1",
      interactionStripeKey: Boolean(process.env.INTERACTION_STRIPE_SECRET_KEY),
      interactionStripeWebhook: Boolean(process.env.INTERACTION_STRIPE_WEBHOOK_SECRET),
      interactionCatalogue: ["SMALL", "STANDARD", "SCALE", "REGIONAL", "TOPUP"]
        .every(plan => Boolean(process.env[`INTERACTION_STRIPE_PRICE_${plan}`])),
      interactionPortal: Boolean(process.env.INTERACTION_STRIPE_PORTAL_CONFIGURATION),
      stripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      stripePriceStarter: Boolean(process.env.STRIPE_PRICE_STARTER),
      stripePriceGrowth: Boolean(process.env.STRIPE_PRICE_GROWTH),
      stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET)
    },
    email: {
      resendApiKey: Boolean(process.env.RESEND_API_KEY),
      reportFromEmail: Boolean(process.env.REPORT_FROM_EMAIL)
    },
    reputation: {
      googlePlacesEnabled: false
    },
    aiFeatures: {
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      openAiApiKey: Boolean(process.env.OPENAI_API_KEY)
    },
    monitoring: {
      sentryDsn: Boolean(process.env.VITE_SENTRY_DSN),
      sentryServerDsn: Boolean(process.env.SENTRY_DSN)
    }
  };
}
