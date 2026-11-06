import { sendEmail, supabaseDelete, supabaseGet, supabasePatch } from "./cronHelpers.js";

const MAX_REQUESTS = 25;

async function authAdminRequest(userId, method = "GET") {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not configured.");
  const result = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method,
    headers: { apikey: key, Authorization: ["Bearer", key].join(" ") }
  });
  if (!result.ok) throw new Error(`Supabase Auth request failed (${result.status}).`);
  const rawBody = await result.text();
  return rawBody ? JSON.parse(rawBody) : null;
}

async function exportUserData(user, request) {
  const workspaces = await supabaseGet(`workspaces?owner_id=eq.${encodeURIComponent(user.id)}&select=*`);
  const memberships = await supabaseGet(`workspace_members?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
  const workspaceData = [];
  for (const workspace of workspaces) {
    const query = (table) => supabaseGet(`${table}?workspace_id=eq.${encodeURIComponent(workspace.id)}&select=*`);
    workspaceData.push({
      workspace,
      members: await query("workspace_members"),
      polls: await query("polls"),
      subscriptions: await query("workspace_subscriptions"),
      campaigns: await query("qr_campaigns"),
      donations: await query("donations"),
      leads: await query("voter_leads")
    });
  }
  const email = user.email?.toLowerCase();
  return {
    exportedAt: new Date().toISOString(),
    requestId: request.id,
    account: { id: user.id, email: user.email, created_at: user.created_at, user_metadata: user.user_metadata },
    memberships,
    workspaces: workspaceData,
    voterProfiles: email ? await supabaseGet(`voter_profiles?email=eq.${encodeURIComponent(email)}&select=*`) : [],
    reviewClaims: email ? await supabaseGet(`review_benefit_claims?contact_email=eq.${encodeURIComponent(email)}&select=*`) : []
  };
}

async function deletePersonalContactData(user) {
  const email = user.email?.toLowerCase();
  if (!email) return;
  await supabaseDelete(`voter_leads?email=eq.${encodeURIComponent(email)}`);
  await supabaseDelete(`voter_profiles?email=eq.${encodeURIComponent(email)}`);
  await supabaseDelete(`review_benefit_claims?contact_email=eq.${encodeURIComponent(email)}`);
  await supabasePatch(`donations?donor_email=eq.${encodeURIComponent(email)}`, { donor_email: null });
}

async function deleteUserData(user) {
  const workspaces = await supabaseGet(`workspaces?owner_id=eq.${encodeURIComponent(user.id)}&select=id`);
  for (const workspace of workspaces) await supabaseDelete(`workspaces?id=eq.${encodeURIComponent(workspace.id)}`);
  await supabaseDelete(`workspace_members?user_id=eq.${encodeURIComponent(user.id)}`);
  await deletePersonalContactData(user);
  await authAdminRequest(user.id, "DELETE");
}

export async function runDsarProcessing() {
  const requests = await supabaseGet(
    `privacy_requests?status=eq.requested&order=created_at.asc&limit=${MAX_REQUESTS}&select=id,user_id,request_type,created_at`
  );
  const processed = [];
  for (const request of requests) {
    await supabasePatch(`privacy_requests?id=eq.${encodeURIComponent(request.id)}`, { status: "in_review" });
    try {
      const user = await authAdminRequest(request.user_id);
      if (request.request_type === "data_export") {
        const data = await exportUserData(user, request);
        if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL || !user.email) {
          throw new Error("Export delivery requires RESEND_API_KEY, REPORT_FROM_EMAIL, and an account email.");
        }
        await sendEmail({
          purpose: "transactional_notification",
          to: user.email,
          subject: "Your Godwit data export",
          text: "Your requested Godwit data export is attached as JSON.",
          attachments: [{ filename: "godwit-data-export.json", content: Buffer.from(JSON.stringify(data, null, 2)).toString("base64") }]
        });
      } else if (request.request_type === "account_deletion") {
        await deleteUserData(user);
      } else if (request.request_type === "consent_withdrawal") {
        await deletePersonalContactData(user);
      }
      await supabasePatch(`privacy_requests?id=eq.${encodeURIComponent(request.id)}`, {
        status: "completed",
        resolved_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        details: request.request_type === "data_export"
          ? "Export delivered by email."
          : request.request_type === "account_deletion"
            ? "Account and associated personal data deleted."
            : "Follow-up consent withdrawn and contact data deleted."
      });
      processed.push({ id: request.id, status: "completed" });
    } catch (error) {
      await supabasePatch(`privacy_requests?id=eq.${encodeURIComponent(request.id)}`, {
        status: "rejected",
        resolved_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        details: `Processing failed: ${error.message}`.slice(0, 2000)
      });
      processed.push({ id: request.id, status: "rejected" });
    }
  }
  return { found: requests.length, processed };
}
