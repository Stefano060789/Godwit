import { afterEach, describe, expect, it, vi } from "vitest";
import { researchConfiguration, runBusinessResearch, validateResearchInput } from "./businessResearch.js";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

describe("business research", () => {
  it("rejects visitor-oriented or unbounded input", () => {
    expect(validateResearchInput({ consent: true, location: "Villach", topic: "practical" })).toEqual({ location: "Villach", topic: "practical", artwork: "" });
    for (const input of [
      { consent: false, location: "Villach", topic: "menu" },
      { consent: true, location: "Villach", topic: "visitor" },
      { consent: true, location: "visitor@example.com", topic: "menu" },
      { consent: true, location: "Villach", topic: "artwork" },
      { consent: true, location: "x".repeat(121), topic: "menu" }
    ]) expect(validateResearchInput(input)).toBeNull();
  });

  it("does not silently default missing or excessive weekly caps", () => {
    process.env.GOOGLE_RESEARCH_ENABLED = "1";
    process.env.GOOGLE_RESEARCH_PROVIDER_APPROVED = "1";
    process.env.GEMINI_API_KEY = "fake-key";
    process.env.GOOGLE_RESEARCH_MODEL = "gemini-3.8-flash";
    process.env.GOOGLE_RESEARCH_GLOBAL_WEEKLY_LIMIT = "50";
    delete process.env.GOOGLE_RESEARCH_WORKSPACE_WEEKLY_LIMIT;
    expect(researchConfiguration()).toBeNull();
    process.env.GOOGLE_RESEARCH_WORKSPACE_WEEKLY_LIMIT = "21";
    expect(researchConfiguration()).toBeNull();
    process.env.GOOGLE_RESEARCH_WORKSPACE_WEEKLY_LIMIT = "3";
    expect(researchConfiguration()).toMatchObject({ workspaceLimit: 3, globalLimit: 50 });
  });

  it.each([
    { status: "incomplete", steps: [] },
    { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "Unsupported claim" }] }] }
  ])("fails explicitly on incomplete or ungrounded research", async (body) => {
    process.env.GEMINI_API_KEY = "fake-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(runBusinessResearch("Example Pub", { topic: "menu", location: "Villach" }, { model: "gemini-3.8-flash" })).rejects.toThrow();
  });
});
