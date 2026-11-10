import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkoutHandler from "../../api/create-checkout-session.js";
import webhookHandler from "../../api/stripe-webhook.js";
import { INTERACTION_PLANS, validateInteractionPrice, recoverPendingInteractionCheckout } from "../../lib/interactionStripe.js";
import { runStripeReconciliation } from "../../lib/cron/stripeReconciliationJob.js";

const originalEnv = { ...process.env };
const workspace = "11111111-1111-4111-8111-111111111111";
const now = Math.floor(Date.now() / 1000);
const metadata = { app: "godwit", billing_kind: "interactions", billing_environment: "interactions-test", workspace_id: workspace, purchase: "subscription" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, setHeader() {} });
const price = (key = "small") => ({
  id: `price_${key}`, active: true, livemode: false, product: `prod_${key}`,
  currency: "eur", unit_amount: key === "topup" ? 700 : INTERACTION_PLANS[key].amount,
  tax_behavior: "exclusive", billing_scheme: "per_unit", type: key === "topup" ? "one_time" : "recurring",
  ...(key === "topup" ? {} : { recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } })
});

describe("interaction billing reconciliation", () => {
  it("recovers a completed subscription when checkout webhook delivery was missed", async () => {
    const fetchMock = setupFetch({
      checkouts: [{ workspace_id: workspace, checkout_session_id: "cs_test_recovery" }],
      overrides: { "/v1/checkout/sessions/cs_test_recovery": {
        id: "cs_test_recovery", metadata, livemode: false, status: "complete", mode: "subscription", subscription: "sub_godwit"
      } }
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(runStripeReconciliation()).resolves.toEqual({ checkedSubscriptions: 0, recoveredCheckouts: 1 });
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/rpc/apply_interaction_subscription"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url, options]) => url.includes("workspace_billing_checkouts") && options.method === "DELETE")).toBe(true);
  });
  it("keeps an open checkout reservation instead of admitting a duplicate", async () => {
    const fetchMock = setupFetch({
      checkouts: [{ workspace_id: workspace, checkout_session_id: "cs_test_recovery" }],
      overrides: { "/v1/checkout/sessions/cs_test_recovery": {
        id: "cs_test_recovery", metadata, livemode: false, status: "open"
      } }
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(runStripeReconciliation()).resolves.toMatchObject({ recoveredCheckouts: 0 });
    expect(fetchMock.mock.calls.some(([url, options]) => url.includes("workspace_billing_checkouts") && options.method === "DELETE")).toBe(false);
  });
  it("does not recover a foreign application's checkout", async () => {
    vi.stubGlobal("fetch", setupFetch({
      checkouts: [{ workspace_id: workspace, checkout_session_id: "cs_test_recovery" }],
      overrides: { "/v1/checkout/sessions/cs_test_recovery": {
        id: "cs_test_recovery", metadata: { ...metadata, app: "muse" }, livemode: false, status: "complete"
      } }
    }));
    await expect(runStripeReconciliation()).rejects.toThrow("checkout mismatch");
  });
});
const subscription = (key = "small") => ({
  id: "sub_godwit", customer: "cus_godwit", livemode: false, status: "active", metadata,
  items: { has_more: false, data: [{ id: "si_godwit", quantity: 1, price: price(key),
    current_period_start: now - 3600, current_period_end: now + 86400 }] }
});
function signedEvent(type, object) {
  const raw = JSON.stringify({ id: "evt_godwit", created: now, type, livemode: object.livemode, data: { object } });
  const signature = createHmac("sha256", "whsec_interactions").update(`${now}.${raw}`).digest("hex");
  return { method: "POST", headers: { "stripe-signature": `t=${now},v1=${signature}` },
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw); } };
}
function setupFetch({ current = [], owner = true, reserved = true, checkouts = [], overrides = {} } = {}) {
  return vi.fn(async (url, options = {}) => {
    const path = String(url);
    for (const [part, result] of Object.entries(overrides)) {
      if (path.includes(part)) return typeof result === "function" ? result(url, options) : json(result);
    }
    if (path.endsWith("/auth/v1/user")) return json({ id: "user_godwit", email: "owner@example.test" });
    if (path.endsWith("/rpc/current_workspace_id")) return json(workspace);
    if (path.includes("/workspaces?")) return json(owner ? [{ id: workspace }] : []);
    if (path.includes("/workspace_interaction_subscriptions?")) return json(current);
    if (path.includes("/workspace_billing_checkouts?")) return options.method === "POST"
      ? json(reserved ? [{ workspace_id: workspace }] : [])
      : !options.method || options.method === "GET" ? json(checkouts) : new Response(null, { status: 204 });
    if (path.includes("/rpc/apply_interaction_") || path.includes("/rpc/revoke_interaction_")) return json(null);
    if (path.endsWith("/v1/account")) return json({ id: "acct_godwit" });
    if (path.includes("/v1/prices/")) return json(price(path.split("/").at(-1).replace("price_", "")));
    if (path.includes("/v1/subscriptions/")) return json(subscription());
    if (path.endsWith("/v1/checkout/sessions")) return json({ id: "cs_test_godwit", livemode: false, expires_at: now + 1800, url: "https://checkout.stripe.com/fixture" });
    throw new Error(`Unexpected request: ${options.method} ${path}`);
  });
}
beforeEach(() => {
  process.env.INTERACTION_BILLING_ENABLED = "1";
  process.env.INTERACTION_STRIPE_MODE = "test";
  process.env.INTERACTION_STRIPE_SECRET_KEY = "sk_test_fixture";
  process.env.INTERACTION_STRIPE_ACCOUNT_ID = "acct_godwit";
  process.env.INTERACTION_STRIPE_WEBHOOK_SECRET = "whsec_interactions";
  process.env.INTERACTION_STRIPE_TEST_STORAGE_ACK = "1";
  process.env.SUPABASE_URL = "https://isolated.example.test";
  process.env.INTERACTION_STRIPE_TEST_SUPABASE_URL = process.env.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_fixture";
  process.env.SUPABASE_ANON_KEY = "anon_fixture";
  process.env.APP_URL = "https://godwit.example.test";
  for (const key of [...Object.keys(INTERACTION_PLANS), "topup"]) process.env[`INTERACTION_STRIPE_PRICE_${key.toUpperCase()}`] = `price_${key}`;
});
afterEach(() => { vi.unstubAllGlobals(); process.env = { ...originalEnv }; });

describe("interaction billing checkout", () => {
  const request = (mode = "interaction-subscription", plan = "small") => ({
    method: "POST", headers: { authorization: "Bearer user_fixture" }, body: { mode, plan }
  });
  it.each(Object.keys(INTERACTION_PLANS))("creates the exact %s subscription without another trial", async plan => {
    const fetchMock = setupFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request("interaction-subscription", plan), res);
    expect(res.statusCode).toBe(200);
    const form = fetchMock.mock.calls.find(([url]) => url.endsWith("/v1/checkout/sessions"))[1].body;
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe(`price_${plan}`);
    expect(form.get("subscription_data[metadata][workspace_id]")).toBe(workspace);
    expect(form.get("subscription_data[trial_period_days]")).toBeNull();
    expect(form.get("automatic_tax[enabled]")).toBe("true");
  });
  it("requires the actual account owner before any Stripe request", async () => {
    const fetchMock = setupFetch({ owner: false });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request(), res);
    expect(res.statusCode).toBe(403);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("api.stripe.com"))).toBe(false);
  });
  it.each(["wrong-key", "wrong-db", "disabled"])("fails closed when %s", async mode => {
    if (mode === "wrong-key") process.env.INTERACTION_STRIPE_SECRET_KEY = "sk_live_fixture";
    if (mode === "wrong-db") process.env.INTERACTION_STRIPE_TEST_SUPABASE_URL = "https://production.test";
    if (mode === "disabled") process.env.INTERACTION_BILLING_ENABLED = "0";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request(), res);
    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses duplicate open checkouts", async () => {
    const fetchMock = setupFetch({ reserved: false });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request(), res);
    expect(res.statusCode).toBe(409);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/v1/checkout/sessions"))).toBe(false);
  });
  it("checks remote completion before releasing an expired checkout lock", async () => {
    const fetchMock = setupFetch({
      checkouts: [{ workspace_id: workspace, checkout_session_id: "cs_test_previous", expires_at: new Date(0).toISOString() }],
      overrides: { "/v1/checkout/sessions/cs_test_previous": {
        id: "cs_test_previous", livemode: false, metadata, mode: "subscription", status: "complete", subscription: "sub_godwit"
      } }
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request(), res);
    expect(res.statusCode).toBe(409);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/rpc/apply_interaction_subscription"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/v1/checkout/sessions"))).toBe(false);
  });
  it("retains the lock after an ambiguous Stripe network failure", async () => {
    const fetchMock = setupFetch({ overrides: {
      "/v1/checkout/sessions": () => { throw new Error("Network timeout after request sent"); }
    } });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request(), res);
    expect(res.statusCode).toBe(500);
    expect(fetchMock.mock.calls.some(([url, options]) => url.includes("workspace_billing_checkouts") && options.method === "DELETE")).toBe(false);
    const [, options] = fetchMock.mock.calls.find(([url]) => url.endsWith("/v1/checkout/sessions"));
    expect(options.body.get("metadata[checkout_reservation]")).toMatch(/^pending_/);
    expect(options.headers["Idempotency-Key"]).toBe(options.body.get("metadata[checkout_reservation]"));
  });
  it("recovers a checkout ID after a lost response using its durable reservation metadata", async () => {
    const reservation = "pending_11111111-1111-4111-8111-111111111111";
    const session = { id: "cs_test_recovered", livemode: false, metadata: { ...metadata, checkout_reservation: reservation } };
    vi.stubGlobal("fetch", setupFetch({ overrides: {
      "/v1/checkout/sessions?": { object: "list", data: [session], has_more: false }
    } }));
    await expect(recoverPendingInteractionCheckout({
      workspace_id: workspace, checkout_session_id: reservation, expires_at: new Date().toISOString()
    })).resolves.toEqual(session);
  });
  it("opens the owner portal for a paid plan change, without creating a second subscription", async () => {
    process.env.INTERACTION_STRIPE_PORTAL_CONFIGURATION = "bpc_godwit";
    const fetchMock = setupFetch({
      current: [{ stripe_subscription_id: "sub_godwit", stripe_customer_id: "cus_godwit" }],
      overrides: {
        "/v1/billing_portal/configurations/": {
          livemode: false, active: true, metadata,
          features: {
            subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "always_invoice",
              products: [{ prices: Object.keys(INTERACTION_PLANS).map(key => `price_${key}`) }],
              schedule_at_period_end: { conditions: [{ type: "decreasing_item_amount" }] } },
            subscription_cancel: { enabled: true, mode: "at_period_end" }
          }
        },
        "/v1/billing_portal/sessions": { livemode: false, url: "https://billing.stripe.com/fixture" }
      }
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request("interaction-subscription", "regional"), res);
    expect(res.statusCode).toBe(200);
    const form = fetchMock.mock.calls.find(([url]) => url.endsWith("/v1/billing_portal/sessions"))[1].body;
    expect(form.get("flow_data[subscription_update_confirm][items][0][price]")).toBe("price_regional");
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/v1/checkout/sessions"))).toBe(false);
  });
  it("requires a paid subscription for top-ups", async () => {
    vi.stubGlobal("fetch", setupFetch());
    const res = response();
    await checkoutHandler(request("interaction-topup"), res);
    expect(res.statusCode).toBe(409);
  });
  it("creates a one-time €7 pack, never a recurring purchase", async () => {
    const fetchMock = setupFetch({ current: [{ stripe_subscription_id: "sub_godwit", stripe_customer_id: "cus_godwit" }] });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await checkoutHandler(request("interaction-topup"), res);
    expect(res.statusCode).toBe(200);
    const form = fetchMock.mock.calls.find(([url]) => url.endsWith("/v1/checkout/sessions"))[1].body;
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price]")).toBe("price_topup");
    expect(form.get("metadata[purchase]")).toBe("topup");
    expect(form.get("subscription_data[metadata][purchase]")).toBeNull();
  });
  it.each(["currency", "amount", "interval", "tax"])("rejects mismatched %s in the catalogue", async key => {
    const wrong = price();
    if (key === "currency") wrong.currency = "usd";
    if (key === "amount") wrong.unit_amount = 1;
    if (key === "interval") wrong.recurring.interval = "year";
    if (key === "tax") wrong.tax_behavior = "inclusive";
    expect(() => validateInteractionPrice(wrong, "small")).toThrow();
  });
});

