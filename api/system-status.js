import { timingSafeEqual } from "node:crypto";

function secureEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

// Operator-only health check: reports which optional integrations are configured in this
// environment, without ever returning the secret values themselves. Use this before
// onboarding a pilot venue to confirm the features you're about to promise (weekly reports,
// automated nurture emails, public reputation, Stripe billing) actually have their
// dependencies wired up, instead of finding out silently when a feature no-ops in production.
export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!secureEqual(supplied, secret)) return response.status(401).json({ error: "Unauthorized." });

  return response.status(200).json({
    core: {
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      appUrl: Boolean(process.env.APP_URL)
    },
    billing: {
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
      googlePlacesApiKey: Boolean(process.env.GOOGLE_PLACES_API_KEY)
    },
    aiFeatures: {
      geminiApiKey: Boolean(process.env.GEMINI_API_KEY),
      openAiApiKey: Boolean(process.env.OPENAI_API_KEY)
    },
    monitoring: {
      sentryDsn: Boolean(process.env.VITE_SENTRY_DSN),
      sentryServerDsn: Boolean(process.env.SENTRY_DSN)
    }
  });
}
