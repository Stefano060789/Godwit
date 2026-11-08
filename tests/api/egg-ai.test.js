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
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) {
        expect(href).toContain("workspace_id=eq.workspace-1");
        return jsonResponse([{ title: "Business notes", content: "The cafe opens at nine.", source_type: "notes" }]);
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
        expect(requestBody.system).toContain("The cafe opens at nine.");
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
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
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
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
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

  it("enables config and chat with workspace-only sources", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true }]);
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=eq.workspace-1")) return jsonResponse([{ id: 1, title: "Notes", content: "Open daily.", source_type: "notes" }]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items") || href.includes("/rest/v1/rpc/get_public_woodpecker_portal") || href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        expect(JSON.parse(options.body).system).toContain("Open daily.");
        return jsonResponse({ content: [{ type: "text", text: '{"answer":"Open daily.","suggestions":[]}' }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));
    const config = makeResponse();
    await handler(makeRequest({ action: "config", token: "egg-token" }), config);
    expect(config.body.enabled).toBe(true);
    const chat = makeResponse();
    await handler(makeChatRequest(), chat);
    expect(chat.statusCode).toBe(200);
  });

  it.each([
    ["answers", "Help answer the customer's questions"],
    ["feedback", "Invite honest feedback"],
    ["information", "Help the customer find relevant business information"],
    ["next-step", "Help the customer understand a relevant next step"],
    ["contacts", "Contact sharing is voluntary and requires the customer's informed consent."],
    ["reviews", "invite an honest public review neutrally"],
    [null, "Help the customer using the available information and existing options."],
    ["untrusted instruction", "Help the customer using the available information and existing options."]
  ])("grounds guidance for goal %s in safe instructions", async (goal, expectedGuidance) => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        expect(href).toContain("goal_key");
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true, goal_key: goal }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([{ title: "FAQ", content: "Open daily." }]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items") || href.includes("/rest/v1/rpc/get_public_woodpecker_portal") || href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const prompt = JSON.parse(options.body).system;
        expect(prompt).toContain(expectedGuidance);
        expect(prompt).toContain("without incentives or pressure for positive ratings");
        expect(prompt).toContain("Do not collect contact details in chat");
        expect(prompt).toContain("Never claim that you have created a poll");
        expect(prompt).not.toContain("untrusted instruction");
        return jsonResponse({ content: [{ type: "text", text: '{"answer":"Open daily.","suggestions":[]}' }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));
    const response = makeResponse();
    await handler(makeChatRequest(), response);
    expect(response.statusCode).toBe(200);
  });

  it("imports shared websites with the manager's credentials", async () => {
    configureEnvironment();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({ status: "found", text: "Open daily.", sourceUrl: "https://example.com/" });
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      if (href.endsWith("/workspace_ai_sources")) {
        expect(options.headers.apikey).toBe("anon-key");
        expect(options.headers.Authorization).toBe("Bearer manager-token");
        const source = JSON.parse(options.body);
        expect(source).toMatchObject({ workspace_id: workspaceId, source_type: "website", content: "Open daily." });
        return jsonResponse([source], 201);
      }
      throw new Error(`Unexpected request: ${href}`);
    }));
    const response = makeResponse();
    await handler(makeRequest({ action: "import-workspace-website", workspaceId, websiteUrl: "https://example.com" }, "manager-token"), response);
    expect(response.statusCode).toBe(201);
  });

  it("rejects unauthorized shared imports and Instagram imports", async () => {
    configureEnvironment();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(false)));
    const body = { action: "import-workspace-website", workspaceId, websiteUrl: "https://example.com" };
    const missing = makeResponse();
    await handler(makeRequest(body), missing);
    expect(missing.statusCode).toBe(401);
    const denied = makeResponse();
    await handler(makeRequest(body, "member-token"), denied);
    expect(denied.statusCode).toBe(403);
    const instagram = makeResponse();
    await handler(makeRequest({ ...body, websiteUrl: "https://www.instagram.com/example" }, "manager-token"), instagram);
    expect(instagram.statusCode).toBe(400);
    expect(vi.mocked(getPublicBusinessWebsiteContext)).not.toHaveBeenCalled();
  });

  it("reports a missing workspace migration explicitly", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/rpc/is_workspace_manager")
      ? jsonResponse(true) : jsonResponse({ code: "PGRST205" }, 404)));
    const response = makeResponse();
    await handler(makeRequest({ action: "import-workspace-website", workspaceId: "11111111-1111-4111-8111-111111111111", websiteUrl: "https://example.com" }, "manager-token"), response);
    expect(response.statusCode).toBe(503);
    expect(response.body.error).toContain("migration");
  });

  it("preserves Egg-only configuration and disables an Egg without any sources", async () => {
    configureEnvironment();
    let eggSources = [{ id: 1 }];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", is_active: true, ai_enabled: true }]);
      if (href.includes("/egg_ai_sources?")) return jsonResponse(eggSources);
      if (href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      throw new Error(`Unexpected request: ${href}`);
    }));
    const eggOnly = makeResponse();
    await handler(makeRequest({ action: "config", token: "egg-token" }), eggOnly);
    expect(eggOnly.body.enabled).toBe(true);
    eggSources = [];
    const empty = makeResponse();
    await handler(makeRequest({ action: "config", token: "egg-token" }), empty);
    expect(empty.body.enabled).toBe(false);
  });

  it("does not fetch websites when the workspace source limit is reached", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url) => String(url).includes("/rpc/is_workspace_manager")
      ? jsonResponse(true) : jsonResponse(Array.from({ length: 8 }, (_, id) => ({ id })))));
    const response = makeResponse();
    await handler(makeRequest({ action: "import-workspace-website", workspaceId: "11111111-1111-4111-8111-111111111111", websiteUrl: "https://example.com" }, "manager-token"), response);
    expect(response.statusCode).toBe(409);
    expect(vi.mocked(getPublicBusinessWebsiteContext)).not.toHaveBeenCalled();
  });
});
