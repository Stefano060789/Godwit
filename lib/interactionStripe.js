import { randomUUID } from "node:crypto";
import { captureError } from "./errorReporting.js";

export const INTERACTION_PLANS = {
  small: { amount: 900, limit: 100 },
  standard: { amount: 2900, limit: 500 },
  scale: { amount: 7900, limit: 2000 },
  regional: { amount: 24900, limit: 10000 }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);

export function interactionStripeConfig() {
  const mode = process.env.INTERACTION_STRIPE_MODE;
  const key = process.env.INTERACTION_STRIPE_SECRET_KEY || "";
  const origin = new URL(process.env.APP_URL || "invalid:");
  if (process.env.INTERACTION_BILLING_ENABLED !== "1" || !["test", "live"].includes(mode)
    || !new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(key)
    || !/^acct_[A-Za-z0-9]+$/.test(process.env.INTERACTION_STRIPE_ACCOUNT_ID || "")
    || origin.protocol !== "https:" || origin.username || origin.password
    || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Interaction billing is not configured.");
  }
  if (mode === "test" && (process.env.INTERACTION_STRIPE_TEST_STORAGE_ACK !== "1"
    || process.env.INTERACTION_STRIPE_TEST_SUPABASE_URL !== process.env.SUPABASE_URL)) {
    throw new Error("Interaction test billing requires isolated database storage.");
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Billing database credentials are not configured.");
  }
  return { key, live: mode === "live", mode, origin: origin.origin };
}

export async function interactionStripeRequest(path, { form, idempotencyKey } = {}) {
  const config = interactionStripeConfig();
  const result = await fetch(`https://api.stripe.com/v1/${path}`, {
    signal: AbortSignal.timeout(15000),
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Stripe-Version": "2025-06-30.basil",
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    ...(form ? { body: form } : {})
  });
  if (!result.ok) throw new Error(`Stripe billing request failed (${result.status}).`);
  const object = await result.json();
  if (path === "account") {
    if (object.id !== process.env.INTERACTION_STRIPE_ACCOUNT_ID) throw new Error("Stripe billing account mismatch.");
  } else if (object.object === "list"
    ? !Array.isArray(object.data) || object.data.some(item => item.livemode !== config.live)
    : object.livemode !== config.live) {
    throw new Error("Stripe billing environment mismatch.");
  }
  return object;
}

export async function recoverPendingInteractionCheckout(checkout) {
  if (!/^pending_[0-9a-f-]{36}$/.test(checkout.checkout_session_id)) {
    throw new Error("Invalid pending checkout reservation.");
  }
  const end = Math.floor(new Date(checkout.expires_at).getTime() / 1000);
  if (!Number.isFinite(end)) throw new Error("Invalid checkout reservation expiry.");
  let after;
  for (;;) {
    const query = new URLSearchParams({
      "created[gte]": String(end - 37 * 60), "created[lte]": String(end),
      limit: "100", ...(after ? { starting_after: after } : {})
    });
    const sessions = await interactionStripeRequest(`checkout/sessions?${query}`);
    for (const session of sessions.data) {
      if (ownsInteractionObject(session) && session.metadata.workspace_id === checkout.workspace_id
        && session.metadata.checkout_reservation === checkout.checkout_session_id) return session;
    }
    if (!sessions.has_more) return null;
    after = sessions.data.at(-1)?.id;
    if (!after) throw new Error("Invalid checkout recovery page.");
  }
}

