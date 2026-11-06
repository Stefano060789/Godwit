import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadLatestReputationSnapshot,
  loadReputationHistory,
  refreshReputationSnapshot
} from "./reputation.js";

describe("disabled reputation data access", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects snapshot reads, history reads, and refreshes without network access", async () => {
    const fetchMock = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);

    for (const action of [
      () => loadLatestReputationSnapshot("workspace-1"),
      () => loadReputationHistory("workspace-1"),
      () => refreshReputationSnapshot("workspace-1")
    ]) {
      await expect(action()).rejects.toMatchObject({
        message: "Google Places features are disabled.",
        code: "google_places_disabled"
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
