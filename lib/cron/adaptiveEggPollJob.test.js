import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseCount, supabaseGet, supabaseRequest } = vi.hoisted(() => ({
  supabaseCount: vi.fn(),
  supabaseGet: vi.fn(),
  supabaseRequest: vi.fn()
}));

vi.mock("./cronHelpers.js", () => ({ supabaseCount, supabaseGet, supabaseRequest }));

import { runAdaptiveEggPolls } from "./adaptiveEggPollJob.js";

const originalEnv = { ...process.env };

function providerResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function configureEligibleEgg() {
  const now = new Date("2026-11-08T12:00:00.000Z");
  vi.setSystemTime(now);
  process.env.CLAUDE_API_KEY = "test-key";
  process.env.CLAUDE_HAIKU_MODEL = "claude-haiku-test";
  supabaseGet.mockImplementation(async (path) => {
    if (path.startsWith("qr_campaigns?")) {
      return [{
        id: 8,
        workspace_id: "workspace-1",
        name: "Gallery",
        placement_label: "Exit",
        business_type: "arts",
        goal_keys: ["feedback", "information"],
        created_at: "2026-09-01T00:00:00.000Z"
      }];
    }
    if (path.startsWith("egg_adaptive_poll_versions?")) return [];
    if (path.startsWith("qr_campaign_items?")) return [{ id: 9, poll_id: 10 }];
    if (path.startsWith("polls?")) {
      return [{
        id: 10,
        workspace_id: "workspace-1",
        question: "How was your visit? Contact us at private@example.test or +1 415 555 0133.",
        answers: ["Great", "Could improve"],
        creator_id: "user-1",
        status: "active",
        email_benefit_type: "none"
      }];
    }
    if (path.startsWith("votes?")) {
      expect(path).toContain("campaign_id=eq.8");
      return [
        { answer: "Great" },
        { answer: "Great" },
        { answer: "Great" },
        { answer: "Could improve" },
        { answer: "Could improve" }
      ];
    }
    if (path.startsWith("organizer_messages?")) {
      expect(path).not.toContain("reply_email");
      return [{ message: "The service was slow; contact me at private@example.test or +1 415 555 0133." }];
    }
    throw new Error(`Unexpected Supabase read: ${path}`);
  });
  supabaseCount.mockResolvedValue(4);
  supabaseRequest.mockImplementation(async (path, options) => {
    if (path === "rpc/workspace_plan_limits") {
      expect(options.body).toEqual({ target_workspace_id: "workspace-1" });
      return [{ poll_limit: 25 }];
    }
    if (path === "rpc/publish_adaptive_egg_poll") return [{ poll_id: 11, version: 1 }];
    if (path === "rpc/record_adaptive_poll_decision") return null;
    throw new Error(`Unexpected Supabase request: ${path}`);
  });
}

describe("adaptive Egg poll cron job", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    supabaseCount.mockReset();
    supabaseGet.mockReset();
    supabaseRequest.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("adapts a goal-managed poll from response counts and private-message topic counts only", async () => {
    configureEligibleEgg();
    const fetchMock = vi.fn(async (url, options) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
      const requestBody = JSON.parse(options.body);
      expect(requestBody.model).toBe("claude-haiku-test");
      expect(requestBody.system).toContain('"goals":["feedback","information"]');
      expect(requestBody.system).toContain('"voteCount":5');
      expect(requestBody.system).toContain('"service":1');
      expect(requestBody.system).toContain('"speed":1');
      expect(requestBody.system).not.toContain("private@example.test");
      expect(requestBody.system).not.toContain("415 555 0133");
      expect(requestBody.system).not.toContain("The service was slow");
      return providerResponse({
        content: [{ type: "text", text: JSON.stringify({
          question: "Which gallery information would help you most?",
          answers: ["Artwork details", "Visitor facilities", "Upcoming events"]
        }) }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(runAdaptiveEggPolls()).resolves.toEqual({
      candidates: 1,
      generated: 1,
      skipped: 0
    });

    expect(supabaseRequest).toHaveBeenLastCalledWith("rpc/publish_adaptive_egg_poll", {
      method: "POST",
      body: {
        target_campaign_id: 8,
        expected_poll_id: 10,
        target_question: "Which gallery information would help you most?",
        target_answers: ["Artwork details", "Visitor facilities", "Upcoming events"],
        observed_vote_count: 5,
        observed_message_count: 1
      }
    });
  });

  it("does not call AI after the per-Egg version cap is reached", async () => {
    configureEligibleEgg();
    supabaseGet.mockImplementation(async (path) => {
      if (path.startsWith("qr_campaigns?")) {
        return [{
          id: 8,
          workspace_id: "workspace-1",
          created_at: "2026-09-01T00:00:00.000Z"
        }];
      }
      if (path.startsWith("egg_adaptive_poll_versions?")) {
        return [{ version: 3, created_at: "2026-10-01T00:00:00.000Z" }];
      }
      throw new Error(`Unexpected Supabase read after version cap: ${path}`);
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runAdaptiveEggPolls()).resolves.toEqual({
      candidates: 1,
      generated: 0,
      skipped: 1
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/record_adaptive_poll_decision", {
      method: "POST",
      body: {
        target_campaign_id: 8,
        decision: "version_limit",
        next_run_at: null,
        error_message: null
      }
    });
  });

  it("does not call AI when the workspace has no poll capacity", async () => {
    configureEligibleEgg();
    supabaseCount.mockResolvedValue(3);
    supabaseRequest.mockImplementation(async (path) => {
      if (path === "rpc/workspace_plan_limits") return [{ poll_limit: 3 }];
      if (path === "rpc/record_adaptive_poll_decision") return null;
      throw new Error(`Unexpected Supabase request after quota check: ${path}`);
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(runAdaptiveEggPolls()).resolves.toEqual({
      candidates: 1,
      generated: 0,
      skipped: 1
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/record_adaptive_poll_decision", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ target_campaign_id: 8, decision: "poll_limit" })
    }));
  });

  it("rejects generated public-review prompts instead of publishing them", async () => {
    configureEligibleEgg();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => providerResponse({
      content: [{ type: "text", text: JSON.stringify({
        question: "Would you leave us a Google review?",
        answers: ["Yes", "No"]
      }) }]
    })));

    await expect(runAdaptiveEggPolls()).rejects.toThrow("failed for 1 campaign");
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/record_adaptive_poll_decision", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ target_campaign_id: 8, decision: "generation_failed" })
    }));
  });
});
