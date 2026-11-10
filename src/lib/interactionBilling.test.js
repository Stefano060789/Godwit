import { describe, expect, it, vi } from "vitest";
import { createInteractionCheckout, INTERACTION_PLANS, interactionUsageProgress, isInteractionPaidPlan, loadInteractionBilling } from "./interactionBilling";

function clientWith({ user = { id: "user-1" }, membership = { workspace_id: "workspace-1", role: "owner" }, usage = { state: "active", plan: "standard" }, authError = null, membershipError = null, usageError = null } = {}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: membershipError })
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "local-test-token" } }, error: null })
    },
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockResolvedValue({ data: usage, error: usageError }),
    query
  };
}

describe("interaction plans and progress", () => {
  it("keeps the approved monthly allowances and EUR prices", () => {
    expect(INTERACTION_PLANS.map(({ key, interactions, price }) => [key, interactions, price])).toEqual([
      ["small", 100, 9], ["standard", 500, 29], ["scale", 2000, 79], ["regional", 10000, 249]
    ]);
    expect(isInteractionPaidPlan("standard")).toBe(true);
    for (const plan of ["trial", "starter", "free", undefined]) expect(isInteractionPaidPlan(plan)).toBe(false);
  });

  it.each([
    [{ base_limit: 100, base_used: 90 }, 90],
    [{ base_limit: 100, base_used: 120 }, 100],
    [{ base_limit: 100, base_used: -10 }, 0],
    [{ base_limit: 0, base_used: 0 }, 0],
    [{ base_limit: 100, base_used: "bad" }, 0],
    [null, 0]
  ])("clamps progress for %j", (usage, progress) => {
    expect(interactionUsageProgress(usage)).toBe(progress);
  });
});

describe("read-only billing load", () => {
  it("does not query or create a workspace for anonymous visitors", async () => {
    const client = clientWith({ user: null });
    expect(await loadInteractionBilling(client)).toEqual({ signedIn: false, membership: null, usage: null });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { name: "AuthSessionMissingError", message: "Auth session missing!" },
    { message: "Auth session missing!" }
  ])("treats the expected Supabase missing-session result as signed out: %j", async (authError) => {
    const client = clientWith({ user: null, authError });
    expect(await loadInteractionBilling(client)).toEqual({ signedIn: false, membership: null, usage: null });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("does not bootstrap an account with no membership", async () => {
    const client = clientWith({ membership: null });
    expect(await loadInteractionBilling(client)).toEqual({ signedIn: true, membership: null, usage: null });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.query.select).toHaveBeenCalledWith("workspace_id, role");
    expect(client.query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(client.query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(client.query.limit).toHaveBeenCalledWith(1);
  });

  it("reads the existing workspace role and authoritative usage RPC", async () => {
    const usage = { state: "exhausted", plan: "small", can_topup: true, next_plan: "standard" };
    const client = clientWith({ usage });
    expect(await loadInteractionBilling(client)).toEqual({
      signedIn: true, membership: { workspace_id: "workspace-1", role: "owner" }, usage
    });
    expect(client.from).toHaveBeenCalledWith("workspace_members");
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("workspace_interaction_status", { target_workspace_id: "workspace-1" });
  });

  it("accepts database-granted complimentary creator access", async () => {
    const usage = { state: "complimentary", plan: "creator", unlimited: true, can_topup: false };
    expect((await loadInteractionBilling(clientWith({ usage }))).usage).toEqual(usage);
  });

  it.each(["authError", "membershipError", "usageError"])("does not swallow %s", async (field) => {
    const client = clientWith({ [field]: { message: "Local failure" } });
    await expect(loadInteractionBilling(client)).rejects.toThrow("Local failure");
  });

  it.each([null, {}, { state: "unknown" }])("rejects unavailable usage %j", async (usage) => {
    await expect(loadInteractionBilling(clientWith({ usage }))).rejects.toThrow("Interaction usage is unavailable");
  });
});

describe("local checkout contract", () => {
  it.each([
    { mode: "interaction-subscription", plan: "small" },
    { mode: "interaction-subscription", plan: "regional" },
    { mode: "interaction-topup" },
    { mode: "interaction-portal" }
  ])("posts bearer-authenticated %j without workspace or price input", async (action) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/local-test" }) });
    expect(await createInteractionCheckout(clientWith(), action, fetchImpl)).toBe("https://checkout.stripe.com/local-test");
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local-test-token" },
      body: JSON.stringify(action)
    });
  });

  it("never sends a plan with portal or top-up requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://billing.stripe.com/test" }) });
    await createInteractionCheckout(clientWith(), { mode: "interaction-portal", plan: "scale" }, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ mode: "interaction-portal" });
  });

  it.each([{ mode: "unknown" }, { mode: "interaction-subscription", plan: "trial" }])("rejects invalid %j before fetching", async (action) => {
    const fetchImpl = vi.fn();
    await expect(createInteractionCheckout(clientWith(), action, fetchImpl)).rejects.toThrow("Invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an expired sign-in without making an API call", async () => {
    const client = clientWith();
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const fetchImpl = vi.fn();
    await expect(createInteractionCheckout(client, { mode: "interaction-topup" }, fetchImpl)).rejects.toThrow("Sign in again");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shows session errors without making an API call", async () => {
    const client = clientWith();
    client.auth.getSession.mockResolvedValue({ data: null, error: { message: "Session unavailable" } });
    const fetchImpl = vi.fn();
    await expect(createInteractionCheckout(client, { mode: "interaction-topup" }, fetchImpl)).rejects.toThrow("Session unavailable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [{ error: "Payments are not configured" }, "Payments are not configured"],
    [{ error: { message: "Only the owner can purchase" } }, "Only the owner can purchase"],
    [{ message: "Top-up not available for trial" }, "Top-up not available for trial"],
    [{}, "HTTP 503"]
  ])("preserves API errors %j", async (result, message) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => result });
    await expect(createInteractionCheckout(clientWith(), { mode: "interaction-topup" }, fetchImpl)).rejects.toThrow(message);
  });

  it("explains missing endpoints instead of treating HTML as checkout", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error("Not JSON"); } });
    await expect(createInteractionCheckout(clientWith(), { mode: "interaction-topup" }, fetchImpl)).rejects.toThrow("Billing service unavailable (HTTP 404)");
  });

  it("preserves network failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    await expect(createInteractionCheckout(clientWith(), { mode: "interaction-portal" }, fetchImpl)).rejects.toThrow("Network unavailable");
  });

  it.each([undefined, "", "/billing", "javascript:alert(1)", "http://example.com/checkout"])("rejects missing or unsafe redirect %s", async (url) => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) });
    await expect(createInteractionCheckout(clientWith(), { mode: "interaction-topup" }, fetchImpl)).rejects.toThrow(/checkout URL/);
  });
});
