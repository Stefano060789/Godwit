import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/creator-outreach.js";
import { findPublicBusinessEmail, getPublicBusinessWebsiteContext } from "../../lib/cron/publicBusinessEmail.js";

vi.mock("../../lib/cron/publicBusinessEmail.js", () => ({
  findPublicBusinessEmail: vi.fn(),
  getPublicBusinessWebsiteContext: vi.fn()
}));

const originalEnv = { ...process.env };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeResponse() {
  const res = {
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
  return res;
}

function makeRequest({ body, token = "user-token" } = {}) {
  return {
    method: "POST",
    headers: { authorization: ["Bearer", token].join(" ") },
    body
  };
}

describe("creator-outreach regenerate action", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(findPublicBusinessEmail).mockReset();
    vi.mocked(getPublicBusinessWebsiteContext).mockReset();
    process.env = { ...originalEnv };
  });

  it("regenerates a localized, property-poster-specific message and research note", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.OPENAI_API_KEY;
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({
      text: "Persönliche Immobilienberatung und aktuelle Wohnangebote in Vienna.",
      status: "found",
      sourceUrl: "https://example.org"
    });
    const generated = {
      subject: "House of Ble Immobilien: eine Idee für Interessenten",
      message: "Guten Tag liebes House of Ble Immobilien-Team,\n\nAuf Ihrer Website beschreiben Sie Immobilienberatung in Vienna. Bei Immobilienplakaten könnte ein QR-Code Interessenten fragen, welche Merkmale ihnen wichtig sind und welche Art von Objekt sie suchen. So erkennen Sie, welche Informationen und passende Immobilienangebote besonders relevant sind. Wer ausdrücklich einwilligt, kann anschließend gezielt passende Immobilienangebote erhalten.\n\nWir könnten diese Idee in einem kostenlosen, begleiteten zweiwöchigen Pilot für Sie prüfen. Wenn der Pilot hilfreiche Erkenntnisse liefert, kann ein Abonnement den Feedback-Kreislauf fortsetzen. Hätten Sie Zeit für eine kurze 15-minütige Vorstellung?\n\nhttps://hellogodwit.com\n\nFreundliche Grüße,\nStefano and Mariia",
      personalizationReason: "Die Website beschreibt Immobilienberatung und Wohnangebote; ein QR-Code auf Immobilienplakaten könnte Interessentenpräferenzen erfassen und passende Immobilienangebote ermöglichen."
    };

    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href === "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions") {
        expect(options.headers.Authorization).toBe("Bearer test-gemini-key");
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify(generated) } }]
        });
      }
      if (href.includes("/auth/v1/user")) {
        return jsonResponse({ email: "bonomistefano@outlook.it" });
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "GET") {
        return jsonResponse([{
          id: "contact-1",
          company_name: "House of Ble Immobilien",
          business_type: "real_estate_agency",
          country: "Austria",
          city: "Vienna",
          website: "https://example.org",
          contact_email: "office@example.com",
          message: "An earlier draft that should be replaced."
        }]);
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({ body: { action: "regenerate", contactId: "contact-1", language: "de", variation: 1 } });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.subject).toContain("House of Ble Immobilien");
    expect(res.body.message).toContain("House of Ble Immobilien");
    expect(res.body.message).toContain("Immobilienplakat");
    expect(res.body.message).toContain("Wenn der Pilot hilfreiche Erkenntnisse liefert");
    expect(res.body.message).toContain("Wer ausdrücklich einwilligt");
    expect(res.body.message).toContain("in Vienna");
    expect(res.body.message).not.toBe("An earlier draft that should be replaced.");
    expect(res.body.personalizationNote).toContain("passende Immobilienangebote");
    expect(res.body.subject).not.toContain("your team");
    const update = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(JSON.parse(update[1].body).personalization_note).toContain("passende Immobilienangebote");
    expect(JSON.parse(update[1].body).personalization_note).toContain("office@example.com");
  });

  it("reports the AI configuration requirement to an authorized Creator", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/auth/v1/user")) {
        return jsonResponse({ email: "afelix470@gmail.com" });
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "GET") {
        return jsonResponse([{
          id: "contact-1",
          company_name: "House of Ble",
          business_type: "hotel",
          country: "Austria"
        }]);
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({ body: { action: "regenerate", contactId: "contact-1", language: "de" } });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toContain("GEMINI_API_KEY");
    expect(res.body.error).toContain("OPENAI_API_KEY");
  });

  it("stores a public email found by an on-demand official-site lookup", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    vi.mocked(findPublicBusinessEmail).mockResolvedValue({
      email: "office@example.com",
      status: "found"
    });

    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/auth/v1/user")) {
        return jsonResponse({ email: "bonomistefano@outlook.it" });
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "GET") {
        return jsonResponse([{
          id: "contact-1",
          company_name: "Example Business",
          country: "Malaysia",
          city: "Kuala Lumpur",
          website: "https://example.com",
          contact_email: null
        }]);
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({ body: { action: "find-email", contactId: "contact-1" } });
    const res = makeResponse();
    await handler(req, res);

    expect(findPublicBusinessEmail).toHaveBeenCalledWith("https://example.com", {
      companyName: "Example Business",
      country: "Malaysia",
      city: "Kuala Lumpur"
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ email: "office@example.com", status: "found" });
  });

  it("searches and persists a bounded batch of blank contact emails", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    vi.mocked(findPublicBusinessEmail)
      .mockResolvedValueOnce({ email: "office@example.com", status: "found", source: "web_search" })
      .mockResolvedValueOnce({ email: null, status: "not_found", websiteStatus: "website_unavailable" });

    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/auth/v1/user")) {
        return jsonResponse({ email: "bonomistefano@outlook.it" });
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=in.") && method === "GET") {
        return jsonResponse([
          {
            id: "contact-1",
            company_name: "Example Business",
            country: "Malaysia",
            city: "Kuala Lumpur",
            website: null,
            contact_email: null,
            business_review_status: "pending"
          },
          {
            id: "contact-2",
            company_name: "Another Business",
            country: "Malaysia",
            city: "Kuala Lumpur",
            website: "https://another.example",
            contact_email: null,
            business_review_status: "pending"
          }
        ]);
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({
      body: { action: "find-missing-emails", contactIds: ["contact-1", "contact-2", "contact-1"] }
    });
    const res = makeResponse();
    await handler(req, res);

    expect(findPublicBusinessEmail).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
    expect(res.body.results).toEqual([
      { id: "contact-1", email: "office@example.com", status: "found", source: "web_search" },
      { id: "contact-2", email: null, status: "not_found", websiteStatus: "website_unavailable" }
    ]);
  });

  it("caps blank-email batch requests at five contacts", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `contact-${index}`,
      company_name: `Business ${index}`,
      website: null,
      contact_email: null,
      business_review_status: "pending"
    }));
    vi.mocked(findPublicBusinessEmail).mockResolvedValue({ email: null, status: "no_website" });
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      if (href.includes("/auth/v1/user")) return jsonResponse({ email: "bonomistefano@outlook.it" });
      if (href.includes("/rest/v1/creator_outreach_contacts?id=in.") && method === "GET") return jsonResponse(rows.slice(0, 5));
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({
      body: { action: "find-missing-emails", contactIds: rows.map(({ id }) => id) }
    });
    const res = makeResponse();
    await handler(req, res);

    expect(findPublicBusinessEmail).toHaveBeenCalledTimes(5);
    expect(res.body.results).toHaveLength(5);
  });

  it("rejects a research total outside the allowed range", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/auth/v1/user")) {
        return jsonResponse({ email: "bonomistefano@outlook.it" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const req = makeRequest({
      body: { action: "research", countries: ["Malaysia"], businessTypes: ["hotel"], targetTotal: 101 }
    });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("total from 1 to 100");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("saves a reviewed subject only for an active unsent draft", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      requests.push({ href, method, body: options.body ? JSON.parse(options.body) : null });
      if (href.includes("/auth/v1/user")) return jsonResponse({ email: "bonomistefano@outlook.it" });
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "GET") {
        return jsonResponse([{ id: "contact-1", business_review_status: "pending" }]);
      }
      if (href.includes("/rest/v1/creator_outreach_contacts?id=eq.contact-1") && method === "PATCH") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({
      body: { action: "save-subject", contactId: "contact-1", subject: "A visitor feedback idea for Luna" }
    });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ subject: "A visitor feedback idea for Luna" });
    expect(requests.some(({ method, body }) =>
      method === "PATCH" && body.subject === "A visitor feedback idea for Luna" && body.message_review_status === "pending"
    )).toBe(true);
  });

  it("does not approve a prospect without a generated message", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      requests.push({ href, method });
      if (href.includes("/auth/v1/user")) return jsonResponse({ email: "bonomistefano@outlook.it" });
      if (href.includes("/rest/v1/creator_outreach_contacts?id=in.") && method === "GET") {
        return jsonResponse([{
          id: "contact-1",
          business_review_status: "pending",
          message_review_status: "pending",
          subject: "",
          message: ""
        }]);
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({ body: { action: "send", contactIds: ["contact-1"] } });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("Generate and review an AI draft");
    expect(requests.some(({ method }) => method === "PATCH")).toBe(false);
  });

  it("clears unsent outreach drafts while preserving sent and rejected locations", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.VITE_SUPABASE_URL = "https://client-supabase.test";
    process.env.VITE_SUPABASE_ANON_KEY = "client-anon-key";
    process.env.CREATOR_EMAILS = "bonomistefano@outlook.it";
    const requests = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      const method = options.method || "GET";
      requests.push({ href, method, headers: options.headers || {} });
      if (href.includes("/auth/v1/user")) return jsonResponse({ email: "bonomistefano@outlook.it" });
      if (href.includes("/rest/v1/creator_outreach_contacts?") && method === "DELETE") {
        return jsonResponse([{ id: "contact-1" }, { id: "contact-2" }]);
      }
      throw new Error(`Unexpected request: ${method} ${href}`);
    }));

    const req = makeRequest({ body: { action: "clear-research" } });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ cleared: 2 });
    const authRequest = requests.find(({ href }) => href.includes("/auth/v1/user"));
    expect(authRequest.href).toBe("https://supabase.test/auth/v1/user");
    expect(authRequest.headers.apikey).toBe("anon-key");
    const deleteRequest = requests.find(({ method }) => method === "DELETE");
    expect(deleteRequest.href).toContain("status=in.(draft,approved)");
    expect(deleteRequest.href).toContain("or=(business_review_status.neq.rejected,business_review_status.is.null)");
    expect(deleteRequest.href).toContain("select=id");
    expect(deleteRequest.headers.Prefer).toBe("return=representation");
  });

  it("returns the Supabase auth rejection reason for an invalid Creator token", async () => {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Invalid JWT" }, 401)));

    const req = makeRequest({ body: { action: "clear-research" } });
    const res = makeResponse();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toContain("Supabase");
    expect(res.body.error).toContain("Invalid JWT");
  });
});
