import { afterEach, describe, expect, it, vi } from "vitest";
import { runPurgeBusinessResearch } from "./purgeBusinessResearchJob.js";
import { supabaseDelete } from "./cronHelpers.js";
import { runPurgeEggAiSessions } from "./purgeEggAiSessionsJob.js";

vi.mock("./cronHelpers.js", () => ({ supabaseDelete: vi.fn() }));
const original = process.env.GOOGLE_RESEARCH_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.GOOGLE_RESEARCH_ENABLED;
  else process.env.GOOGLE_RESEARCH_ENABLED = original;
  vi.resetAllMocks();
});
describe("research counter retention", () => {
  it("keeps enforcing retention even after research is disabled", async () => {
    delete process.env.GOOGLE_RESEARCH_ENABLED;
    expect(await runPurgeBusinessResearch()).toEqual({ purgedExpiredResearchCounters: true });
    expect(supabaseDelete).toHaveBeenCalledTimes(1);
  });

  it("purges expired counters and surfaces storage failures", async () => {
    process.env.GOOGLE_RESEARCH_ENABLED = "1";
    await runPurgeBusinessResearch();
    expect(supabaseDelete).toHaveBeenCalledWith(expect.stringMatching(/^business_research_usage\?retention_expires_at=lt\./));
    supabaseDelete.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(runPurgeBusinessResearch()).rejects.toThrow("Storage unavailable");
  });
});

describe("AI poll session retention", () => {
  it("removes expired session hashes even when research is disabled", async () => {
    delete process.env.GOOGLE_RESEARCH_ENABLED;
    expect(await runPurgeEggAiSessions()).toEqual({ purgedExpiredAiPollSessions: true });
    expect(supabaseDelete).toHaveBeenCalledWith(expect.stringMatching(/^egg_ai_interest_poll_sessions\?retention_expires_at=lt\./));
    supabaseDelete.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(runPurgeEggAiSessions()).rejects.toThrow("Storage unavailable");
  });
});
