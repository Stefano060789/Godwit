// This one endpoint now handles four related "create something Stripe-hosted" flows,
// dispatched by request.body.mode, rather than adding new files - the project is already at
// Vercel Hobby's 12-serverless-function ceiling (see docs/TODO.md).
//   - "subscription" (default, original behavior): workspace plan checkout.
//   - "connect-onboarding": creates (or resumes) a Stripe Connect Express account for the
//     workspace and returns a hosted onboarding link. Requires an authenticated owner/editor.
//   - "connect-status": live refresh of a workspace's Connect account status, in case the
//     account.updated webhook hasn't arrived yet by the time the admin returns from Stripe.
//   - "donation": public, no auth - a voter donating through a QR code. Creates a destination
//     charge Checkout Session that sends 91% to the workspace's connected account and a 9%
//     application fee to the platform account.

import { captureError } from "../lib/errorReporting.js";
import { DONATION_FEATURE_ENABLED } from "../lib/donationFeature.js";
import {
  STRIPE_SANDBOX_PLANS as PLANS,
  requireStripeSandbox,
  stripeSandboxRequest,
  validateSandboxPrice
} from "../lib/stripeSandbox.js";

const DONATION_PLATFORM_FEE_RATE = 0.09;
const DONATION_MIN_AMOUNT = 1;
const DONATION_MAX_AMOUNT = 10000;

function readBearerToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function stripeRequest(path, form, method = "POST") {
  return stripeSandboxRequest(path, { form, method });
}

async function supabaseServiceRequest(path, { method = "GET", body, prefer } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service credentials are not configured.");
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.message || `Supabase request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

async function getAuthenticatedUser(token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !token) return null;

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` }
  });

  return authResponse.ok ? authResponse.json() : null;
}

