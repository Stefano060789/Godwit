import { supabaseGet, supabasePatch, sendEmail } from "./cronHelpers.js";
import { captureError } from "../errorReporting.js";

export async function runSendWinbackEmails() {
  const settings = await supabaseGet("winback_settings?is_enabled=eq.true&select=workspace_id,days_since_last_visit,subject,message");
  if (!settings.length) return { sent: 0 };

  // Defense in depth: a workspace_members-visible trigger already blocks is_enabled=true
  // unless the plan is Growth, but re-check here in case a workspace downgraded afterwards.
  const growthWorkspaces = await supabaseGet(
    `workspace_subscriptions?plan=eq.growth&status=in.(active,trialing)&select=workspace_id`
  );
  const growthWorkspaceIds = new Set(growthWorkspaces.map((row) => row.workspace_id));
  const eligibleSettings = settings.filter((setting) => growthWorkspaceIds.has(setting.workspace_id));
  if (!eligibleSettings.length) return { sent: 0 };

  const canSend = Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL);
  let sent = 0;
  const preview = [];

  for (const setting of eligibleSettings) {
    const cutoff = new Date(Date.now() - setting.days_since_last_visit * 86400000).toISOString();
    const lapsedVoters = await supabaseGet(
      `voter_profiles?workspace_id=eq.${encodeURIComponent(setting.workspace_id)}&last_seen_at=lte.${encodeURIComponent(cutoff)}&winback_sent_at=is.null&unsubscribed_at=is.null&select=id,email,unsubscribe_token`
    );

    for (const voter of lapsedVoters) {
      if (!canSend) {
        preview.push({ workspace_id: setting.workspace_id, email: voter.email });
        continue;
      }

      const appUrl = process.env.APP_URL || "";
      const unsubscribeLine = voter.unsubscribe_token
        ? `\n\n---\nDon't want these emails? Unsubscribe: ${appUrl}/unsubscribe?token=${voter.unsubscribe_token}`
        : "";

      const delivery = await sendEmail({
        purpose: "consented_marketing",
        to: voter.email,
        subject: setting.subject || "We miss you!",
        text: `${setting.message || "It's been a while since your last visit. Come back soon!"}${unsubscribeLine}`
      });

      if (delivery.ok) {
        await supabasePatch(`voter_profiles?id=eq.${voter.id}`, { winback_sent_at: new Date().toISOString() });
        sent += 1;
      } else {
        captureError(`Resend request failed for voter profile ${voter.id} (${delivery.status}).`);
      }
    }
  }

  return canSend ? { sent } : { sent: 0, preview };
}