export async function clearInteractionCheckout(session) {
  const reservation = session.metadata?.checkout_reservation;
  const identifiers = [`checkout_session_id.eq.${session.id}`];
  if (/^pending_[0-9a-f-]{36}$/.test(reservation || "")) {
    identifiers.push(`checkout_session_id.eq.${reservation}`);
  }
  await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${encodeURIComponent(session.metadata.workspace_id)}&or=(${identifiers.join(",")})`,
    { method: "DELETE", prefer: "return=minimal" });
}

export async function billingDatabase(path, { body, method = body ? "POST" : "GET", prefer } = {}) {
  const result = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!result.ok) throw new Error(`Billing database request failed (${result.status}).`);
  return result.status === 204 ? null : result.json();
}

export function interactionPriceId(plan) {
  const suffix = plan === "topup" ? "TOPUP" : plan.toUpperCase();
  const id = process.env[`INTERACTION_STRIPE_PRICE_${suffix}`];
  if (!/^price_[A-Za-z0-9]+$/.test(id || "")) throw new Error("Billing price is not configured.");
  return id;
}

export function validateInteractionPrice(price, plan) {
  const { live } = interactionStripeConfig();
  const expected = plan === "topup" ? { amount: 700 } : INTERACTION_PLANS[plan];
  if (!expected || price.id !== interactionPriceId(plan) || price.livemode !== live
    || price.currency !== "eur" || price.unit_amount !== expected.amount
    || price.billing_scheme !== "per_unit" || price.tax_behavior !== "exclusive"
    || (plan === "topup" ? price.type !== "one_time" : (
      price.type !== "recurring" || price.recurring?.interval !== "month"
      || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== "licensed"
    ))) {
    throw new Error("Stripe price does not match the Godwit interaction catalogue.");
  }
  return plan;
}

export function ownsInteractionObject(object) {
  return object?.metadata?.app === "godwit"
    && object.metadata.billing_kind === "interactions"
    && object.metadata.billing_environment === `interactions-${interactionStripeConfig().mode}`;
}

export function validateInteractionSubscription(subscription) {
  if (!ownsInteractionObject(subscription) || !UUID.test(subscription.metadata.workspace_id || "")
    || !/^sub_[A-Za-z0-9]+$/.test(subscription.id || "")
    || !/^cus_[A-Za-z0-9]+$/.test(subscription.customer || "")
    || subscription.livemode !== interactionStripeConfig().live
    || subscription.items?.has_more || subscription.items?.data?.length !== 1) {
    throw new Error("Invalid Godwit interaction subscription.");
  }
  const item = subscription.items.data[0];
  const plan = Object.keys(INTERACTION_PLANS).find(key => interactionPriceId(key) === item.price?.id);
  if (!plan || item.quantity !== 1) throw new Error("Invalid Godwit subscription items.");
  validateInteractionPrice(item.price, plan);
  if (!Number.isInteger(item.current_period_start) || !Number.isInteger(item.current_period_end)
    || item.current_period_end <= item.current_period_start) throw new Error("Invalid billing period.");
  return plan;
}

export async function syncInteractionSubscription(subscription, eventCreated) {
  const plan = validateInteractionSubscription(subscription);
  const item = subscription.items.data[0];
  await billingDatabase("rpc/apply_interaction_subscription", { body: { subscription: {
    workspace_id: subscription.metadata.workspace_id,
    stripe_subscription_id: subscription.id, stripe_customer_id: subscription.customer,
    plan, status: subscription.status,
    period_start: new Date(item.current_period_start * 1000).toISOString(),
    period_end: new Date(item.current_period_end * 1000).toISOString(),
    event_created: eventCreated
  } } });
}

async function ownedWorkspace(request) {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const headers = { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const auth = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!auth.ok) return null;
  const user = await auth.json();
  const workspaceResult = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/current_workspace_id`, {
    method: "POST", headers, body: "{}"
  });
  if (!workspaceResult.ok) throw new Error("Unable to resolve billing account.");
  const workspaceId = await workspaceResult.json();
  if (!UUID.test(workspaceId || "")) return null;
  const rows = await billingDatabase(`workspaces?id=eq.${workspaceId}&owner_id=eq.${encodeURIComponent(user.id)}&select=id`);
  return rows?.length ? { workspaceId, user } : null;
}

function assertStripeUrl(url, host) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== host || parsed.username || parsed.password) {
    throw new Error("Stripe returned an invalid redirect URL.");
  }
  return url;
}

