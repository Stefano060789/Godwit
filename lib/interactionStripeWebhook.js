import { captureError } from "./errorReporting.js";
import { readRawBody, verifyStripeSignature } from "./stripeWebhookSignature.js";
import {
  billingDatabase, interactionStripeConfig, interactionStripeRequest,
  ownsInteractionObject, validateInteractionPrice, syncInteractionSubscription, clearInteractionCheckout
} from "./interactionStripe.js";
export { syncInteractionSubscription } from "./interactionStripe.js";

export async function applyInteractionTopup(sessionId) {
  const session = await interactionStripeRequest(`checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items&expand[]=payment_intent.latest_charge`);
  const items = session.line_items;
  const intent = session.payment_intent;
  if (!ownsInteractionObject(session) || session.metadata.purchase !== "topup"
    || session.mode !== "payment" || session.payment_status !== "paid" || session.status !== "complete"
    || items?.has_more || items?.data?.length !== 1 || items.data[0].quantity !== 1
    || !intent || typeof intent !== "object" || intent.status !== "succeeded"
    || intent.livemode !== interactionStripeConfig().live || !ownsInteractionObject(intent)
    || intent.metadata.workspace_id !== session.metadata.workspace_id
    || intent.currency !== "eur" || intent.amount_received < 700
    || !/^pi_[A-Za-z0-9]+$/.test(intent.id || "")
    || !intent.latest_charge?.created || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(session.id || "")) {
    throw new Error("Invalid paid Godwit interaction pack.");
  }
  validateInteractionPrice(items.data[0].price, "topup");
  await billingDatabase("rpc/apply_interaction_topup", { body: { topup: {
    workspace_id: session.metadata.workspace_id, checkout_session_id: session.id,
    payment_intent_id: intent.id,
    purchased_at: new Date(intent.latest_charge.created * 1000).toISOString()
  } } });
  if (intent.latest_charge.refunded || intent.latest_charge.amount_refunded > 0) {
    await billingDatabase("rpc/revoke_interaction_topup", { body: { target_payment_intent_id: intent.id } });
  }
}

export async function handleInteractionWebhook(request, response) {
  try { interactionStripeConfig(); } catch (error) {
    captureError("Interaction webhook configuration unavailable", error);
    return response.status(503).json({ error: "Interaction webhook is not configured." });
  }
  const rawBody = await readRawBody(request);
  if (!verifyStripeSignature(rawBody, request.headers["stripe-signature"], process.env.INTERACTION_STRIPE_WEBHOOK_SECRET)) {
    return response.status(400).json({ error: "Invalid Stripe signature." });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch {
    return response.status(400).json({ error: "Invalid Stripe payload." });
  }
  try {
    const object = event.data?.object;
    if (event.account || !ownsInteractionObject(object)) {
      return response.status(200).json({ received: true, ignored: true });
    }
    if (event.livemode !== interactionStripeConfig().live || object.livemode !== event.livemode
      || !/^evt_[A-Za-z0-9]+$/.test(event.id || "") || !Number.isInteger(event.created)) {
      return response.status(400).json({ error: "Invalid billing event." });
    }
    const supported = ["checkout.session.completed", "checkout.session.async_payment_succeeded",
      "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
      "charge.refunded"];
    if (!supported.includes(event.type)) return response.status(200).json({ received: true, ignored: true });
    await interactionStripeRequest("account");
    if (event.type === "charge.refunded") {
      if (object.metadata.purchase !== "topup" || typeof object.payment_intent !== "string") {
        return response.status(200).json({ received: true, ignored: true });
      }
      const charge = await interactionStripeRequest(`charges/${encodeURIComponent(object.id)}`);
      if (!ownsInteractionObject(charge) || charge.metadata.purchase !== "topup"
        || charge.payment_intent !== object.payment_intent || !(charge.amount_refunded > 0)) {
        throw new Error("Invalid refunded interaction pack.");
      }
      await billingDatabase("rpc/revoke_interaction_topup", { body: { target_payment_intent_id: charge.payment_intent } });
    } else if (event.type.startsWith("checkout.")) {
      if (object.metadata.purchase === "topup") {
        if (object.payment_status !== "paid") return response.status(200).json({ received: true, pending: true });
        await applyInteractionTopup(object.id);
      } else {
        if (object.mode !== "subscription" || typeof object.subscription !== "string"
          || !/^sub_[A-Za-z0-9]+$/.test(object.subscription)) throw new Error("Invalid subscription checkout.");
        const remote = await interactionStripeRequest(`subscriptions/${object.subscription}`);
        if (remote.metadata.workspace_id !== object.metadata.workspace_id || remote.customer !== object.customer) {
          throw new Error("Subscription checkout account mismatch.");
        }
        await syncInteractionSubscription(remote, event.created);
      }
      await clearInteractionCheckout(object);
    } else {
      if (!/^sub_[A-Za-z0-9]+$/.test(object.id || "")) throw new Error("Invalid subscription ID.");
      // Retrieve current state rather than replaying a potentially out-of-order snapshot.
      const remote = await interactionStripeRequest(`subscriptions/${object.id}`);
      if (remote.metadata.workspace_id !== object.metadata.workspace_id) throw new Error("Subscription workspace mismatch.");
      await syncInteractionSubscription(remote, event.created);
    }
    return response.status(200).json({ received: true });
  } catch (error) {
    captureError("Interaction webhook failed", error);
    return response.status(500).json({ error: "Interaction webhook processing failed." });
  }
}
