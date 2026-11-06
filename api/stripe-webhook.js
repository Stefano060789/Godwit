import { createHmac, timingSafeEqual } from "node:crypto";
import { captureError } from "../lib/errorReporting.js";
import {
  hasGodwitSandboxMetadata,
  requireStripeSandbox,
  stripeSandboxRequest,
  validateSandboxSubscription
} from "../lib/stripeSandbox.js";

function verifyStripeSignature(payload, signatureHeader, secret) {
  const timestamp = signatureHeader?.match(/(?:^|,)t=(\d+)/)?.[1];
  const signatures = [...(signatureHeader?.matchAll(/(?:^|,)v1=([^,]+)/g) ?? [])].map((match) => match[1]);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    const received = Buffer.from(signature, "hex");
    const calculated = Buffer.from(expected, "hex");
    return received.length === calculated.length && timingSafeEqual(received, calculated);
  });
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function upsertSubscription(subscription) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase webhook credentials are not configured.");

  const response = await fetch(`${supabaseUrl}/rest/v1/workspace_subscriptions?on_conflict=workspace_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(subscription)
  });
  if (!response.ok) throw new Error(`Supabase subscription update failed (${response.status}).`);
}

// Claim an audited delivery, skipping completed duplicates but allowing incomplete writes to retry.
async function recordWebhookEventIfNew(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase webhook credentials are not configured.");

  const response = await fetch(`${supabaseUrl}/rest/v1/stripe_webhook_events?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation"
    },
    body: JSON.stringify({ id: event.id, event_type: event.type, payload: event })
  });
  if (!response.ok) throw new Error("Stripe webhook audit write failed.");
  const rows = await response.json();
  if (rows.length > 0) return true;
  // Retry incomplete deliveries: the subscription write is an idempotent upsert.
  const existing = await fetch(`${supabaseUrl}/rest/v1/stripe_webhook_events?id=eq.${encodeURIComponent(event.id)}&select=processed_at,error`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  });
  if (!existing.ok) throw new Error("Stripe webhook audit lookup failed.");
  const previous = await existing.json();
  return !previous[0]?.processed_at || Boolean(previous[0]?.error);
}

async function markWebhookEventProcessed(eventId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !eventId) return;
  await fetch(`${supabaseUrl}/rest/v1/stripe_webhook_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({ processed_at: new Date().toISOString(), error: null })
  }).catch(() => {}); // best-effort - never let audit-log bookkeeping fail the webhook response
}

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    requireStripeSandbox();
  } catch {
    return response.status(503).json({ error: "Stripe sandbox billing is not configured." });
  }
  // Only Godwit's platform test endpoint secret is accepted, never another app's or Connect's.
  const signingSecrets = [process.env.STRIPE_WEBHOOK_SECRET].filter(Boolean);
  if (signingSecrets.length === 0) return response.status(503).json({ error: "Webhook is not configured." });

  const rawBody = await readRawBody(request);
  const signatureHeader = request.headers["stripe-signature"];
  if (!signingSecrets.some((secret) => verifyStripeSignature(rawBody, signatureHeader, secret))) {
    return response.status(400).json({ error: "Invalid Stripe signature." });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    captureError("Stripe webhook payload parse failed", error);
    return response.status(400).json({ error: "Invalid payload." });
  }

  try {
    const object = event.data?.object ?? {};
    if (event.livemode !== false || object.livemode === true) {
      return response.status(400).json({ error: "Only Stripe test events are accepted." });
    }
    const supportedTypes = new Set([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted"
    ]);
    // The account is shared with Muse and AdventureBook. Ignore before even audit writes.
    // Donation, payment and connected-account flows are not enabled by sandbox opt-in.
    if (!supportedTypes.has(event.type) || event.account || object.metadata?.kind === "donation"
      || !hasGodwitSandboxMetadata(object)) {
      return response.status(200).json({ received: true, ignored: true });
    }
    if (object.livemode !== false) {
      return response.status(400).json({ error: "Only Stripe test objects are accepted." });
    }
    if (!/^evt_[A-Za-z0-9]+$/.test(event.id || "")) {
      return response.status(400).json({ error: "Invalid Stripe event ID." });
    }
    let subscription = object;
    if (event.type === "checkout.session.completed") {
      if (object.mode !== "subscription" || typeof object.subscription !== "string"
        || !object.subscription.startsWith("sub_")) {
        return response.status(400).json({ error: "Invalid Godwit sandbox checkout." });
      }
      await stripeSandboxRequest("account");
      subscription = await stripeSandboxRequest(`subscriptions/${encodeURIComponent(object.subscription)}`);
      validateSandboxSubscription(subscription, object.metadata);
      if (subscription.customer !== object.customer) {
        return response.status(400).json({ error: "Stripe sandbox customer does not match." });
      }
    } else {
      validateSandboxSubscription(subscription);
      await stripeSandboxRequest("account");
    }
    const isNewEvent = await recordWebhookEventIfNew(event);
    if (!isNewEvent) return response.status(200).json({ received: true, duplicate: true });
    const item = subscription.items.data[0];
    await upsertSubscription({
      workspace_id: subscription.metadata.workspace_id,
      plan: subscription.metadata.plan,
      status: normalizeSubscriptionStatus(subscription.status || "inactive"),
      stripe_customer_id: subscription.customer || null,
      stripe_subscription_id: subscription.id,
      current_period_end: (subscription.current_period_end || item.current_period_end)
        ? new Date((subscription.current_period_end || item.current_period_end) * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    });
    await markWebhookEventProcessed(event.id);
    return response.status(200).json({ received: true });
  } catch (error) {
    captureError("Stripe webhook failed", error);
    return response.status(500).json({ error: "Webhook processing failed." });
  }
}

function normalizeSubscriptionStatus(status) {
  const supportedStatuses = new Set([
    "active",
    "trialing",
    "past_due",
    "canceled",
    "inactive",
    "incomplete",
    "unpaid",
    "paused"
  ]);
  return supportedStatuses.has(status) ? status : "inactive";
}
