// Two related "send a notification email via Resend" flows share this one endpoint (the
// project is already at Vercel Hobby's 12-serverless-function ceiling - see docs/TODO.md - so new
// responsibilities get folded into an existing file rather than adding a 13th):
//   - "content_report" (default, original behavior, called from Vote.jsx): notify a workspace's
//     configured report recipient that a voter flagged an answer for moderation review.
//   - "contact": the public Support page's message form. Sends to SUPPORT_TO_EMAIL, a
//     server-only env var (never bundled into the client, unlike the old VITE_SUPPORT_EMAIL it
//     replaces) so the operator's inbox address is never visible in the page source.
//   - "translate": official Google Cloud Translation Basic API proxy. This stays here to respect
//     Vercel's 12-function Hobby limit instead of adding another serverless function.
import { captureError } from "../lib/errorReporting.js";
import { isAllowedResendPurpose, sendResendEmail as sendResendRequest } from "../lib/resendEmail.js";

async function supabaseGet(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not configured.");
  const result = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!result.ok) throw new Error(`Supabase query failed (${result.status}).`);
  return result.json();
}

async function sendResendEmail({ to, subject, text }) {
  if (!isAllowedResendPurpose("transactional_notification")) {
    return { sent: false, reason: "purpose_not_allowed" };
  }
  if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) {
    return { sent: false, reason: "email_not_configured" };
  }
  const delivery = await sendResendRequest("https://api.resend.com/emails", {
    purpose: "transactional_notification",
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL, to: [to], subject, text })
  });
  if (!delivery.ok) {
    const details = await delivery.json().catch(() => ({}));
    const providerMessage = String(details?.message || details?.error || "").trim();
    throw new Error(`Resend request failed (${delivery.status})${providerMessage ? `: ${providerMessage}` : "."}`);
  }
  return { sent: true };
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function handleContactMessage(request, response) {
  const message = String(request.body?.message || "").trim();
  const replyEmail = String(request.body?.replyEmail || "").trim();

  if (!message || message.length > 4000) {
    return response.status(400).json({ error: "A message (up to 4000 characters) is required." });
  }
  if (replyEmail && !EMAIL_PATTERN.test(replyEmail)) {
    return response.status(400).json({ error: "That reply email address doesn't look valid." });
  }

  // Resend's unverified testing mode only permits the account's verified recipient.
  // Set SUPPORT_TO_EMAIL to contact@hellogodwit.com after verifying that domain in Resend.
  const supportEmail = process.env.SUPPORT_TO_EMAIL || "bonomistefano@outlook.it";

  try {
    const result = await sendResendEmail({
      to: supportEmail,
      subject: "New Godwit support message",
      text: `${message}\n\n${replyEmail ? `Reply to: ${replyEmail}` : "No reply email was provided."}`
    });
    return response.status(200).json(result);
  } catch (error) {
    captureError("Support contact message failed", error);
    return response.status(500).json({ error: "Unable to send your message right now. Please try again shortly." });
  }
}

async function handleProductFeedback(request, response) {
  const message = String(request.body?.message || "").trim();
  const userEmail = String(request.body?.userEmail || "").trim();

  if (!message || message.length > 2000) {
    return response.status(400).json({ error: "Feedback (up to 2000 characters) is required." });
  }
  if (userEmail && !EMAIL_PATTERN.test(userEmail)) {
    return response.status(400).json({ error: "The feedback author email address is invalid." });
  }

  const supportEmail = process.env.SUPPORT_TO_EMAIL || "bonomistefano@outlook.it";

  try {
    const result = await sendResendEmail({
      to: supportEmail,
      subject: "New Godwit product feedback",
      text: `${message}\n\n${userEmail ? `From: ${userEmail}` : "From: authenticated Godwit user (email unavailable)."}`
    });
    return response.status(200).json(result);
  } catch (error) {
    captureError("Product feedback notification failed", error);
    return response.status(500).json({ error: "Unable to send your feedback right now. Please try again shortly." });
  }
}

async function handleContentReport(request, response) {
  const workspaceId = request.body?.workspaceId;
  const reportId = Number(request.body?.reportId);
  if (!workspaceId || !Number.isSafeInteger(reportId) || reportId <= 0) {
    return response.status(400).json({ error: "A valid workspaceId and reportId are required." });
  }

  try {
    // Re-fetch the report server-side instead of trusting client-supplied content, so a
    // malicious caller can't use this endpoint to email arbitrary text to a workspace.
    const [report] = await supabaseGet(
      `content_reports?id=eq.${reportId}&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.open&select=id,poll_id,reported_answer,reason`
    );
    if (!report) return response.status(200).json({ notified: false });

    const [reportSettings] = await supabaseGet(
      `weekly_report_settings?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=recipient_email`
    );
    const recipientEmail = reportSettings?.recipient_email;
    if (!recipientEmail) return response.status(200).json({ notified: false, reason: "no_recipient_configured" });

    const appUrl = process.env.APP_URL || "";
    const preview = String(report.reported_answer || "").slice(0, 200);
    const result = await sendResendEmail({
      to: recipientEmail,
      subject: "A voter reported an answer for review",
      text: `A voter reported an answer on poll #${report.poll_id} (reason: ${report.reason}):\n\n"${preview}"\n\nReview it here: ${appUrl}/moderation`
    });
    return response.status(200).json({ notified: result.sent, reason: result.reason });
  } catch (error) {
    captureError("Content report notification failed", error);
    // Never let a notification failure surface as an error to the reporting voter.
    return response.status(200).json({ notified: false });
  }
}

const TRANSLATION_LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;

async function handleTranslation(request, response) {
  const text = String(request.body?.text || "").trim();
  const targetLanguage = String(request.body?.targetLanguage || "").trim();
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!text || text.length > 1000 || !TRANSLATION_LANGUAGE_PATTERN.test(targetLanguage)) {
    return response.status(400).json({ error: "A valid text and target language are required." });
  }
  if (!apiKey) {
    return response.status(503).json({ error: "Translation is not configured." });
  }

  try {
    const translationResponse = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          target: targetLanguage,
          format: "text"
        })
      }
    );

    if (!translationResponse.ok) {
      throw new Error(`Google Translation request failed (${translationResponse.status}).`);
    }

    const payload = await translationResponse.json();
    const translatedText = String(payload?.data?.translations?.[0]?.translatedText || "").trim();
    if (!translatedText) throw new Error("Google Translation returned no text.");
    return response.status(200).json({ translatedText });
  } catch (error) {
    captureError("Translation request failed", error);
    return response.status(502).json({ error: "Translation is temporarily unavailable." });
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (request.body?.type === "contact") return handleContactMessage(request, response);
  if (request.body?.type === "product_feedback") return handleProductFeedback(request, response);
  if (request.body?.type === "translate") return handleTranslation(request, response);
  return handleContentReport(request, response);
}
