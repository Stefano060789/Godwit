const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const ALLOWED_RESEND_PURPOSES = new Set(["transactional_notification", "consented_marketing"]);

export function isAllowedResendPurpose(purpose) {
  if (ALLOWED_RESEND_PURPOSES.has(purpose)) return true;
  console.warn("Resend delivery blocked for an unsupported purpose.", {
    purpose: String(purpose || "unspecified")
  });
  return false;
}

export async function sendResendEmail(url, { purpose, ...requestOptions } = {}) {
  if (!isAllowedResendPurpose(purpose)) {
    return new Response(JSON.stringify({ error: "Resend email purpose is not approved." }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (url !== RESEND_EMAILS_URL) {
    throw new Error("Resend delivery is restricted to the email endpoint.");
  }

  return fetch(url, requestOptions);
}
