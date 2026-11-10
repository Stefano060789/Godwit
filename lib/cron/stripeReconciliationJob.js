import { stripeRequest, supabaseGet, supabasePost, sendEmail } from "./cronHelpers.js";
import { requireStripeSandbox, validateSandboxSubscription } from "../stripeSandbox.js";
import { billingDatabase, interactionStripeRequest, ownsInteractionObject,
  recoverPendingInteractionCheckout, clearInteractionCheckout } from "../interactionStripe.js";
import { applyInteractionTopup, syncInteractionSubscription } from "../interactionStripeWebhook.js";

async function reconcileInteractions() {
  await interactionStripeRequest("account");
  let checked = 0;
  for (let offset = 0; ; offset += 100) {
    const subscriptions = await billingDatabase(`workspace_interaction_subscriptions?select=*&order=workspace_id&limit=100&offset=${offset}`);
    for (const local of subscriptions) {
      const remote = await interactionStripeRequest(`subscriptions/${encodeURIComponent(local.stripe_subscription_id)}`);
      if (remote.metadata?.workspace_id !== local.workspace_id) throw new Error("Billing reconciliation workspace mismatch.");
      await syncInteractionSubscription(remote, Math.floor(Date.now() / 1000));
      checked++;
    }
    if (subscriptions.length < 100) break;
  }
  const checkouts = await billingDatabase("workspace_billing_checkouts?select=*&order=workspace_id&limit=1000");
  let recovered = 0;
  for (const checkout of checkouts) {
    const session = checkout.checkout_session_id.startsWith("cs_")
      ? await interactionStripeRequest(`checkout/sessions/${encodeURIComponent(checkout.checkout_session_id)}`)
      : await recoverPendingInteractionCheckout(checkout);
    if (!session) {
      if (new Date(checkout.expires_at).getTime() < Date.now()) {
        await billingDatabase(`workspace_billing_checkouts?workspace_id=eq.${checkout.workspace_id}&checkout_session_id=eq.${checkout.checkout_session_id}`,
          { method: "DELETE", prefer: "return=minimal" });
      }
      continue;
    }
    if (!ownsInteractionObject(session) || session.metadata.workspace_id !== checkout.workspace_id) {
      throw new Error("Billing reconciliation checkout mismatch.");
    }
    if (session.status === "complete") {
      if (session.mode === "subscription") {
        const remote = await interactionStripeRequest(`subscriptions/${encodeURIComponent(session.subscription)}`);
        if (remote.metadata.workspace_id !== checkout.workspace_id) throw new Error("Subscription checkout mismatch.");
        await syncInteractionSubscription(remote, Math.floor(Date.now() / 1000));
      } else if (session.payment_status === "paid") await applyInteractionTopup(session.id);
      else continue;
      recovered++;
    } else if (session.status !== "expired") continue;
    await clearInteractionCheckout(session);
  }
  return { checkedSubscriptions: checked, recoveredCheckouts: recovered };
}

async function retrieveStripeObjects(ids, resource) {
  const entries = await Promise.all(ids.filter(Boolean).map(async (id) => {
    try {
      const object = await stripeRequest(`${resource}/${encodeURIComponent(id)}`);
      validateSandboxSubscription(object);
      return [id, object];
    } catch (error) {
      if (error.message.includes("(404)")) return [id, null];
      throw error;
    }
  }));
  return new Map(entries);
}

function compareSubscription(local, remote) {
  if (!remote) return "missing_in_stripe";
  if (remote.status !== local.status) return `status:${local.status}->${remote.status}`;
  const periodEnd = remote.current_period_end || remote.items?.data?.[0]?.current_period_end;
  const remoteEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
  if (remoteEnd !== (local.current_period_end || null)) return "period_end_mismatch";
  return null;
}

function compareDonation(local, remote) {
  if (!remote) return "missing_in_stripe";
  const expectedAmount = Math.round(Number(local.amount_total) * 100);
  if (remote.amount_received !== expectedAmount && remote.amount !== expectedAmount) return "amount_mismatch";
  if (String(remote.currency || "").toUpperCase() !== local.currency) return "currency_mismatch";
  const expectedStatus = remote.status === "succeeded" ? "succeeded" : remote.status === "canceled" ? "failed" : "pending";
  if (expectedStatus !== local.status && !(local.status === "refunded" && remote.status === "succeeded")) {
    return `status:${local.status}->${expectedStatus}`;
  }
  return null;
}

export async function runStripeReconciliation() {
  if (process.env.INTERACTION_BILLING_ENABLED === "1") return reconcileInteractions();
  try {
    requireStripeSandbox();
  } catch {
    return { skipped: true, reason: "Stripe sandbox billing is not configured." };
  }
  await stripeRequest("account");
  const subscriptions = await supabaseGet("workspace_subscriptions?select=workspace_id,status,stripe_customer_id,stripe_subscription_id,current_period_end");
  // Donation and Connect payment reconciliation remain outside the approved subscription sandbox.
  const donations = [];

  const [subscriptionsById, paymentIntentsById] = await Promise.all([
    retrieveStripeObjects(subscriptions.map(({ stripe_subscription_id }) => stripe_subscription_id), "subscriptions"),
    retrieveStripeObjects(donations.map(({ stripe_payment_intent_id }) => stripe_payment_intent_id), "payment_intents")
  ]);
  const mismatches = [];
  for (const subscription of subscriptions) {
    const remote = subscriptionsById.get(subscription.stripe_subscription_id);
    if (remote && remote.metadata.workspace_id !== subscription.workspace_id) {
      throw new Error("Stripe sandbox workspace does not match.");
    }
    const mismatch = compareSubscription(subscription, remote);
    if (mismatch) mismatches.push({ type: "subscription", id: subscription.stripe_subscription_id, workspaceId: subscription.workspace_id, issue: mismatch });
  }
  for (const donation of donations) {
    const mismatch = compareDonation(donation, paymentIntentsById.get(donation.stripe_payment_intent_id));
    if (mismatch) mismatches.push({ type: "donation", id: donation.id, paymentIntentId: donation.stripe_payment_intent_id, workspaceId: donation.workspace_id, issue: mismatch });
  }

  const run = {
    checkedSubscriptions: subscriptions.length,
    checkedDonations: donations.length,
    stripeSubscriptionsRetrieved: subscriptionsById.size,
    stripePaymentIntentsRetrieved: paymentIntentsById.size,
    mismatchCount: mismatches.length,
    mismatches
  };
  await supabasePost("stripe_reconciliation_runs", { summary: run, mismatch_count: mismatches.length });
  if (mismatches.length && process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL && process.env.RECONCILIATION_ALERT_EMAIL) {
    await sendEmail({
      purpose: "transactional_notification",
      to: process.env.RECONCILIATION_ALERT_EMAIL,
      subject: `Godwit Stripe reconciliation: ${mismatches.length} mismatch(es)`,
      text: JSON.stringify(run, null, 2)
    });
  }
  return run;
}
