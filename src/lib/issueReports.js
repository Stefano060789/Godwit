import { supabase } from "./supabase";

export async function submitEggIssue({ campaignId, category, description, sessionId }) {
  const { data, error } = await supabase.rpc("report_egg_issue", {
    target_campaign_id: campaignId,
    issue_category: category,
    issue_description: description.trim(),
    target_session_id: sessionId
  }).single();
  if (error) throw new Error(error.message);

  const response = await fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "egg_issue",
      issueId: data.issue_id,
      dispatchToken: data.notification_token
    })
  });
  let delivery;
  try {
    delivery = await response.json();
  } catch {
    throw new Error("Your report was saved, but Godwit could not confirm alert delivery. Please contact the business directly if this is urgent.");
  }
  if (!response.ok) {
    throw new Error(delivery.error || "Your report was saved, but business alerts could not be confirmed. Please contact the business directly if this is urgent.");
  }
  return delivery;
}

export async function loadIssueAlertSettings(workspaceId) {
  const { data, error } = await supabase
    .from("issue_alert_settings")
    .select("workspace_id, email_enabled, sms_enabled, in_app_enabled, recipient_email, recipient_phone")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || {
    workspace_id: workspaceId,
    email_enabled: false,
    sms_enabled: false,
    in_app_enabled: true,
    recipient_email: "",
    recipient_phone: ""
  };
}

export async function saveIssueAlertSettings(settings) {
  const email = String(settings.recipient_email || "").trim();
  const phone = String(settings.recipient_phone || "").trim();
  if (settings.email_enabled && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid alert email address.");
  }
  if (settings.sms_enabled && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error("Enter a phone number in international format, such as +436641234567.");
  }
  const { error } = await supabase.from("issue_alert_settings").upsert({
    workspace_id: settings.workspace_id,
    email_enabled: Boolean(settings.email_enabled),
    sms_enabled: Boolean(settings.sms_enabled),
    in_app_enabled: Boolean(settings.in_app_enabled),
    recipient_email: email || null,
    recipient_phone: phone || null,
    updated_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
}

export async function loadEggIssueNotifications(workspaceId) {
  const { data, error } = await supabase
    .from("egg_issue_notifications")
    .select("id, issue_id, title, message, created_at, read_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function markEggIssueNotificationRead(notificationId) {
  const { error } = await supabase
    .from("egg_issue_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}