describe("interaction webhook", () => {
  it("retrieves current subscription state before updating paid allowances", async () => {
    const fetchMock = setupFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(signedEvent("customer.subscription.updated", subscription()), res);
    expect(res.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => url.includes("/rpc/apply_interaction_subscription"));
    expect(JSON.parse(call[1].body).subscription).toMatchObject({ workspace_id: workspace, plan: "small", event_created: now });
  });
  it("ignores other applications on the shared Stripe account", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(signedEvent("customer.subscription.updated", { ...subscription(), metadata: { ...metadata, app: "muse" } }), res);
    expect(res.body.ignored).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects forged signatures before any API calls", async () => {
    const req = signedEvent("customer.subscription.updated", subscription());
    req.headers["stripe-signature"] = `t=${now},v1=${"a".repeat(64)}`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(req, res);
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not grant credit for an unpaid checkout", async () => {
    const fetchMock = setupFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(signedEvent("checkout.session.completed", {
      id: "cs_test_godwit", livemode: false, metadata: { ...metadata, purchase: "topup" }, payment_status: "unpaid"
    }), res);
    expect(res.body.pending).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/rpc/apply_interaction_topup"))).toBe(false);
  });
  it.each(["test", "live"])("fulfills a verified %s pack with its original purchase timestamp", async mode => {
    process.env.INTERACTION_STRIPE_MODE = mode;
    process.env.INTERACTION_STRIPE_SECRET_KEY = `sk_${mode}_fixture`;
    const live = mode === "live";
    const topupMetadata = { ...metadata, billing_environment: `interactions-${mode}`, purchase: "topup" };
    const session = { id: `cs_${mode}_godwit`, livemode: live, metadata: topupMetadata,
      mode: "payment", status: "complete", payment_status: "paid",
      line_items: { has_more: false, data: [{ quantity: 1, price: { ...price("topup"), livemode: live } }] },
      payment_intent: { id: "pi_godwit", livemode: live, metadata: topupMetadata,
        status: "succeeded", currency: "eur", amount_received: 700, latest_charge: { created: now } } };
    const fetchMock = setupFetch({ overrides: { [`/v1/checkout/sessions/${session.id}`]: session } });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(signedEvent("checkout.session.completed", session), res);
    expect(res.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => url.includes("/rpc/apply_interaction_topup"));
    expect(JSON.parse(call[1].body).topup).toEqual({ workspace_id: workspace, checkout_session_id: session.id,
      payment_intent_id: "pi_godwit", purchased_at: new Date(now * 1000).toISOString() });
  });
  it("revokes unused pack credits after a verified partial refund", async () => {
    const charge = { id: "ch_godwit", livemode: false, metadata: { ...metadata, purchase: "topup" },
      payment_intent: "pi_godwit", amount_refunded: 100 };
    const fetchMock = setupFetch({ overrides: { "/v1/charges/ch_godwit": charge } });
    vi.stubGlobal("fetch", fetchMock);
    const res = response();
    await webhookHandler(signedEvent("charge.refunded", charge), res);
    expect(res.statusCode).toBe(200);
    const call = fetchMock.mock.calls.find(([url]) => url.includes("/rpc/revoke_interaction_topup"));
    expect(JSON.parse(call[1].body)).toEqual({ target_payment_intent_id: "pi_godwit" });
  });
});
