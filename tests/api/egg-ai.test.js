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

  it.each([
    [{ pollId: 91, answers: ["One", "Two"] }, 200],
    [{ pollId: 91, answers: ["Invented"] }, 400],
    [{ pollId: 999, answers: ["One"] }, 400],
    [{ pollId: 91, answers: ["One", "Two"] }, 400, false],
    [{ pollId: 91, answers: ["One", "Two"] }, 200, true, true]
  ])("validates poll continuation before using AI (%j)", async (pollResponse, status, multipleChoice = true, generated = false) => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Pub", is_active: true, ai_enabled: true }]);
      if (href.includes("/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/egg_ai_sources?") || href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      if (href.includes("/rpc/get_public_qr_campaign_items")) return jsonResponse(generated ? [] : [{ item_id: 17, item_type: "poll", poll_id: 91, poll_question: "What interests you?" }]);
      if (href.includes("/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/egg_ai_interest_poll_sessions?")) {
        if (generated) {
          expect(href).toContain("campaign_id=eq.42&session_hash=eq.");
          expect(href).toContain("poll_id=eq.91");
        }
        return jsonResponse(generated ? [{ poll_id: 91 }] : []);
      }
      if (href.includes("/rpc/get_public_poll")) return jsonResponse([{ question: "What interests you?", answers: ["One", "Two"], multiple_choice: multipleChoice }]);
      if (href.includes("/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.messages.at(-1).content).toContain('"answers":["One","Two"]');
        expect(requestBody.system).toContain("Do not treat one answer or one vote as the end");
        expect(requestBody.system).toContain("up to 3 distinct polls");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Here is a relevant next step.",
          followUps: [
            { label: "Explore the menu", message: "Which supplied menu options match my preferences?" },
            { label: "Contact", message: "Email visitor@example.com" },
            { label: "Our location", message: "Where is the business located?" },
            { label: "More details", message: "What else is available?" }
          ]
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeChatRequest({ pollResponse }), response);
    expect(response.statusCode).toBe(status);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("api.anthropic.com"))).toHaveLength(status === 200 ? 1 : 0);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("reserve_egg_ai_turn"))).toHaveLength(status === 200 ? 1 : 0);
    if (status === 200) expect(response.body.followUps).toEqual([
      { label: "Explore the menu", message: "Which supplied menu options match my preferences?" },
      { label: "Our location", message: "Where is the business located?" }
    ]);
  });

  it("only suggests existing offer and issue-report actions and validates remembered choices", async () => {
    configureEnvironment();
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Pub", is_active: true, ai_enabled: true }]);
      if (href.includes("/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/egg_ai_sources?") || href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      if (href.includes("/rpc/get_public_qr_campaign_items")) return jsonResponse([
        { item_id: 17, item_type: "poll", poll_id: 91, poll_question: "Preference?" },
        { item_id: 18, item_type: "reward", title: "Lunch offer", body: "Supplied details" }
      ]);
      if (href.includes("/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rpc/get_public_poll")) return jsonResponse([{ question: "Preference?", answers: ["Vegetarian", "Other"], multiple_choice: false }]);
      if (href.includes("/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const body = JSON.parse(options.body);
        expect(body.messages.at(-1).content).toContain('"answers":["Vegetarian"]');
        expect(body.system).toContain('"type":"reward"');
        expect(body.system).toContain('"id":"guide:report"');
        expect(body.system).toContain("Treat blank template fields as unknown");
        return jsonResponse({ content: [{ type: "text", text: JSON.stringify({
          answer: "Here are relevant options.", suggestions: ["18", "guide:report", "invented"]
        }) }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeChatRequest({ sharedPollResponses: [{ pollId: 91, answers: ["Vegetarian"] }] }), response);
    expect(response.statusCode).toBe(200);
    expect(response.body.suggestions).toEqual([
      { id: "18", type: "reward", title: "Lunch offer" },
      { id: "guide:report", type: "report", title: "Report an issue" }
    ]);
    const invalid = makeResponse();
    await handler(makeChatRequest({ sharedPollResponses: [{ pollId: 91, answers: ["Invented"] }] }), invalid);
    expect(invalid.statusCode).toBe(400);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("api.anthropic.com"))).toHaveLength(1);
  });

  it("returns only safe workspace-provided links even if Claude invents a link field", async () => {
    configureEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?token=")) return jsonResponse([{ id: 42, workspace_id: "workspace-1", name: "Pub", is_active: true, ai_enabled: true }]);
      if (href.includes("/rpc/check_egg_trial_session")) return jsonResponse(true);
      if (href.includes("/egg_ai_sources?")) return jsonResponse([]);
      if (href.includes("/workspace_ai_sources?")) {
        expect(href).toContain("source_url");
        return jsonResponse([
          { source_type: "instagram", source_url: "https://www.instagram.com/example", content: "https://www.instagram.com/example" },
          { source_type: "website", title: "Menu", source_url: "https://example.org/menu", content: "Website link only (page content not imported)." },
          { source_url: "javascript:alert(1)", content: "Unsafe" },
          { source_url: "https://localhost/private", content: "Private" }
        ]);
      }
      if (href.includes("/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const { system } = JSON.parse(options.body);
        expect(system).toContain("Only suggest visiting a website or social profile when an exact approved link is listed");
        expect(system).toContain("https://example.org/menu");
        expect(system).toContain("Do not claim Google or social media was searched");
        expect(system).toContain("use up to 90 words");
        return jsonResponse({ content: [{ type: "text", text: '{"answer":"I do not have the current menu details, but here is the supplied menu link.","businessLinks":[{"url":"https://invented.example.org"}]}' }] });
      }
      throw new Error(`Unexpected request: ${href}`);
    }));
    const response = makeResponse();
    await handler(makeChatRequest({ message: "Where is the menu?" }), response);
    expect(response.statusCode).toBe(200);
    expect(response.body.businessLinks).toEqual([
      { title: "Instagram", url: "https://www.instagram.com/example" },
      { title: "Menu", url: "https://example.org/menu" }
    ]);
  });

  it("requires manager authorization before any Google research", async () => {
    configureEnvironment();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(false));
    vi.stubGlobal("fetch", fetchMock);
    const body = { action: "research-workspace", workspaceId: "11111111-1111-4111-8111-111111111111", location: "Villach", topic: "practical", consent: true };
    const anonymous = makeResponse();
    await handler(makeRequest(body), anonymous);
    expect(anonymous.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    const member = makeResponse();
    await handler(makeRequest(body, "member-token"), member);
    expect(member.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("is_workspace_manager");
  });

  it("keeps research disabled without explicit provider and spend configuration", async () => {
    configureEnvironment();
    delete process.env.GOOGLE_RESEARCH_ENABLED;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(true));
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest({ action: "research-workspace", workspaceId: "11111111-1111-4111-8111-111111111111", location: "Villach", topic: "menu", consent: true }, "manager-token"), response);
    expect(response.statusCode).toBe(503);
    expect(response.body.error).toContain("weekly limits");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("reserves weekly research before contacting Google (allowed=%s)", async (allowed) => {
    configureEnvironment();
    process.env.GOOGLE_RESEARCH_ENABLED = "1";
    process.env.GOOGLE_RESEARCH_PROVIDER_APPROVED = "1";
    process.env.GOOGLE_RESEARCH_MODEL = "gemini-3.8-flash";
    process.env.GOOGLE_RESEARCH_WORKSPACE_WEEKLY_LIMIT = "3";
    process.env.GOOGLE_RESEARCH_GLOBAL_WEEKLY_LIMIT = "50";
    process.env.GEMINI_API_KEY = "fake-google-key";
    const text = "The public menu is on the official website.";
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href.includes("/workspaces?id=")) {
        expect(options.headers.Authorization).toBe("Bearer manager-token");
        return jsonResponse([{ name: "Example Pub" }]);
      }
      if (href.includes("/rpc/reserve_business_research")) {
        expect(options.headers.Authorization).toBe("Bearer service-role");
        expect(JSON.parse(options.body)).toEqual({
          target_workspace_id: "11111111-1111-4111-8111-111111111111", workspace_limit: 3, global_limit: 50
        });
        return jsonResponse(allowed);
      }
      if (href === "https://generativelanguage.googleapis.com/v1beta/interactions") {
        const body = JSON.parse(options.body);
        expect(body.store).toBe(false);
        expect(body.tools).toEqual([{ type: "google_search" }]);
        expect(body.generation_config.max_output_tokens).toBe(1200);
        expect(body.input).toContain("Example Pub");
        expect(body.input).not.toContain("PRIVATE VISITOR MESSAGE");
        expect(body).not.toHaveProperty("history");
        return jsonResponse({ status: "completed", steps: [
          { type: "model_output", content: [{ type: "text", text, annotations: [{ type: "url_citation", url: "https://example.org/menu", title: "Official menu" }] }] },
          { type: "google_search_result", result: [{ search_suggestions: '<a href="https://www.google.com/search?q=Example+Pub">Example Pub</a>' }] }
        ] });
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest({ action: "research-workspace", workspaceId: "11111111-1111-4111-8111-111111111111", location: "Villach", topic: "menu", consent: true, history: "PRIVATE VISITOR MESSAGE" }, "manager-token"), response);
    expect(response.statusCode).toBe(allowed ? 200 : 429);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    const providerCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("generativelanguage"));
    expect(providerCalls).toHaveLength(allowed ? 1 : 0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("workspace_ai_sources"))).toBe(false);
    if (allowed) {
      expect(response.body.text).toBe(text);
      expect(response.body.citations).toEqual([{ url: "https://example.org/menu", title: "Official menu" }]);
      expect(response.body.searchSuggestions).toHaveLength(1);
    }
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
        expect(requestBody.max_tokens).toBe(650);
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
            answers: ["Cold brew", "Decaf", "Plant-based milk"],
            multipleChoice: true
          }
        }) }] });
      }
      if (href.includes("/rest/v1/rpc/create_egg_ai_interest_poll")) {
        const requestBody = JSON.parse(options.body);
        expect(requestBody.target_campaign_id).toBe(42);
        expect(requestBody.target_session_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(requestBody.target_interest_key).toBe("coffee-options");
        expect(requestBody.target_answers).toEqual(["Cold brew", "Decaf", "Plant-based milk"]);
        expect(requestBody.target_multiple_choice).toBe(true);
        return jsonResponse([{
          poll_id: 91,
          question: "Which coffee option would you like to see more of?",
          answers: ["Cold brew", "Decaf", "Plant-based milk"],
          created: true,
          multiple_choice: true,
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
      created: true,
      multipleChoice: true
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
      if (href.includes("/rest/v1/workspace_ai_sources?workspace_id=eq.workspace-1")) return jsonResponse([
        { id: 1, title: "Notes", content: "Open daily.", source_type: "notes" },
        { id: 2, title: "Facebook page or profile", content: "https://www.facebook.com/example", source_type: "facebook" },
        { id: 3, title: "Instagram profile", content: "https://www.instagram.com/example", source_type: "instagram" }
      ]);
      if (href.includes("/rest/v1/rpc/get_public_qr_campaign_items") || href.includes("/rest/v1/rpc/get_public_woodpecker_portal") || href.includes("/rest/v1/rpc/get_public_qr_campaign")) return jsonResponse([]);
      if (href.includes("/rest/v1/rpc/reserve_egg_ai_turn")) return new Response(null, { status: 204 });
      if (href === "https://api.anthropic.com/v1/messages") {
        const system = JSON.parse(options.body).system;
        expect(system).toContain("Open daily.");
        expect(system).toContain("Facebook page or profile link (content not imported)");
        expect(system).toContain("Instagram profile link (profile content not imported)");
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
        expect(prompt).toContain("without incentives, sentiment gating or pressure");
        expect(prompt).toContain("Do not collect contact details in chat");
        expect(prompt).toContain("Do not claim a poll, action, contact record or issue resolution has happened");
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

  it("saves readable text from a manually uploaded page using the manager's credentials", async () => {
    configureEnvironment();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      if (href.endsWith("/workspace_ai_sources")) {
        expect(options.headers.Authorization).toBe(["Bearer", "manager-token"].join(" "));
        const source = JSON.parse(options.body);
        expect(source).toMatchObject({
          workspace_id: workspaceId, source_type: "website", title: "Uploaded page: example.com", source_url: "https://example.com/"
        });
        expect(source.content).toContain("Open daily");
        expect(source.content).not.toContain("secret script");
        return jsonResponse([source], 201);
      }
      throw new Error(`Unexpected request: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();
    await handler(makeRequest({
      action: "upload-workspace-website", workspaceId, websiteUrl: "https://example.com/",
      html: "<html><body><main>Open daily</main><script>secret script</script></body></html>"
    }, "manager-token"), response);
    expect(response.statusCode).toBe(201);
    expect(vi.mocked(getPublicBusinessWebsiteContext)).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("https://supabase.test/"))).toBe(true);
  });

  it("rejects invalid, oversized, empty and unauthorized uploads", async () => {
    configureEnvironment();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const body = { action: "upload-workspace-website", workspaceId, websiteUrl: "https://example.com", html: "<html><body>Text</body></html>" };
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (String(url).includes("/workspace_ai_sources?")) return jsonResponse([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const [overrides, token, status] of [
      [{ html: "not html" }, "manager-token", 400],
      [{ html: `<html>${"a".repeat(1_000_000)}</html>` }, "manager-token", 413],
      [{ html: "<html><body><script>only script</script></body></html>" }, "manager-token", 422],
      [{}, "", 401]
    ]) {
      const response = makeResponse();
      await handler(makeRequest({ ...body, ...overrides }, token), response);
      expect(response.statusCode).toBe(status);
    }
    fetchMock.mockImplementationOnce(async () => jsonResponse(false));
    const denied = makeResponse();
    await handler(makeRequest(body, "member-token"), denied);
    expect(denied.statusCode).toBe(403);
    expect(vi.mocked(getPublicBusinessWebsiteContext)).not.toHaveBeenCalled();
  });

  it.each([
    ["website_blocked", "denied access"],
    ["website_unavailable", "could not be reached"],
    ["website_too_large", "too large"],
    ["no_page_text", "couldn't extract readable information"],
    ["unsafe_website", "cannot be imported"]
  ])("reports %s on both website import flows without storing a source", async (status, message) => {
    configureEnvironment();
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({ status, text: "" });
    const fetchMock = vi.fn(async (url, options = {}) => {
      const href = String(url);
      if (href.includes("/qr_campaigns?id=eq.42")) return jsonResponse([{ id: 42, workspace_id: workspaceId }]);
      if (href.includes("/rpc/is_workspace_manager")) return jsonResponse(true);
      if (href.includes("/egg_ai_sources?") || href.includes("/workspace_ai_sources?")) return jsonResponse([]);
      throw new Error(`Unexpected request: ${href} ${options.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    for (const body of [
      { action: "import-website", campaignId: 42, websiteUrl: "https://example.com" },
      { action: "import-workspace-website", workspaceId, websiteUrl: "https://example.com" }
    ]) {
      const response = makeResponse();
      await handler(makeRequest(body, "manager-token"), response);
      expect(response.statusCode).toBe(422);
      expect(response.body.error).toContain(message);
    }
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "POST" || !String(options?.body).includes("source_type"))).toBe(true);
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
    const facebook = makeResponse();
    await handler(makeRequest({ ...body, websiteUrl: "https://www.facebook.com/example" }, "manager-token"), facebook);
    expect(facebook.statusCode).toBe(400);
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
