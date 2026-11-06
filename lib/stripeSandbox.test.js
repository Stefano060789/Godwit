import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requireStripeSandbox, STRIPE_SANDBOX_ACCOUNT, STRIPE_SANDBOX_PLANS, stripeSandboxRequest,
  validateSandboxPrice, validateSandboxSubscription
} from "./stripeSandbox.js";
import { stripeRequest } from "./cron/cronHelpers.js";
import { runStripeReconciliation } from "./cron/stripeReconciliationJob.js";
import { jsonResponse, sandboxEnvironment, sandboxPrice, sandboxSubscription } from "../tests/stripeSandboxFixtures.js";

const originalEnv = { ...process.env };

describe("Stripe sandbox guards and reconciliation", () => {
  beforeEach(sandboxEnvironment);
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("pins a complete, distinct two-plan public catalogue", () => {
    expect(Object.keys(STRIPE_SANDBOX_PLANS)).toEqual(["starter", "growth"]);
    expect(STRIPE_SANDBOX_PLANS).toMatchObject({
      starter: { productId: "prod_VZz3nie3Csda5A", priceId: "price_1UYp5jC5ufGRzg9RpDhQdAl5", amount: 2900 },
      growth: { productId: "prod_VZz5Z2tJToSc6N", priceId: "price_1UYp7CC5ufGRzg9RnA4pt2On", amount: 7900 }
    });
    for (const plan of Object.values(STRIPE_SANDBOX_PLANS)) {
      expect(plan.priceId).toMatch(/^price_[A-Za-z0-9]+$/);
      expect(plan.productId).toMatch(/^prod_[A-Za-z0-9]+$/);
    }
    expect(STRIPE_SANDBOX_PLANS.starter.priceId).not.toBe(STRIPE_SANDBOX_PLANS.growth.priceId);
  });

  it.each(["starter", "growth"])("validates the %s catalogue price and subscription", (plan) => {
    expect(validateSandboxPrice(sandboxPrice(plan), plan)).toBe(STRIPE_SANDBOX_PLANS[plan]);
    expect(validateSandboxSubscription(sandboxSubscription(plan))).toMatchObject({ metadata: { plan } });
  });

  it("accepts a restricted test key but never a restricted live key", () => {
    process.env.STRIPE_SECRET_KEY = "rk_test_fixture";
    expect(requireStripeSandbox()).toBe("rk_test_fixture");
    process.env.STRIPE_SECRET_KEY = "rk_live_fixture";
    expect(() => requireStripeSandbox()).toThrow("test API key");
  });

  it.each(["missing-ack", "wrong-ack", "missing-url", "wrong-url", "invalid-url", "insecure-url"])(
    "blocks checkout/webhook shared guard and reconciliation without isolated storage (%s)", async (mode) => {
      if (mode === "missing-ack") delete process.env.STRIPE_SANDBOX_ISOLATED_STORAGE_ACK;
      if (mode === "wrong-ack") process.env.STRIPE_SANDBOX_ISOLATED_STORAGE_ACK = "true";
      if (mode === "missing-url") delete process.env.STRIPE_SANDBOX_SUPABASE_URL;
      if (mode === "wrong-url") process.env.STRIPE_SANDBOX_SUPABASE_URL = "https://different-project.test";
      if (mode === "invalid-url") {
        process.env.SUPABASE_URL = "invalid";
        process.env.STRIPE_SANDBOX_SUPABASE_URL = "invalid";
      }
      if (mode === "insecure-url") {
        process.env.SUPABASE_URL = "http://supabase.test";
        process.env.STRIPE_SANDBOX_SUPABASE_URL = "http://supabase.test";
      }
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect(() => requireStripeSandbox()).toThrow();
      await expect(stripeRequest("subscriptions/sub_fixture")).rejects.toThrow();
      await expect(runStripeReconciliation()).resolves.toMatchObject({ skipped: true });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([true, undefined])("rejects non-test Stripe API responses (%s)", async (livemode) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ livemode })));
    await expect(stripeSandboxRequest("subscriptions/sub_fixture")).rejects.toThrow("non-test response");
  });

  it.each(["disabled", "live-key"])("blocks the cron Stripe helper before network calls when %s", async (mode) => {
    if (mode === "disabled") process.env.STRIPE_SANDBOX_ENABLED = "0";
    else process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(stripeRequest("subscriptions/sub_fixture")).rejects.toThrow();
    await expect(runStripeReconciliation()).resolves.toMatchObject({ skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not report foreign shared-account subscriptions or touch donation records", async () => {
    const foreign = sandboxSubscription();
    foreign.metadata.app = "muse";
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("/v1/account")) return jsonResponse({ id: STRIPE_SANDBOX_ACCOUNT });
      if (url.includes("/workspace_subscriptions?")) {
        return jsonResponse([{ workspace_id: "workspace-1", stripe_subscription_id: "sub_foreign" }]);
      }
      if (url.includes("/v1/subscriptions/")) return jsonResponse(foreign);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(runStripeReconciliation()).rejects.toThrow("metadata does not match");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/donations?") || url.includes("/stripe_reconciliation_runs"))).toBe(false);
  });

  it("reconciles an owned sandbox subscription without querying payment intents or donations", async () => {
    const subscription = sandboxSubscription();
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url.endsWith("/v1/account")) return jsonResponse({ id: STRIPE_SANDBOX_ACCOUNT });
      if (url.includes("/workspace_subscriptions?")) return jsonResponse([{
        workspace_id: "workspace-1", stripe_subscription_id: subscription.id, status: "trialing",
        current_period_end: new Date(1800000000 * 1000).toISOString()
      }]);
      if (url.includes("/v1/subscriptions/")) return jsonResponse(subscription);
      if (url.endsWith("/stripe_reconciliation_runs") && options.method === "POST") return new Response(null, { status: 201 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(runStripeReconciliation()).resolves.toMatchObject({ checkedSubscriptions: 1, checkedDonations: 0, mismatchCount: 0 });
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/payment_intents/") || url.includes("/donations?"))).toBe(false);
  });

  it("blocks reconciliation on the wrong account before database reads or writes", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "acct_foreign" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(runStripeReconciliation()).rejects.toThrow("account does not match");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.stripe.com/v1/account");
  });
});
