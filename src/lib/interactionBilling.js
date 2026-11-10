export const INTERACTION_PLANS = [
  { key: "small", interactions: 100, price: 9 },
  { key: "standard", interactions: 500, price: 29, highlight: true },
  { key: "scale", interactions: 2000, price: 79 },
  { key: "regional", interactions: 10000, price: 249 }
];

export function isInteractionPaidPlan(plan) {
  return INTERACTION_PLANS.some((tier) => tier.key === plan);
}

export function interactionUsageProgress(usage) {
  const limit = Number(usage?.base_limit);
  const used = Number(usage?.base_used);
  return limit > 0 && Number.isFinite(used)
    ? Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
    : 0;
}

export async function loadInteractionBilling(client) {
  const { data, error: authError } = await client.auth.getUser();
  if (!data?.user && authError?.name === "AuthSessionMissingError") {
    return { signedIn: false, membership: null, usage: null };
  }
  if (!data?.user && authError?.message === "Auth session missing!") {
    return { signedIn: false, membership: null, usage: null };
  }
  if (authError) throw new Error(authError.message);
  if (!data?.user?.id) return { signedIn: false, membership: null, usage: null };

  // Match the server's current workspace lookup without bootstrapping a workspace.
  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership?.workspace_id) return { signedIn: true, membership: null, usage: null };

  const { data: usage, error: usageError } = await client.rpc("workspace_interaction_status", {
    target_workspace_id: membership.workspace_id
  });
  if (usageError) throw new Error(usageError.message);
  if (!usage || !["active", "exhausted", "expired", "inactive", "legacy", "complimentary"].includes(usage.state)) {
    throw new Error("Interaction usage is unavailable.");
  }
  return { signedIn: true, membership, usage };
}

export async function createInteractionCheckout(client, { mode, plan }, fetchImpl = fetch) {
  if (!["interaction-subscription", "interaction-topup", "interaction-portal"].includes(mode)) {
    throw new Error("Invalid billing action.");
  }
  if (mode === "interaction-subscription" && !isInteractionPaidPlan(plan)) {
    throw new Error("Invalid interaction plan.");
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sign in again to continue to billing.");

  const response = await fetchImpl("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(mode === "interaction-subscription" ? { mode, plan } : { mode })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Billing service unavailable (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = typeof result?.error === "string" ? result.error : result?.error?.message || result?.message;
    throw new Error(detail || `Billing request failed (HTTP ${response.status}).`);
  }
  let url;
  try {
    url = new URL(result?.url);
  } catch {
    throw new Error("Billing service did not return a valid checkout URL.");
  }
  if (url.protocol !== "https:") throw new Error("Billing service returned an unsafe checkout URL.");
  return url.href;
}
