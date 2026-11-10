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
    trialSessionId: "38dfeb63-639c-4c17-8882-7a82da0e84cc",
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
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) {
        expect(options.headers.Authorization).toBe("Bearer manager-token");
        expect(JSON.parse(options.body)).toEqual({
          target_campaign_token: "egg-token",
          target_session_id: "38dfeb63-639c-4c17-8882-7a82da0e84cc"
        });
        return jsonResponse(true);
      }
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{
          id: 42,
          workspace_id: "workspace-1",
          name: "Cafe",
          is_active: true,
          ai_enabled: true,
          workspaces: { business_type: "cafe-pub" }
        }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) {
        return jsonResponse([{ title: "Accessibility", content: "The entrance has a step-free ramp." }]);
      }
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) {
        expect(href).toContain("workspace_id=eq.workspace-1");
        return jsonResponse([{ title: "Business notes", content: "The cafe opens at nine.", source_type: "notes" }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) {
        expect(options.headers.Authorization).toBe("Bearer manager-token");
        expect(JSON.parse(options.body)).toMatchObject({
          target_token: "egg-token",
          target_session_id: "38dfeb63-639c-4c17-8882-7a82da0e84cc"
        });
        return jsonResponse([{ item_id: 17, item_type: "poll", poll_question: "How was the service?" }]);
      }
      if (href.includes("/rest/v1/rpc/get_public_woodpecker_portal")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        expect(options.headers["x-api-key"]).toBe("test-claude-key");
        const requestBody = JSON.parse(options.body);
        expect(requestBody.model).toBe("claude-haiku-4-5-test");
        expect(requestBody.max_tokens).toBe(300);
        expect(requestBody.system).toContain("The entrance has a step-free ramp.");
        expect(requestBody.system).toContain("The cafe opens at nine.");
        expect(requestBody.system).toContain("For a cafe or pub, help with menu and drink information");
        expect(requestBody.system).toContain("How was the service?");
        expect(requestBody.system).toContain("under 45 words");
        expect(requestBody.system).toContain("prefer at most one matching existing poll");
        expect(requestBody.system).toContain("create one short neutral poll for that interest");
        expect(requestBody.messages.at(-1).content).toBe("Do you have step-free access?");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Yes, we have a step-free ramp at the entrance.",
          suggestions: ["17", "forged-option-id"]
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    const previewRequest = makeChatRequest();
    previewRequest.headers.authorization = "Bearer manager-token";
    await handler(previewRequest, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.answer).toContain("step-free ramp");
    expect(response.body.suggestions).toEqual([{ id: "17", type: "poll", title: "How was the service?" }]);
  });

  it("blocks Egg AI requests after the customer's trial session is no longer allowed", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(false);
      throw new Error(`Unexpected request after trial access was denied: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeChatRequest(), response);

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toContain("Egg session is unavailable");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.anthropic.com"))).toBe(false);
  });

  it("creates and returns one saved poll for a clear customer interest", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Which coffee options would you enjoy seeing here?",
          suggestions: [],
          poll: {
            interestKey: "coffee-options",
            question: "Which coffee option would you like to see more of?",
            answers: ["Cold brew", "Decaf", "Plant-based milk"]
          }
        }) }] });
      }
      if (href.includes("/rest/v1/rpc/create_egg_ai_interest_poll")) {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.target_campaign_id).toBe(42);
        expect(requestBody.target_session_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(requestBody.target_interest_key).toBe("coffee-options");
        expect(requestBody.target_answers).toEqual(["Cold brew", "Decaf", "Plant-based milk"]);
        return jsonResponse([{
          poll_id: 91,
          question: "Which coffee option would you like to see more of?",
          answers: ["Cold brew", "Decaf", "Plant-based milk"],
          created: true,
          reason: null
        }]);
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeChatRequest({ message: "I would love more cold coffee choices." }), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.poll).toEqual({
      id: 91,
      question: "Which coffee option would you like to see more of?",
      answers: ["Cold brew", "Decaf", "Plant-based milk"],
      created: true
    });
  });

  it("explains when a generated poll cannot be added because of plan or session limits", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Which new drink would you like to see?",
          suggestions: [],
          poll: {
            interestKey: "new-drinks",
            question: "Which new drink would you like to see?",
            answers: ["Iced tea", "Lemonade"]
          }
        }) }] });
      }
      if (href.includes("/rest/v1/rpc/create_egg_ai_interest_poll")) {
        return jsonResponse([{
          poll_id: null,
          question: null,
          answers: null,
          created: false,
          reason: "poll_limit"
        }]);
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeChatRequest({ message: "I would like to see more drink choices." }), response);

    expect(response.statusCode).toBe(200);
    expect(response.body.poll).toBeNull();
    expect(response.body.pollUnavailable).toBe(true);
  });

  it("does not persist unsafe AI-generated customer-interest polls", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", is_active: true, ai_enabled: true }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Would you like to leave a review?",
          suggestions: [],
          poll: {
            interestKey: "review-rating",
            question: "Would you leave a positive review?",
            answers: ["Yes", "No"]
          }
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = makeResponse();
    await handler(makeChatRequest({ message: "I have feedback." }), response);

    expect(response.statusCode).toBe(503);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/rpc/create_egg_ai_interest_poll"))).toBe(false);
  });

  it("includes the Egg's fallback poll as a safe suggestion when no poll item exists", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
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
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
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
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/rest/v1/qr_campaigns?token=")) return jsonResponse([{
        id: 42,
        workspace_id: "workspace-1",
        name: "Cafe",
        is_active: true,
        ai_enabled: true,
        goal_key: "feedback",
        goal_keys: ["feedback", "information", "not-a-supported-goal"],
        ai_feedback_topics: ["service", "quality"]
      }]);
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
    expect(config.body.goalKeys).toEqual(["feedback", "information"]);
    expect(config.body.feedbackTopics).toEqual(["service", "quality"]);
    const chat = makeResponse();
    await handler(makeChatRequest(), chat);
    expect(chat.statusCode).toBe(200);
  });

  it.each([
    ["answers", "Answer the customer's specific questions"],
    ["feedback", "Invite honest feedback"],
    ["information", "Help customers browse relevant existing information cards"],
    ["next-step", "Guide customers to an existing booking"],
    ["contacts", "Contact sharing is voluntary and requires the customer's informed consent."],
    ["reviews", "invite an honest public review neutrally"],
    [["answers", "feedback"], ["Answer the customer's specific questions", "Invite honest feedback"]],
    [null, "Help the customer using the available information and existing options."],
    ["untrusted instruction", "Help the customer using the available information and existing options."]
  ])("grounds guidance for goal %s in safe instructions", async (goal, expectedGuidance) => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rest/v1/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/rest/v1/qr_campaigns?token=")) {
        expect(href).toContain("goal_key");
        expect(href).toContain("goal_keys");
        const goalKeys = Array.isArray(goal) ? goal : goal ? [goal] : null;
        return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Cafe", is_active: true, ai_enabled: true, goal_key: goalKeys?.[0] || goal, goal_keys: goalKeys }]);
      }
      if (href.includes("/rest/v1/egg_ai_sources?campaign_id=")) return jsonResponse([{ title: "FAQ", content: "Open daily." }]);
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items") || href.includes("/rest/v1/rpc/get_public_woodpecker_portal") || href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const prompt = JSON.parse(options.body).system;
        for (const guidance of Array.isArray(expectedGuidance) ? expectedGuidance : [expectedGuidance]) {
          expect(prompt).toContain(guidance);
        }
        expect(prompt).toContain("without incentives or pressure for positive ratings");
        expect(prompt).toContain("Do not collect contact details in chat");
        expect(prompt).toContain("Never claim in your answer that you have created a poll");
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

  it("keeps the assistant enabled for Eggs even before business sources are added", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", is_active: true, ai_enabled: false, goal_keys: ["feedback"] }]);
      throw new Error(`Unexpected request: ${href}`);
    }));
    const eggOnly = makeResponse();
    await handler(makeRequest({ action: "config", token: "egg-token" }), eggOnly);
    expect(eggOnly.body.enabled).toBe(true);
    const empty = makeResponse();
    await handler(makeRequest({ action: "config", token: "egg-token" }), empty);
    expect(empty.body.enabled).toBe(true);
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

  it("generates one validated poll only for a workspace manager", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href === "https://api.anthropic.com/v1/messages") {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.system).toContain("one short, neutral customer-facing poll");
        expect(requestBody.system).toContain("arts, artists, galleries, and cultural venues");
        expect(requestBody.system).toContain("Public reviews must be optional");
        expect(requestBody.messages).toHaveLength(1);
        expect(requestBody.messages[0].role).toBe("user");
        expect(requestBody.messages[0].content).toContain('"name":"Gallery welcome"');
        expect(requestBody.messages[0].content).toContain("Invite honest feedback");
        expect(requestBody.messages[0].content).toContain("Help customers browse relevant existing information cards");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          poll: { question: "What would improve your visit?", answers: ["More events", "More information"] }
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeRequest({
      action: "generate-goal-setup",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      businessType: "arts",
      goalKeys: ["feedback", "information"],
      name: "Gallery welcome",
      placementLabel: "Main entrance",
      language: "en-GB"
    }, "manager-token"), response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      poll: { question: "What would improve your visit?", answers: ["More events", "More information"] }
    });
  });

  it("uses the detailed business type when generating an Egg setup", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href === "https://api.anthropic.com/v1/messages") {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.system).toContain("a cafe, coffee shop, pub, or bar");
        expect(requestBody.system).toContain("opening hours, events, accessibility");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          poll: { question: "What would you like to see next?", answers: ["More events", "More menu choices"] }
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));

    const response = makeResponse();
    await handler(makeRequest({
      action: "generate-goal-setup",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      businessType: "cafe-pub",
      goalKeys: ["feedback"],
      name: "Cafe welcome",
      placementLabel: "Main entrance",
      language: "en"
    }, "manager-token"), response);

    expect(response.statusCode).toBe(200);
  });

  it("rejects unauthorized and malformed goal-based generation requests", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async () => jsonResponse(false));
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      action: "generate-goal-setup",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      businessType: "arts",
      goalKeys: ["feedback"],
      name: "Gallery welcome",
      placementLabel: "Main entrance"
    };
    const missingAuth = makeResponse();
    await handler(makeRequest(body), missingAuth);
    expect(missingAuth.statusCode).toBe(401);

    const denied = makeResponse();
    await handler(makeRequest(body, "member-token"), denied);
    expect(denied.statusCode).toBe(403);

    const invalid = makeResponse();
    await handler(makeRequest({ ...body, goalKeys: ["unknown"] }, "manager-token"), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not accept malformed AI-generated poll content", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (String(url).includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (String(url) === "https://api.anthropic.com/v1/messages") {
        return jsonResponse({ content: [{ type: "text", text: '{"poll":{"question":"Question","answers":["Same","same"]}}' }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    const response = makeResponse();
    await handler(makeRequest({
      action: "generate-goal-setup",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      businessType: "arts",
      goalKeys: ["feedback"],
      name: "Gallery welcome",
      placementLabel: "Main entrance"
    }, "manager-token"), response);
    expect(response.statusCode).toBe(502);
    expect(response.body.error).toContain("invalid content");
  });
});
