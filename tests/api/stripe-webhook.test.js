import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/stripe-webhook.js";

const originalEnv = { ...process.env };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {}
  };
}

function makeRequest(event, secret) {
  const rawBody = JSON.stringify(event);
  const timestamp = "1791734400";
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(rawBody);
    }
  };
}

function setWebhookEnvironment(secret) {
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
}

describe("Stripe webhook history processing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("records completed donation events while new donation checkout is disabled", async () => {
    const secret = "test-signing-secret";
    setWebhookEnvironment(secret);
    const donationWrites = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/stripe_webhook_events?") && method === "POST") {
        return jsonResponse([{ id: "evt_donation" }]);
      }
      if (href.includes("/donations?") && method === "POST") {
        donationWrites.push(JSON.parse(options.body));
        return new Response(null, { status: 204 });
      }
      if (href.includes("/stripe_webhook_events?id=") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeRequest({
      id: "evt_donation",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_donation",
          amount_total: 2500,
          currency: "eur",
          payment_intent: "pi_donation",
          metadata: {
            kind: "donation",
            workspace_id: "workspace-1",
            campaign_id: "7",
            application_fee_amount: "2250"
          }
        }
      }
    }, secret), response);

    expect(response.statusCode).toBe(200);
    expect(donationWrites).toEqual([expect.objectContaining({
      workspace_id: "workspace-1",
      campaign_id: 7,
      stripe_checkout_session_id: "cs_donation",
      amount_total: 25,
      application_fee_amount: 22.5,
      currency: "EUR",
      status: "succeeded"
    })]);
  });

  it("continues to persist previously connected account status events", async () => {
    const secret = "test-connect-signing-secret";
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = secret;
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    const accountUpdates = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/stripe_webhook_events?") && method === "POST") {
        return jsonResponse([{ id: "evt_account" }]);
      }
      if (href.includes("/donation_settings?") && method === "PATCH") {
        accountUpdates.push({ href, body: JSON.parse(options.body) });
        return new Response(null, { status: 204 });
      }
      if (href.includes("/stripe_webhook_events?id=") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeRequest({
      id: "evt_account",
      type: "account.updated",
      account: "acct_existing",
      data: { object: { details_submitted: true, charges_enabled: true, payouts_enabled: false } }
    }, secret), response);

    expect(response.statusCode).toBe(200);
    expect(accountUpdates).toHaveLength(1);
    expect(accountUpdates[0].href).toBe("https://supabase.test/rest/v1/donation_settings?stripe_account_id=eq.acct_existing");
    expect(accountUpdates[0].body).toMatchObject({
      stripe_onboarding_complete: true,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: false
    });
  });
});
