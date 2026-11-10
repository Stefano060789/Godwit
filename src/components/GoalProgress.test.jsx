import { describe, expect, it } from "vitest";
import { buildDailyGoalProgress } from "./GoalProgress";

describe("goal progress timeline", () => {
  it("fills a 30-day timeline and aggregates the selected metric and Egg", () => {
    const days = buildDailyGoalProgress([
      { campaign_id: 7, activity_date: "2026-11-09", metric: "interactions", event_count: 3 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "interactions", event_count: 2 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "interactions", event_count: 8 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "responses", event_count: 9 }
    ], "7", "interactions", new Date("2026-11-10T12:00:00Z"));

    expect(days).toHaveLength(30);
    expect(days[0].date).toBe("2026-10-12");
    expect(days.at(-1)).toEqual({ date: "2026-11-10", count: 0 });
    expect(days.find((day) => day.date === "2026-11-09").count).toBe(5);
  });

  it("combines all Eggs when requested", () => {
    const days = buildDailyGoalProgress([
      { campaign_id: 7, activity_date: "2026-11-10", metric: "contacts", event_count: 1 },
      { campaign_id: 8, activity_date: "2026-11-10", metric: "contacts", event_count: 2 }
    ], "all", "contacts", new Date("2026-11-10T12:00:00Z"));

    expect(days.at(-1).count).toBe(3);
  });
});
