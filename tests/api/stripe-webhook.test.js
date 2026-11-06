import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/stripe-webhook.js";
import { STRIPE_SANDBOX_ACCOUNT } from "../../lib/stripeSandbox.js";
import { jsonResponse, sandboxEnvironment, sandboxSubscription } from "../stripeSandboxFixtures.js";

const originalEnv = { ...process.env };
const secret = "whsec_fixture";

function makeResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() {}
  };
}

function makeRequest(event, signingSecret = secret, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(event);
  const signature = createHmac("sha256", signingSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    async *[Symbol.asyncIterator]() { yield Buffer.from(rawBody); }
  };
}

function subscriptionEvent() {
  return { id: "evt_godwit", type: "customer.subscription.updated", livemode: false, data: { object: sandboxSubscription() } };
}

function webhookFetch({ remote = sandboxSubscription(), duplicate = false, processed = false, failWrite = false } = {}) {
  return vi.fn(async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith("/v1/account")) return jsonResponse({ id: STRIPE_SANDBOX_ACCOUNT });
    if (href.includes("/v1/subscriptions/")) return jsonResponse(remote);
    if (href.includes("/stripe_webhook_events?") && options.method === "POST") {
      return jsonResponse(duplicate ? [] : [{ id: "evt_godwit" }]);
    }
    if (href.includes("/stripe_webhook_events?") && !options.method) {
      return jsonResponse([{ processed_at: processed ? "2026-11-06T00:00:00Z" : null, error: null }]);
    }
    if (href.includes("/workspace_subscriptions?") && options.method === "POST") {
      return new Response(null, { status: failWrite ? 500 : 204 });
    }
    if (href.includes("/stripe_webhook_events?") && options.method === "PATCH") return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${options.method} ${href}`);
  });
}

describe("shared-account Stripe sandbox webhook", () => {
  beforeEach(sandboxEnvironment);
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it.each(["disabled", "live-key"])("fails closed before any network calls when %s", async (mode) => {
    if (mode === "disabled") process.env.STRIPE_SANDBOX_ENABLED = "0";
    else process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(subscriptionEvent()), response);
    expect(response.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks before audit or entitlement writes if the configured sandbox database differs", async () => {
    process.env.STRIPE_SANDBOX_SUPABASE_URL = "https://isolated-project.test";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(subscriptionEvent()), response);
    expect(response.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["wrong-secret", "connect-secret", "expired"])("rejects %s signatures before writes", async (mode) => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(subscriptionEvent(), mode === "connect-secret" ? "whsec_connect"
      : mode === "wrong-secret" ? "whsec_wrong" : secret, mode === "expired" ? 1 : undefined), response);
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["event-live", "object-live", "missing-mode", "missing-object-mode"])("rejects %s before audit writes", async (mode) => {
    const event = subscriptionEvent();
    if (mode === "event-live") event.livemode = true;
    if (mode === "object-live") event.data.object.livemode = true;
    if (mode === "missing-mode") delete event.livemode;
    if (mode === "missing-object-mode") delete event.data.object.livemode;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(event), response);
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["muse", "adventurebook", "unmarked", "wrong-environment", "donation", "connect", "unsupported"])(
    "ignores %s events before any API calls or writes", async (mode) => {
      const event = subscriptionEvent();
      const object = event.data.object;
      if (["muse", "adventurebook"].includes(mode)) object.metadata.app = mode;
      if (mode === "unmarked") delete object.metadata.app;
      if (mode === "wrong-environment") object.metadata.billing_environment = "live";
      if (mode === "donation") { event.type = "checkout.session.completed"; object.metadata.kind = "donation"; }
      if (mode === "connect") { event.type = "account.updated"; event.account = "acct_connected"; delete object.livemode; }
      if (mode === "unsupported") event.type = "invoice.paid";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(makeRequest(event), response);
      expect(response.statusCode).toBe(200);
      expect(response.body.ignored).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["price", "plan", "workspace", "currency", "quantity", "multiple", "recurrence", "product"])(
    "rejects mismatched %s before audit writes", async (mode) => {
      const event = subscriptionEvent();
      const object = event.data.object;
      const item = object.items.data[0];
      if (mode === "price") item.price.id = "price_muse";
      if (mode === "plan") object.metadata.plan = "growth";
      if (mode === "workspace") delete object.metadata.workspace_id;
      if (mode === "currency") item.price.currency = "usd";
      if (mode === "quantity") item.quantity = 2;
      if (mode === "multiple") object.items.data.push(item);
      if (mode === "recurrence") item.price.recurring.interval = "year";
      if (mode === "product") item.price.product = "prod_muse";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(makeRequest(event), response);
      expect(response.statusCode).toBe(500);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"])(
    "persists validated %s subscriptions", async (type) => {
      const event = subscriptionEvent();
      event.type = type;
      if (type.endsWith("deleted")) event.data.object.status = "canceled";
      const fetchMock = webhookFetch();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(makeRequest(event), response);
      expect(response.statusCode).toBe(200);
      const write = fetchMock.mock.calls.find(([url]) => url.includes("/workspace_subscriptions?"));
      expect(JSON.parse(write[1].body)).toMatchObject({
        workspace_id: "workspace-1", plan: "starter", status: event.data.object.status,
        stripe_subscription_id: "sub_godwit", current_period_end: new Date(1800000000 * 1000).toISOString()
      });
    }
  );

  function checkoutEvent() {
    const event = subscriptionEvent();
    event.type = "checkout.session.completed";
    event.data.object = {
      id: "cs_test_godwit", livemode: false, mode: "subscription", subscription: "sub_godwit",
      customer: "cus_godwit", metadata: sandboxSubscription().metadata
    };
    return event;
  }

  it("retrieves and validates checkout's subscription rather than marking a trial active", async () => {
    const fetchMock = webhookFetch();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(checkoutEvent()), response);
    expect(response.statusCode).toBe(200);
    const write = fetchMock.mock.calls.find(([url]) => url.includes("/workspace_subscriptions?"));
    expect(JSON.parse(write[1].body).status).toBe("trialing");
  });

  it.each(["live", "foreign", "workspace", "customer"])("rejects %s retrieved subscriptions before audit writes", async (mode) => {
    const remote = sandboxSubscription();
    if (mode === "live") remote.livemode = true;
    if (mode === "foreign") remote.metadata.app = "muse";
    if (mode === "workspace") remote.metadata.workspace_id = "other-workspace";
    if (mode === "customer") remote.customer = "cus_other";
    const fetchMock = webhookFetch({ remote });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(checkoutEvent()), response);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("supabase"))).toBe(false);
  });

  it.each([false, true])("only skips already successfully processed deliveries (%s)", async (processed) => {
    const fetchMock = webhookFetch({ duplicate: true, processed });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest(subscriptionEvent()), response);
    expect(response.statusCode).toBe(200);
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/workspace_subscriptions?"))).toBe(!processed);
    expect(response.body.duplicate).toBe(processed ? true : undefined);
  });
});