async function getManagedWorkspace(token, userId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const headers = { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const workspaceResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/current_workspace_id`, { method: "POST", headers, body: "{}" });
  if (!workspaceResponse.ok) return null;
  const workspaceId = await workspaceResponse.json();
  const memberResponse = await fetch(`${supabaseUrl}/rest/v1/workspace_members?select=role&workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,editor)&limit=1`, { headers });
  const members = memberResponse.ok ? await memberResponse.json() : [];
  return members.length ? workspaceId : null;
}

// A workspace only ever gets a row in workspace_subscriptions once its first Stripe
// checkout completes (there's no default row created up front). So "a row exists at
// all" - regardless of its current plan/status - reliably means this workspace has
// already been through Stripe checkout at least once, which is what disqualifies it
// from a second free trial (otherwise: subscribe, cancel, resubscribe, repeat forever).
const FREE_TRIAL_DAYS = 90;

async function hasUsedTrialBefore(headers, workspaceId) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return true; // fail closed: no trial if we can't check
  const response = await fetch(
    `${supabaseUrl}/rest/v1/workspace_subscriptions?select=workspace_id&workspace_id=eq.${encodeURIComponent(workspaceId)}&limit=1`,
    { headers }
  );
  if (!response.ok) return true; // fail closed
  const rows = await response.json();
  return rows.length > 0;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const mode = String(request.body?.mode || "subscription");
  if (mode === "connect-onboarding") return handleConnectOnboarding(request, response);
  if (mode === "connect-status") return handleConnectStatus(request, response);
  if (mode === "donation") return handleDonationCheckout(request, response);
  if (mode !== "subscription") return response.status(400).json({ error: "Unsupported checkout mode." });
  return handleSubscriptionCheckout(request, response);
}

async function handleSubscriptionCheckout(request, response) {
  // Subscription billing remains disabled during the explicit free pilot. Donation
  // and Connect modes are separate flows and continue to be handled below.
  if (process.env.BILLING_ENABLED !== "1") {
    return response.status(503).json({ error: "Paid subscriptions are unavailable during the free pilot." });
  }
  try {
    requireStripeSandbox();
  } catch {
    return response.status(503).json({ error: "Stripe sandbox billing is not configured." });
  }
  const planKey = String(request.body?.plan || "");
  const plan = Object.hasOwn(PLANS, planKey) ? PLANS[planKey] : null;
  const priceId = plan?.priceId;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL || request.headers.origin;
  const user = await getAuthenticatedUser(readBearerToken(request));

  if (!user) return response.status(401).json({ error: "Sign in to start a subscription." });
  if (!plan || !priceId) return response.status(503).json({ error: "This plan is not configured yet." });
  if (!stripeSecretKey || !appUrl) return response.status(503).json({ error: "Billing is not configured yet." });
  const workspaceId = await getManagedWorkspace(readBearerToken(request), user.id);
  if (!workspaceId) return response.status(403).json({ error: "A workspace owner or editor role is required." });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const alreadyTrialed = supabaseUrl && supabaseAnonKey
    ? await hasUsedTrialBefore({ apikey: supabaseAnonKey, Authorization: `Bearer ${readBearerToken(request)}` }, workspaceId)
    : true;
  const trialEligible = planKey !== "free" && !alreadyTrialed;

  const form = new URLSearchParams({
    mode: "subscription",
    success_url: `${appUrl}/admin/billing?checkout=success${trialEligible ? "&trial=1" : ""}`,
    cancel_url: `${appUrl}/admin/billing?checkout=cancelled`,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "automatic_tax[enabled]": "false",
    "metadata[app]": "godwit",
    "metadata[billing_environment]": "sandbox",
    "metadata[plan]": planKey,
    "metadata[supabase_user_id]": user.id,
    "metadata[workspace_id]": workspaceId,
    "subscription_data[metadata][plan]": planKey,
    "subscription_data[metadata][workspace_id]": workspaceId,
    "subscription_data[metadata][app]": "godwit",
    "subscription_data[metadata][billing_environment]": "sandbox",
    client_reference_id: user.id
  });
  if (user.email) form.set("customer_email", user.email);
  if (trialEligible) {
    form.set("subscription_data[trial_period_days]", String(FREE_TRIAL_DAYS));
    // If a trial ends with no payment method on file, cancel it rather than silently
    // billing a card that was never actually confirmed.
    form.set("subscription_data[trial_settings][end_behavior][missing_payment_method]", "cancel");
    form.set("payment_method_collection", "always");
  }
  try {
    await stripeSandboxRequest("account");
    const price = await stripeSandboxRequest(`prices/${encodeURIComponent(priceId)}`);
    validateSandboxPrice(price, planKey);
    if (price.active !== true) throw new Error("Stripe sandbox price is not active.");
    const checkout = await stripeRequest("/checkout/sessions", form);
    if (!checkout.url) throw new Error("Stripe did not return a checkout URL.");
    return response.status(200).json({ url: checkout.url, plan: plan.label, trialDays: trialEligible ? FREE_TRIAL_DAYS : 0 });
  } catch (error) {
    captureError("Stripe Checkout error", error);
    return response.status(500).json({ error: "Unable to start checkout right now." });
  }
}

// Creates (or resumes) a Stripe Connect Express account for the caller's workspace and
// returns a fresh, short-lived hosted onboarding link. Safe to call repeatedly - Account
// Links expire quickly, and re-running account creation for an existing account id is a
// no-op on Stripe's side (we just skip straight to a new Account Link).
async function handleConnectOnboarding(request, response) {
  if (!DONATION_FEATURE_ENABLED) return response.status(503).json({ error: "Donations are not enabled yet." });
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL || request.headers.origin;
  const user = await getAuthenticatedUser(readBearerToken(request));

  if (!user) return response.status(401).json({ error: "Sign in to connect Stripe." });
  if (!stripeSecretKey || !appUrl) return response.status(503).json({ error: "Donations are not configured yet." });
  const workspaceId = await getManagedWorkspace(readBearerToken(request), user.id);
  if (!workspaceId) return response.status(403).json({ error: "A workspace owner or editor role is required." });

  try {
    const existingRows = await supabaseServiceRequest(
      `/rest/v1/donation_settings?select=stripe_account_id&workspace_id=eq.${encodeURIComponent(workspaceId)}`
    );
    let accountId = existingRows?.[0]?.stripe_account_id || null;

    if (!accountId) {
      const accountForm = new URLSearchParams({
        type: "express",
        email: user.email || "",
        // "individual" is a sensible default for the vast majority of solo artists/small
        // venues using this - it saves them one step in Stripe's own onboarding form. They can
        // still change it there if they're actually a registered company.
        business_type: "individual",
        "capabilities[card_payments][requested]": "true",
        "capabilities[transfers][requested]": "true",
        "metadata[workspace_id]": workspaceId
      });
      const account = await stripeRequest("/accounts", accountForm);
      accountId = account.id;
      await supabaseServiceRequest("/rest/v1/donation_settings?on_conflict=workspace_id", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { workspace_id: workspaceId, stripe_account_id: accountId, updated_at: new Date().toISOString() }
      });
    }

    const linkForm = new URLSearchParams({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${appUrl}/admin?tab=engagement&donations=refresh`,
      return_url: `${appUrl}/admin?tab=engagement&donations=connected`
    });
    const accountLink = await stripeRequest("/account_links", linkForm);
    return response.status(200).json({ url: accountLink.url });
  } catch (error) {
    captureError("Stripe Connect onboarding error", error);
    return response.status(500).json({ error: "Unable to start Stripe onboarding right now." });
  }
}

