import { STRIPE_SANDBOX_PLANS } from "../lib/stripeSandbox.js";

export function sandboxEnvironment() {
  process.env.BILLING_ENABLED = "1";
  process.env.STRIPE_SANDBOX_ENABLED = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture";
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.STRIPE_SANDBOX_SUPABASE_URL = "https://supabase.test";
  process.env.STRIPE_SANDBOX_ISOLATED_STORAGE_ACK = "1";
  process.env.SUPABASE_ANON_KEY = "anon-fixture";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture";
  process.env.APP_URL = "https://godwit.test";
}

export function sandboxPrice(planKey = "starter") {
  const plan = STRIPE_SANDBOX_PLANS[planKey];
  return {
    id: plan.priceId,
    product: plan.productId,
    active: true,
    livemode: false,
    currency: "eur",
    unit_amount: plan.amount,
    type: "recurring",
    recurring: { interval: "month", interval_count: 1 }
  };
}

export function sandboxSubscription(plan = "starter") {
  return {
    id: "sub_godwit",
    livemode: false,
    customer: "cus_godwit",
    status: "trialing",
    metadata: { app: "godwit", billing_environment: "sandbox", workspace_id: "workspace-1", plan },
    items: { data: [{ quantity: 1, price: sandboxPrice(plan), current_period_end: 1800000000 }], has_more: false }
  };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
