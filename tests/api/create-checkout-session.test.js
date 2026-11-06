import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/create-checkout-session.js";
import { STRIPE_SANDBOX_ACCOUNT, STRIPE_SANDBOX_PLANS } from "../../lib/stripeSandbox.js";
import { jsonResponse, sandboxEnvironment, sandboxPrice } from "../stripeSandboxFixtures.js";

const originalEnv = { ...process.env };

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

function makeRequest(body) {
  return { method: "POST", headers: {}, body };
}

describe("create-checkout-session donation feature gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe("subscription sandbox checkout", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      process.env = { ...originalEnv };
    });

    function checkoutRequest(plan = "starter") {
      return { method: "POST", headers: { authorization: "Bearer user-fixture" }, body: { plan } };
    }

    function checkoutFetch(overrides = {}) {
      return vi.fn(async (url) => {
        const href = String(url);
        if (href.endsWith("/auth/v1/user")) return jsonResponse({ id: "user-1", email: "tester@example.test" });
        if (href.endsWith("/rpc/current_workspace_id")) return jsonResponse("workspace-1");
        if (href.includes("/workspace_members?")) return jsonResponse(overrides.members || [{ role: "owner" }]);
        if (href.includes("/workspace_subscriptions?")) return jsonResponse(overrides.priorSubscription ? [{ workspace_id: "workspace-1" }] : []);
        if (href.endsWith("/v1/account")) return jsonResponse(overrides.account || { id: STRIPE_SANDBOX_ACCOUNT });
        if (href.includes("/v1/prices/")) return jsonResponse(overrides.price || sandboxPrice(overrides.plan));
        if (href.endsWith("/checkout/sessions")) {
          return jsonResponse(overrides.checkout || { id: "cs_test_godwit", livemode: false, url: "https://checkout.stripe.com/test-fixture" });
        }
        throw new Error(`Unexpected request: ${href}`);
      });
    }

    it.each(["", "0", "true"])("blocks without explicit sandbox opt-in (%s)", async (value) => {
      sandboxEnvironment();
      process.env.STRIPE_SANDBOX_ENABLED = value;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["sk_live_fixture", "rk_live_fixture", "", "invalid"])("blocks unsafe keys before network calls (%s)", async (key) => {
      sandboxEnvironment();
      process.env.STRIPE_SECRET_KEY = key;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("blocks before authentication or checkout when isolated storage is not acknowledged", async () => {
      sandboxEnvironment();
      delete process.env.STRIPE_SANDBOX_ISOLATED_STORAGE_ACK;
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["starter", "growth"])("creates only the approved %s test price, with isolated metadata and no tax", async (plan) => {
      sandboxEnvironment();
      process.env.STRIPE_TAX_ENABLED = "1";
      process.env.STRIPE_PRICE_STARTER = "price_foreign";
      const fetchMock = checkoutFetch({ plan });
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(plan), response);
      expect(response.statusCode).toBe(200);
      expect(response.body.trialDays).toBe(90);
      const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/sessions"));
      const form = call[1].body;
      expect(form.get("line_items[0][price]")).toBe(STRIPE_SANDBOX_PLANS[plan].priceId);
      expect(form.get("automatic_tax[enabled]")).toBe("false");
      for (const prefix of ["metadata", "subscription_data[metadata]"]) {
        expect(form.get(`${prefix}[app]`)).toBe("godwit");
        expect(form.get(`${prefix}[billing_environment]`)).toBe("sandbox");
        expect(form.get(`${prefix}[workspace_id]`)).toBe("workspace-1");
        expect(form.get(`${prefix}[plan]`)).toBe(plan);
      }
    });

    it.each([
      { account: { id: "acct_foreign" } },
      { price: { ...sandboxPrice(), livemode: true } },
      { price: { ...sandboxPrice(), unit_amount: 1 } },
      { price: { ...sandboxPrice(), product: "prod_foreign" } }
    ])("rejects account or catalogue mismatches before session creation", async (override) => {
      sandboxEnvironment();
      const fetchMock = checkoutFetch(override);
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(500);
      expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/checkout/sessions"))).toBe(false);
    });

    it.each([true, undefined])("does not return a checkout URL without explicit test response (%s)", async (livemode) => {
      sandboxEnvironment();
      vi.stubGlobal("fetch", checkoutFetch({ checkout: { url: "https://checkout.stripe.com/fixture", livemode } }));
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(500);
      expect(response.body.url).toBeUndefined();
    });

    it("requires authentication", async () => {
      sandboxEnvironment();
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 401)));
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(401);
    });

    it("requires workspace management access before contacting Stripe", async () => {
      sandboxEnvironment();
      const fetchMock = checkoutFetch({ members: [] });
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(403);
      expect(fetchMock.mock.calls.some(([url]) => url.includes("api.stripe.com"))).toBe(false);
    });

    it("does not grant repeat trials", async () => {
      sandboxEnvironment();
      const fetchMock = checkoutFetch({ priorSubscription: true });
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(), response);
      expect(response.statusCode).toBe(200);
      expect(response.body.trialDays).toBe(0);
      const form = fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout/sessions"))[1].body;
      expect(form.has("subscription_data[trial_period_days]")).toBe(false);
    });

    it.each(["muse", "__proto__", "toString"])("rejects unapproved plan %s without contacting Stripe", async (plan) => {
      sandboxEnvironment();
      const fetchMock = checkoutFetch();
      vi.stubGlobal("fetch", fetchMock);
      const response = makeResponse();
      await handler(checkoutRequest(plan), response);
      expect(response.statusCode).toBe(503);
      expect(fetchMock.mock.calls.some(([url]) => url.includes("api.stripe.com"))).toBe(false);
    });
  });

  it.each(["donation", "connect-onboarding", "connect-status"])(
    "rejects %s before making network requests while donations are disabled",
    async (mode) => {
      sandboxEnvironment();
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = makeResponse();
      await handler(makeRequest({ mode }), response);

      expect(response.statusCode).toBe(503);
      expect(response.body.error).toBe("Donations are not enabled yet.");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("keeps subscription checkout behind its independent billing gate", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.BILLING_ENABLED = "0";

    const response = makeResponse();
    await handler(makeRequest({ mode: "subscription" }), response);

    expect(response.statusCode).toBe(503);
    expect(response.body.error).toBe("Paid subscriptions are unavailable during the free pilot.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
