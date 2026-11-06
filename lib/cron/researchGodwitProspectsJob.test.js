import { afterEach, describe, expect, it, vi } from "vitest";
import { runResearchGodwitProspects } from "./researchGodwitProspectsJob.js";

const originalEnv = { ...process.env };

describe("runResearchGodwitProspects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("reports the disabled feature and performs no fetch or storage, even with a configured key", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "places-key";
    const fetchMock = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    await expect(runResearchGodwitProspects()).resolves.toEqual({
      researched: 0,
      inserted: 0,
      countries: {},
      disabled: true,
      code: "google_places_disabled",
      message: "Google Places features are disabled."
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Google Places feature disabled.", {
      action: "prospect_research",
      code: "google_places_disabled"
    });
  });
});
