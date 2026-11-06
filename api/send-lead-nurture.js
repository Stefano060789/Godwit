import { captureError } from "../lib/errorReporting.js";
import { isAllowedResendPurpose, sendResendEmail } from "../lib/resendEmail.js";

async function supabaseGet(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not configured.");
  const result = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!result.ok) throw new Error(`Supabase query failed (${result.status}).`);
  return result.json();
}

async function supabasePatch(path, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
  if (!result.ok) throw new Error(`Supabase update failed (${result.status}).`);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const workspaceId = request.body?.workspaceId;
  const leadId = Number(request.body?.leadId);
  if (!workspaceId || !Number.isSafeInteger(leadId) || leadId <= 0) {
    return response.status(400).json({ error: "A valid workspaceId and leadId are required." });
  }

  try {
    const [lead] = await supabaseGet(`voter_leads?id=eq.${leadId}&workspace_id=eq.${encodeURIComponent(workspaceId)}&select=id,email,consented_at,nurture_sent_at`);
    if (!lead || lead.nurture_sent_at) return response.status(200).json({ sent: false });
    if (!lead.consented_at) {
      console.warn("Resend lead nurture blocked: consent could not be verified.", { leadId });
      return response.status(200).json({ sent: false, reason: "consent_not_verified" });
    }

    const [subscription] = await supabaseGet(`workspace_subscriptions?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=plan,status`);
    const plan = subscription?.plan === "growth" && ["active", "trialing"].includes(subscription.status) ? "growth" : "free";
    if (plan !== "growth") return response.status(200).json({ sent: false });

    const [settings] = await supabaseGet(`lead_nurture_settings?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=is_enabled,subject,message`);
    if (!settings?.is_enabled || !settings.subject || !settings.message) {
      return response.status(200).json({ sent: false, reason: "not_enabled" });
    }

    if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) {
      return response.status(503).json({
        sent: false,
        error: "Consented email delivery is not configured.",
        code: "resend_not_configured"
      });
    }

    const [profile] = await supabaseGet(
      `voter_profiles?workspace_id=eq.${encodeURIComponent(workspaceId)}&email=eq.${encodeURIComponent(lead.email)}&select=unsubscribed_at,unsubscribe_token`
    );
    if (!profile) {
      console.warn("Resend lead nurture blocked: recipient consent status could not be verified.", { leadId });
      return response.status(200).json({ sent: false, reason: "consent_not_verified" });
    }
    if (profile.unsubscribed_at) return response.status(200).json({ sent: false, reason: "unsubscribed" });

    const appUrl = process.env.APP_URL || "";
    const unsubscribeLine = profile?.unsubscribe_token
      ? `\n\n---\nDon't want these emails? Unsubscribe: ${appUrl}/unsubscribe?token=${profile.unsubscribe_token}`
      : "";

    if (!isAllowedResendPurpose("consented_marketing")) {
      return response.status(403).json({ sent: false, reason: "purpose_not_allowed" });
    }

    const delivery = await sendResendEmail("https://api.resend.com/emails", {
      purpose: "consented_marketing",
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL, to: [lead.email], subject: settings.subject, text: `${settings.message}${unsubscribeLine}` })
    });

    if (!delivery.ok) throw new Error(`Resend request failed (${delivery.status}).`);

    await supabasePatch(`voter_leads?id=eq.${leadId}`, { nurture_sent_at: new Date().toISOString() });
    return response.status(200).json({ sent: true });
  } catch (error) {
    captureError("Lead nurture email failed", error);
    return response.status(500).json({
      sent: false,
      error: "Unable to send the consented follow-up email."
    });
  }
}