// Live refresh of a workspace's Connect account status. The account.updated webhook is the
// primary source of truth (see api/stripe-webhook.js), but an admin returning from Stripe's
// hosted onboarding shouldn't have to wait for webhook delivery to see an accurate status.
async function handleConnectStatus(request, response) {
  if (!DONATION_FEATURE_ENABLED) return response.status(503).json({ error: "Donations are not enabled yet." });
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const user = await getAuthenticatedUser(readBearerToken(request));
  if (!user) return response.status(401).json({ error: "Sign in to check Stripe status." });
  if (!stripeSecretKey) return response.status(503).json({ error: "Donations are not configured yet." });
  const workspaceId = await getManagedWorkspace(readBearerToken(request), user.id);
  if (!workspaceId) return response.status(403).json({ error: "A workspace owner or editor role is required." });

  try {
    const existingRows = await supabaseServiceRequest(
      `/rest/v1/donation_settings?select=stripe_account_id&workspace_id=eq.${encodeURIComponent(workspaceId)}`
    );
    const existing = existingRows?.[0];
    if (!existing?.stripe_account_id) return response.status(200).json({ connected: false });

    const account = await stripeRequest(`/accounts/${existing.stripe_account_id}`, null, "GET");
    await supabaseServiceRequest("/rest/v1/donation_settings?on_conflict=workspace_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: {
        workspace_id: workspaceId,
        stripe_account_id: account.id,
        stripe_onboarding_complete: Boolean(account.details_submitted),
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        updated_at: new Date().toISOString()
      }
    });
    return response.status(200).json({
      connected: true,
      chargesEnabled: Boolean(account.charges_enabled),
      payoutsEnabled: Boolean(account.payouts_enabled),
      detailsSubmitted: Boolean(account.details_submitted)
    });
  } catch (error) {
    captureError("Stripe Connect status refresh error", error);
    return response.status(500).json({ error: "Unable to check Stripe status right now." });
  }
}

// Public, no-auth: a voter donating through a QR code. Creates a Stripe Connect "destination
// charge" - the platform account is charged, a 9% application fee stays with the platform,
// and the rest transfers straight to the workspace's connected account.
async function handleDonationCheckout(request, response) {
  if (!DONATION_FEATURE_ENABLED) return response.status(503).json({ error: "Donations are not enabled yet." });
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL || request.headers.origin;
  const campaignToken = String(request.body?.campaignToken || "").trim();
  const itemId = Number(request.body?.itemId);
  const amount = Number(request.body?.amount);

  if (!stripeSecretKey || !appUrl) return response.status(503).json({ error: "Donations are not configured yet." });
  if (!campaignToken || !Number.isFinite(itemId)) return response.status(400).json({ error: "Missing donation target." });
  if (!Number.isFinite(amount) || amount < DONATION_MIN_AMOUNT || amount > DONATION_MAX_AMOUNT) {
    return response.status(400).json({ error: `Enter an amount between ${DONATION_MIN_AMOUNT} and ${DONATION_MAX_AMOUNT}.` });
  }

  try {
    const targetRows = await supabaseServiceRequest("/rest/v1/rpc/get_donation_checkout_target", {
      method: "POST",
      body: { target_token: campaignToken, target_item_id: itemId }
    });
    const target = targetRows?.[0];
    if (!target?.stripe_account_id) {
      return response.status(404).json({ error: "This donation option is not available right now." });
    }

    const workspaceRows = await supabaseServiceRequest(
      `/rest/v1/workspaces?select=name&id=eq.${encodeURIComponent(target.workspace_id)}`
    );
    const workspaceName = workspaceRows?.[0]?.name || "this venue";
    const currency = (target.currency || "EUR").toLowerCase();
    const amountMinorUnits = Math.round(amount * 100);
    const applicationFeeMinorUnits = Math.round(amountMinorUnits * DONATION_PLATFORM_FEE_RATE);

    const form = new URLSearchParams({
      mode: "payment",
      success_url: `${appUrl}/qr/${encodeURIComponent(campaignToken)}?donation=success`,
      cancel_url: `${appUrl}/qr/${encodeURIComponent(campaignToken)}?donation=cancelled`,
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][product_data][name]": `${target.category === "tip" ? "Tip" : target.category === "donation" ? "Charitable donation" : "Voluntary contribution"} to ${workspaceName}`,
      "line_items[0][price_data][unit_amount]": String(amountMinorUnits),
      "line_items[0][quantity]": "1",
      "payment_intent_data[application_fee_amount]": String(applicationFeeMinorUnits),
      "payment_intent_data[transfer_data][destination]": target.stripe_account_id,
      "metadata[kind]": "donation",
      "metadata[workspace_id]": target.workspace_id,
      "metadata[campaign_id]": String(target.campaign_id),
      "metadata[item_id]": String(itemId),
      "metadata[category]": target.category || "contribution",
      "metadata[application_fee_amount]": String(applicationFeeMinorUnits),
      "metadata[currency]": currency
    });

    const checkout = await stripeRequest("/checkout/sessions", form);
    if (!checkout.url) throw new Error("Stripe did not return a checkout URL.");
    return response.status(200).json({ url: checkout.url });
  } catch (error) {
    captureError("Donation checkout error", error);
    return response.status(500).json({ error: "Unable to start the donation right now." });
  }
}
