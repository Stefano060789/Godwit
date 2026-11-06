import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "./resendEmail.js";

const originalEnv = { ...process.env };

describe("Resend purpose policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it.each(["cold_outreach", "prospect_outreach", undefined])(
    "blocks %s before making a provider request",
    async (purpose) => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.REPORT_FROM_EMAIL = "reports@example.test";
      const fetchMock = vi.fn();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", fetchMock);

      const result = await sendResendEmail("https://api.resend.com/emails", {
        purpose,
        method: "POST",
        body: JSON.stringify({
          to: ["prospect@example.test"],
          subject: "Unsolicited",
          text: "Prospect message"
        })
      });

      expect(result.status).toBe(403);
      expect(await result.json()).toEqual({ error: "Resend email purpose is not approved." });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("Resend delivery blocked for an unsupported purpose.", {
        purpose: purpose || "unspecified"
      });
    }
  );

  it("allows explicit transactional and consented-marketing categories", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.REPORT_FROM_EMAIL = "reports@example.test";
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (const purpose of ["transactional_notification", "consented_marketing"]) {
      const result = await sendResendEmail("https://api.resend.com/emails", {
        purpose,
        method: "POST",
        body: JSON.stringify({
          from: "reports@example.test",
          to: ["recipient@example.test"],
          subject: "Godwit update",
          text: "A permitted message."
        })
      });
      expect(result.status).toBe(200);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).from).toBe("reports@example.test");
  });
});
