import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail, supabaseRequest } from "./cronHelpers.js";

const originalEnv = { ...process.env };
const SUPABASE_URL = "https://supabase.test";

describe("supabaseRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  describe("Resend cron delivery purpose gate", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      process.env = { ...originalEnv };
    });

    it("blocks cold and prospect outreach before contacting Resend", async () => {
      const fetchMock = vi.fn();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("fetch", fetchMock);

      await expect(sendEmail({
        purpose: "cold_outreach",
        to: "prospect@example.test",
        subject: "First contact",
        text: "An unsolicited message."
      })).rejects.toThrow("Resend delivery blocked");
      await expect(sendEmail({
        purpose: "prospect_outreach",
        to: "prospect@example.test",
        subject: "First contact",
        text: "An unsolicited message."
      })).rejects.toThrow("Resend delivery blocked");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });

  it("returns null for a 204 No Content response", async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    await expect(supabaseRequest("creator_outreach_contacts?id=eq.1", {
      method: "PATCH",
      prefer: "return=minimal",
      body: { status: "approved" }
    })).resolves.toBeNull();
  });

  it("returns null instead of throwing for a 201 Created response with an empty body", async () => {
    // PostgREST responds 201 Created (not 204) with an empty body for an insert
    // when Prefer: return=minimal is requested - calling response.json() directly
    // on that empty body throws "Unexpected end of JSON input".
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 201 })));

    await expect(supabaseRequest("creator_outreach_contacts", {
      method: "POST",
      prefer: "return=minimal",
      body: [{ company_name: "Example" }]
    })).resolves.toBeNull();
  });

  it("parses a JSON body when one is returned", async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "1" }]), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    })));

    await expect(supabaseRequest("creator_outreach_contacts", {
      method: "POST",
      body: [{ company_name: "Example" }]
    })).resolves.toEqual([{ id: "1" }]);
  });

  it("throws a descriptive error when the request fails", async () => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "boom" }), { status: 500 })));

    await expect(supabaseRequest("creator_outreach_contacts", { method: "POST", body: [] }))
      .rejects.toThrow("Supabase request failed (500)");
  });
});
