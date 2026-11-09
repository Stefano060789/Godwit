import { describe, expect, it, vi } from "vitest";
import { getEggAccessAnalyticsErrorMessage } from "./eggAccessAnalytics";

describe("Egg access analytics errors", () => {
  it("only requests migration repair for missing database functions, columns, or tables", () => {
    const translate = vi.fn((key) => key);

    for (const code of ["PGRST202", "42883", "42703", "42P01"]) {
      expect(getEggAccessAnalyticsErrorMessage({ code }, translate))
        .toBe("admin.engagement.campaigns.migrationRequired");
    }

    expect(translate).toHaveBeenCalledTimes(4);
  });

  it("shows a sign-in message when the analytics RPC has no authenticated user", () => {
    expect(getEggAccessAnalyticsErrorMessage(
      { code: "P0001", message: "Authentication is required." },
      (key) => key
    )).toBe("admin.engagement.campaigns.sessionRequired");
  });

  it("does not mistake unrelated RPC errors for a missing migration", () => {
    expect(getEggAccessAnalyticsErrorMessage(
      { code: "42501", message: "permission denied" },
      (key) => key
    )).toBe("admin.engagement.campaigns.loadFailed");
  });
});