async function portal(customer, subscription, targetPlan) {
  const configId = process.env.INTERACTION_STRIPE_PORTAL_CONFIGURATION;
  if (!/^bpc_[A-Za-z0-9]+$/.test(configId || "")) throw new Error("Billing portal is not configured.");
  const config = await interactionStripeRequest(`billing_portal/configurations/${configId}`);
  const update = config.features?.subscription_update;
  const cancel = config.features?.subscription_cancel;
  const allowedPrices = Object.keys(INTERACTION_PLANS).map(interactionPriceId);
  const portalPrices = update?.products?.flatMap(product => product.prices) || [];
  if (!config.active || config.metadata?.app !== "godwit" || config.metadata?.billing_kind !== "interactions"
    || update?.enabled !== true || update.proration_behavior !== "always_invoice"
    || update.billing_cycle_anchor === "now"
    || JSON.stringify(update.default_allowed_updates) !== '["price"]'
    || !update.schedule_at_period_end?.conditions?.some(condition => condition.type === "decreasing_item_amount")
    || portalPrices.length !== 4 || !allowedPrices.every(price => portalPrices.includes(price))
    || !cancel?.enabled || cancel.mode !== "at_period_end") {
    throw new Error("Billing portal configuration does not match the approved plan-change rules.");
  }
  const form = new URLSearchParams({
    customer, configuration: configId, return_url: `${interactionStripeConfig().origin}/billing`
  });
  if (targetPlan) {
    form.set("flow_data[type]", "subscription_update_confirm");
    form.set("flow_data[subscription_update_confirm][subscription]", subscription.id);
    form.set("flow_data[subscription_update_confirm][items][0][id]", subscription.items.data[0].id);
    form.set("flow_data[subscription_update_confirm][items][0][price]", interactionPriceId(targetPlan));
    form.set("flow_data[subscription_update_confirm][items][0][quantity]", "1");
  }
  const session = await interactionStripeRequest("billing_portal/sessions", { form });
  return assertStripeUrl(session.url, "billing.stripe.com");
}

