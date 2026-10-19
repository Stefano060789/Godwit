import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/egg-ai.js";
import { getPublicBusinessWebsiteContext } from "../../lib/cron/publicBusinessEmail.js";

vi.mock("../../lib/cron/publicBusinessEmail.js", () => ({
  getPublicBusinessWebsiteContext: vi.fn()
}));

const originalEnv = { ...process.env };

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

function makeRequest(body, token = "") {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body
  };
}

function configureEnvironment() {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  process.env.CLAUDE_API_KEY = "test-claude-key";
  process.env.CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-test";
}

function makeChatRequest(overrides = {}) {
  return makeRequest({
    action: "chat",
    token: "egg-token",
    sessionId: "a2a8d950-a23f-4f49-b8c0-c7809c9c029b",
    message: "Do you have step-free access?",
    history: [],
    ...overrides
  });
}

describe("Egg AI API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getPublicBusinessWebsiteContext).mockReset();
    process.env = { ...originalEnv };
  });

  it("answers from business materials using the capped Claude Haiku request", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) {
        return jsonResponse([{ title: "Accessibility", content: "The entrance has a step-free ramp." }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) {
        return jsonResponse([{ item_id: 17, item_type: "poll", poll_question: "How was the service?" }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_woodpecker_portal")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        expect(options.headers["x-api-key"]).toBe("test-claude-key");
        const requestBody = JSON.parse(options.body);
        expect(requestBody.model).toBe("claude-haiku-4-5-test");
        expect(requestBody.max_tokens).toBe(280);
        expect(requestBody.system).toContain("The entrance has a step-free ramp.");
        expect(requestBody.system).toContain("How was the service?");
        expect(requestBody.messages.at(-1).content).toBe("Do you have step-free access?");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Yes, we have a step-free ramp at the entrance.",
          suggestions: ["17", "forged-option-id"]
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeChatRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.answer).toContain("step-free ramp");
    expect(response.body.suggestions).toEqual([{ id: "17", type: "poll", title: "How was the service?" }]);
  });

  it("includes the Egg's fallback poll as a safe suggestion when no poll item exists", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) {
        return jsonResponse([{ title: "FAQ", content: "Open daily." }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_woodpecker_portal")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([{ campaign_id: 42, poll_id: 8 }]);
      if (href.includes("/rest/v1/rpc/get_public_poll")) return jsonResponse([{ question: "How was your visit?" }]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.system).toContain("How was your visit?");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Tell us how your visit went.",
          suggestions: ["default-42"]
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeChatRequest(), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.suggestions).toEqual([
      { id: "default-42", type: "poll", title: "How was your visit?" }
    ]);
  });

  it("does not call Claude after a hard usage limit is reached", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) {
        return jsonResponse([{ title: "FAQ", content: "Open daily." }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_woodpecker_portal")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) {
        return jsonResponse({ message: "Workspace Egg AI monthly usage limit reached." }, 400);
      }
      throw new Error(`Unexpected request after the limit: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeChatRequest(), response);

    expect(response.statusCode).toBe(429);
    expect(response.body.error).toContain("allowance has been reached");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.anthropic.com"))).toBe(false);
  });

  it("imports website material only for an authenticated workspace manager", async () => {
    configureEnvironment();
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({
      text: "Opening hours: 9:00–17:00.",
      status: "found",
      sourceUrl: "https://example.com/"
    });
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?id=eq.42")) {
        expect(options.headers.Authorization).toBe("Bearer manager-token");
        return jsonResponse([{ id: 42, workspace_id: "workspace-1" }]);
      }
      if (href.includes("/rest/v1/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=eq.42")) return jsonResponse([]);
      if (href.endsWith("/rest/v1/egg_ai_sources")) {
        const source = JSON.parse(options.body);
        expect(source.source_type).toBe("website");
        expect(source.content).toContain("Opening hours");
        return jsonResponse([source], 201);
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeRequest({
      action: "import-website",
      campaignId: 42,
      websiteUrl: "https://example.com"
    }, "manager-token"), response);

    expect(response.statusCode).toBe(201);
    expect(response.body.source.source_type).toBe("website");
  });
});
