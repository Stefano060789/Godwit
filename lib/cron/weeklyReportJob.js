import { supabaseGet, supabaseCount, sendEmail } from "./cronHelpers.js";

export async function runWeeklyReport() {
  const settings = await supabaseGet("weekly_report_settings?select=workspace_id,recipient_email&is_enabled=eq.true");
  const reports = await Promise.all(settings.map(async (setting) => {
    const workspace = encodeURIComponent(setting.workspace_id);
    const [polls, votes, alerts, tasks] = await Promise.all([
      supabaseCount(`polls?workspace_id=eq.${workspace}&select=id`),
      supabaseCount(`votes?workspace_id=eq.${workspace}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString())}&select=id`),
      supabaseCount(`feedback_alerts?workspace_id=eq.${workspace}&status=in.(open,acknowledged)&select=id`),
      supabaseCount(`feedback_recovery_tasks?workspace_id=eq.${workspace}&status=in.(open,in_progress)&select=id`)
    ]);
    return { to: setting.recipient_email, subject: "Godwit weekly workspace summary", text: `Weekly Godwit summary\n\nPolls: ${polls}\nVotes in the last 7 days: ${votes}\nOpen feedback alerts: ${alerts}\nOpen recovery tasks: ${tasks}` };
  }));

  if (process.env.RESEND_API_KEY && reports.length) {
    if (!process.env.REPORT_FROM_EMAIL) throw new Error("REPORT_FROM_EMAIL is required when RESEND_API_KEY is configured.");
    const sent = await Promise.all(reports.map(async (report) => {
      const result = await sendEmail({ ...report, purpose: "transactional_notification" });
      if (!result.ok) throw new Error(`Resend request failed (${result.status}).`);
      return result.json();
    }));
    return { delivered: reports.length, sent };
  }
  return { delivered: 0, preview: reports };
}
