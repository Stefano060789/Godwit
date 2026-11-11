import { afterEach, describe, expect, it, vi } from "vitest";

const { isAllowedResendPurpose, sendResendEmail } = vi.hoisted(() => ({
  isAllowedResendPurpose: vi.fn(),
  sendResendEmail: vi.fn()
}));
vi.mock("../../lib/resendEmail.js", () => ({ isAllowedResendPurpose, sendResendEmail }));

import handler from "../../api/notify.js";

const originalEnv = { ...process.env };
const issue = {
  issue_id: 17,
  workspace_name: "Cafe",
  campaign_name: "Main entrance",
  category: "safety",
  description: "A step is loose near the entrance.",
  in_app_enabled: true,
  email_enabled: true,
  sms_enabled: true,
  recipient_email: "manager@example.com",
  recipient_phone: "+436641234567"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function configureEnvironment() {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  process.env.RESEND_API_KEY = "resend-test";
  process.env.REPORT_FROM_EMAIL = "alerts@hellogodwit.com";
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "twilio-test";
  process.env.TWILIO_FROM_NUMBER = "+15005550006";
  process.env.APP_URL = "https://hellogodwit.com";
}

describe("on-site issue alert dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("sends the configured email and SMS after atomically claiming the report", async () => {
    configureEnvironment();
    isAllowedResendPurpose.mockReturnValue(true);
    sendResendEmail.mockResolvedValue(jsonResponse({ id: "email-1" }));
    const fetchMock = vi.fn(async (url, options) => {
      if (String(url).includes("/rpc/claim_egg_issue_alert_delivery")) {
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({
          target_issue_id: 17,
          target_dispatch_token: "7b6ac1b2-42de-4c28-a7c2-9b2b5b79ce23"
        });
        return jsonResponse([issue]);
      }
      if (String(url).includes("api.twilio.com")) return jsonResponse({ sid: "sms-1" });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();

    await handler({
      method: "POST",
      body: {
        type: "egg_issue",
        issueId: 17,
        dispatchToken: "7b6ac1b2-42de-4c28-a7c2-9b2b5b79ce23"
      }
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      notified: true,
      email: { enabled: true, sent: true },
      sms: { enabled: true, sent: true }
    });
    expect(sendResendEmail).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      purpose: "transactional_notification",
      method: "POST"
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed dispatch references without contacting providers", async () => {
    configureEnvironment();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();

    await handler({
      method: "POST",
      body: { type: "egg_issue", issueId: 17, dispatchToken: "invalid" }
    }, response);

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
