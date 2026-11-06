import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/send-lead-nurture.js";

const originalEnv = { ...process.env };
const SUPABASE_URL = "https://supabase.test";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

describe("send-lead-nurture route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("does not deliver when consent cannot be verified", async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.REPORT_FROM_EMAIL = "reports@example.test";
    const requests = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method || "GET" });
      return jsonResponse([{
        id: 25,
        email: "voter@example.test",
        consented_at: null,
        nurture_sent_at: null
      }]);
    }));

    const response = makeResponse();
    await handler({
      method: "POST",
      body: { workspaceId: "workspace-1", leadId: 25 },
      headers: {}
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ sent: false, reason: "consent_not_verified" });
    expect(requests).toHaveLength(1);
    expect(requests.some(({ url }) => url.includes("api.resend.com"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "Resend lead nurture blocked: consent could not be verified.",
      { leadId: 25 }
    );
  });

  it("preserves delivery to a consented, subscribed voter and includes unsubscribe details", async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.REPORT_FROM_EMAIL = "reports@example.test";
    process.env.APP_URL = "https://godwit.example.test";
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      requests.push({ href, method, body: options.body ? JSON.parse(options.body) : null });

      if (href.includes("/rest/v1/voter_leads?id=eq.25") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      if (href.includes("/rest/v1/voter_leads?")) {
        return jsonResponse([{
          id: 25,
          email: "voter@example.test",
          consented_at: "2026-10-01T10:00:00.000Z",
          nurture_sent_at: null
        }]);
      }
      if (href.includes("/rest/v1/workspace_subscriptions?")) {
        return jsonResponse([{ plan: "growth", status: "active" }]);
      }
      if (href.includes("/rest/v1/lead_nurture_settings?")) {
        return jsonResponse([{ is_enabled: true, subject: "Thanks", message: "Thanks for opting in." }]);
      }
      if (href.includes("/rest/v1/voter_profiles?")) {
        return jsonResponse([{ unsubscribed_at: null, unsubscribe_token: "unsubscribe-token" }]);
      }
      if (href.includes("api.resend.com/emails")) return jsonResponse({ id: "email-1" });
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const response = makeResponse();
    await handler({
      method: "POST",
      body: { workspaceId: "workspace-1", leadId: 25 },
      headers: {}
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ sent: true });
    const delivery = requests.find(({ href }) => href.includes("api.resend.com/emails"));
    expect(delivery.body.to).toEqual(["voter@example.test"]);
    expect(delivery.body.text).toContain("Thanks for opting in.");
    expect(delivery.body.text).toContain("/unsubscribe?token=unsubscribe-token");
    expect(requests.some(({ href, method }) =>
      href.includes("/rest/v1/voter_leads?id=eq.25") && method === "PATCH"
    )).toBe(true);
  });
});