export async function handleInteractionCheckout(request, response) {
  try { interactionStripeConfig(); } catch (error) {
    captureError("Interaction billing configuration unavailable", error);
    return response.status(503).json({ error: "Interaction payments are not configured yet. Please contact support." });
  }
  let reservation;
  let workspaceId;
  let checkoutAttempted = false;
  try {
    const owner = await ownedWorkspace(request);
    if (!owner) return response.status(403).json({ error: "Sign in as the account owner to manage billing." });
    ({ workspaceId } = owner);
    const mode = request.body.mode;
    const plan = request.body.plan;
    if (mode === "interaction-subscription" && !Object.hasOwn(INTERACTION_PLANS, plan || "")) {
      return response.status(400).json({ error: "Choose a valid interaction plan." });
    }
    const usage = await billingDatabase("rpc/workspace_interaction_status", {
      body: { target_workspace_id: workspaceId }
    });
    if (usage?.state === "complimentary" && mode !== "interaction-portal") {
      return response.status(409).json({ error: "Creator access is complimentary. No subscription or interaction pack is needed." });
    }
    await interactionStripeRequest("account");
    const rows = await billingDatabase(`workspace_interaction_subscriptions?workspace_id=eq.${workspaceId}&select=*`);
    const current = rows?.[0];
    let remote;
    if (current?.stripe_subscription_id) {
      remote = await interactionStripeRequest(`subscriptions/${encodeURIComponent(current.stripe_subscription_id)}`);
      validateInteractionSubscription(remote);
      if (remote.metadata.workspace_id !== workspaceId || remote.customer !== current.stripe_customer_id) {
        throw new Error("Subscription account mismatch.");
      }
    }
    if (mode === "interaction-portal" || (mode === "interaction-subscription" && OPEN_STATUSES.has(remote?.status))) {
      if (!remote) return response.status(409).json({ error: "No paid subscription to manage." });
      return response.status(200).json({ url: await portal(remote.customer, remote,
        mode === "interaction-subscription" ? plan : null) });
    }
    const isTopup = mode === "interaction-topup";
    if (isTopup && (!remote || remote.status !== "active"
      || remote.items.data[0].current_period_end * 1000 <= Date.now())) {
      return response.status(409).json({ error: "An active paid plan is required to buy an interaction pack." });
    }
    const openCheckouts = await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${workspaceId}&select=*`);
    const previousCheckout = openCheckouts?.[0];
    if (previousCheckout) {
      const previousSession = previousCheckout.checkout_session_id.startsWith("cs_")
        ? await interactionStripeRequest(`checkout/sessions/${encodeURIComponent(previousCheckout.checkout_session_id)}`)
        : await recoverPendingInteractionCheckout(previousCheckout);
      if (!previousSession && new Date(previousCheckout.expires_at).getTime() > Date.now()) {
        return response.status(409).json({ error: "Your previous checkout is still being confirmed. Please try again later." });
      }
      if (previousSession) {
        if (!ownsInteractionObject(previousSession) || previousSession.metadata.workspace_id !== workspaceId) {
          throw new Error("Existing checkout account mismatch.");
        }
        if (previousSession.status === "complete") {
          if (previousSession.mode === "subscription") {
            const previousSubscription = await interactionStripeRequest(`subscriptions/${encodeURIComponent(previousSession.subscription)}`);
            if (previousSubscription.metadata.workspace_id !== workspaceId) throw new Error("Existing subscription workspace mismatch.");
            await syncInteractionSubscription(previousSubscription, Math.floor(Date.now() / 1000));
            await clearInteractionCheckout(previousSession);
          }
          return response.status(409).json({ error: "Your previous payment is being confirmed. Refresh billing before starting another checkout." });
        }
        if (previousSession.status === "open") {
          return response.status(409).json({ error: "A checkout is already open. Complete it or wait for it to expire before trying again." });
        }
        if (previousSession.status !== "expired") throw new Error("Unexpected checkout state.");
      }
      await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${workspaceId}&checkout_session_id=eq.${encodeURIComponent(previousCheckout.checkout_session_id)}`,
        { method: "DELETE", prefer: "return=minimal" });
    }
    const price = await interactionStripeRequest(`prices/${interactionPriceId(isTopup ? "topup" : plan)}`);
    validateInteractionPrice(price, isTopup ? "topup" : plan);
    if (!price.active) throw new Error("Billing price is inactive.");
    reservation = `pending_${randomUUID()}`;
    const reserved = await billingDatabase("workspace_billing_checkouts?on_conflict=workspace_id", {
      body: { workspace_id: workspaceId, checkout_session_id: reservation, expires_at: new Date(Date.now() + 35 * 60000).toISOString() },
      prefer: "resolution=ignore-duplicates,return=representation"
    });
    if (!reserved?.length) return response.status(409).json({ error: "A checkout is already open. Complete it or wait for it to expire before trying again." });
    const metadata = { app: "godwit", billing_kind: "interactions",
      billing_environment: `interactions-${interactionStripeConfig().mode}`, workspace_id: workspaceId,
      purchase: isTopup ? "topup" : "subscription", checkout_reservation: reservation };
    const form = new URLSearchParams({
      mode: isTopup ? "payment" : "subscription",
      success_url: `${interactionStripeConfig().origin}/billing?checkout=success`,
      cancel_url: `${interactionStripeConfig().origin}/billing?checkout=cancelled`,
      "line_items[0][price]": price.id, "line_items[0][quantity]": "1",
      "automatic_tax[enabled]": "true", billing_address_collection: "required",
      "tax_id_collection[enabled]": "true", expires_at: String(Math.floor(Date.now() / 1000) + 1800)
    });
    for (const [key, value] of Object.entries(metadata)) {
      form.set(`metadata[${key}]`, value);
      form.set(`${isTopup ? "payment_intent_data" : "subscription_data"}[metadata][${key}]`, value);
    }
    if (remote?.customer) {
      form.set("customer", remote.customer);
      form.set("customer_update[address]", "auto");
      form.set("customer_update[name]", "auto");
    } else if (owner.user.email) form.set("customer_email", owner.user.email);
    checkoutAttempted = true;
    const session = await interactionStripeRequest("checkout/sessions", { form, idempotencyKey: reservation });
    const url = assertStripeUrl(session.url, "checkout.stripe.com");
    await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${workspaceId}&checkout_session_id=eq.${reservation}`, {
      method: "PATCH", body: { checkout_session_id: session.id, expires_at: new Date(session.expires_at * 1000).toISOString() },
      prefer: "return=minimal"
    });
    return response.status(200).json({ url });
  } catch (error) {
    if (reservation && workspaceId && !checkoutAttempted) {
      try {
        await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${workspaceId}&checkout_session_id=eq.${reservation}`,
          { method: "DELETE", prefer: "return=minimal" });
      } catch (cleanupError) { captureError("Billing checkout reservation cleanup failed", cleanupError); }
    }
    captureError("Interaction checkout failed", error);
    return response.status(500).json({ error: "Unable to open billing. Please try again or contact support." });
  }
}
