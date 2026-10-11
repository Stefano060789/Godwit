import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";

// Public, no-auth helper: a voter donating through a QR code redirects to a Stripe-hosted
// Checkout page. No Supabase session is required or used here - unlike donationSettings.js's
// admin-facing helpers, this runs on the voter-facing QrRedirect/DonationCard flow.
export async function startDonationCheckout({ campaignToken, itemId, amount }) {
  if (!DONATION_FEATURE_ENABLED) throw new Error("Donations are not enabled yet.");
  const response = await fetch("/api/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "donation", campaignToken, itemId, amount })
  });
  const payload = await response.json();
  if (!response.ok || !payload.url) throw new Error(payload.error || "Unable to start the donation.");
  return payload.url;
}
