import { supabase } from "./supabase";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";

function requireDonationFeature() {
  if (!DONATION_FEATURE_ENABLED) throw new Error("Donations are not enabled yet.");
}

function isMissingCategoryColumn(error) {
  return error?.code === "42703" || error?.message?.includes("donation_settings.category");
}

export async function loadDonationSettings(workspaceId) {
  const query = supabase
    .from("donation_settings")
    .select("is_enabled, category, currency, suggested_amount, message, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled")
    .eq("workspace_id", workspaceId);
  let { data, error } = await query.maybeSingle();
  if (isMissingCategoryColumn(error)) {
    ({ data, error } = await supabase
      .from("donation_settings")
      .select("is_enabled, currency, suggested_amount, message, stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled")
      .eq("workspace_id", workspaceId)
      .maybeSingle());
  }
  if (error) throw new Error(`Unable to load donation settings: ${error.message}`);
  return data ?? {
    is_enabled: false,
    category: "contribution",
    currency: "EUR",
    suggested_amount: "",
    message: "",
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false
  };
}

// Only the display/config fields are saved directly - the Stripe Connect fields are only
// ever written server-side (by the onboarding/status-refresh endpoints and the account.updated
// webhook), never from a plain form submit.
export async function saveDonationSettings(workspaceId, settings) {
  requireDonationFeature();
  const values = {
    workspace_id: workspaceId,
    is_enabled: Boolean(settings.is_enabled),
    category: ["tip", "contribution", "donation"].includes(settings.category) ? settings.category : "contribution",
    currency: (settings.currency || "EUR").trim().toUpperCase(),
    suggested_amount: settings.suggested_amount ? Number(settings.suggested_amount) : null,
    message: settings.message?.trim() || null,
    updated_at: new Date().toISOString()
  };
  let { error } = await supabase
    .from("donation_settings")
    .upsert(values);
  if (isMissingCategoryColumn(error)) {
    const legacyValues = { ...values };
    delete legacyValues.category;
    ({ error } = await supabase.from("donation_settings").upsert(legacyValues));
  }
  if (error) throw new Error(`Unable to save donation settings: ${error.message}`);
}

async function callCheckoutEndpoint(body) {
  requireDonationFeature();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to manage donations.");
  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Something went wrong with Stripe.");
  return payload;
}

// Redirects the admin to Stripe's hosted Connect onboarding (creating the Express account
// first, if this workspace doesn't have one yet). Call this and then navigate the browser to
// the returned url - it does not return to the caller.
export async function startStripeConnectOnboarding() {
  const { url } = await callCheckoutEndpoint({ mode: "connect-onboarding" });
  if (!url) throw new Error("Stripe did not return an onboarding link.");
  return url;
}

// Live status check, useful right after the admin returns from Stripe onboarding (the
// account.updated webhook is the long-term source of truth but can lag a few seconds).
export async function refreshStripeConnectStatus() {
  return callCheckoutEndpoint({ mode: "connect-status" });
}
