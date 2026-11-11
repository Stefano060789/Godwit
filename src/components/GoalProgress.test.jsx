import { describe, expect, it } from "vitest";
import { buildDailyGoalProgress, buildGoalProgressSeries } from "./GoalProgress";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";

const locales = { en, de, it: itLocale, sl };
const progressCopy = [
  "intro",
  "outcomesTitle",
  "legend",
  "period",
  "chartLabel",
  "metricNote",
  "untrackedTitle",
  "untrackedNote",
  "noTrackedOutcomes",
  "loadError",
  "emptyEggs"
];

describe("goal progress timeline", () => {
  it("fills a 30-day timeline and aggregates the selected metric and Egg", () => {
    const days = buildDailyGoalProgress([
      { campaign_id: 7, activity_date: "2026-11-09", metric: "help_interactions", event_count: 3 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "help_interactions", event_count: 2 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "help_interactions", event_count: 8 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "responses", event_count: 9 }
    ], "7", "help_interactions", new Date("2026-11-10T12:00:00Z"));

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

  it("shows category-specific series and keeps each Egg's events in scope", () => {
    const campaigns = [
      { id: 7, goal_keys: ["feedback", "contacts", "promotion"] },
      { id: 8, goal_keys: ["help-and-guide", "issue-reporting", "reviews", "return-visits"] }
    ];
    const records = [
      { campaign_id: 7, activity_date: "2026-11-09", metric: "responses", event_count: 4 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "contacts", event_count: 2 },
      { campaign_id: 7, activity_date: "2026-11-09", metric: "promotion_clicks", event_count: 1 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "issues", event_count: 3 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "help_interactions", event_count: 5 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "private_reviews", event_count: 1 },
      { campaign_id: 8, activity_date: "2026-11-09", metric: "responses", event_count: 9 }
    ];

    const all = buildGoalProgressSeries(records, campaigns, "all", new Date("2026-11-10T12:00:00Z"));
    expect(all.series.map(({ metric, total }) => [metric, total])).toEqual([
      ["help_interactions", 5],
      ["responses", 4],
      ["contacts", 2],
      ["private_reviews", 1],
      ["issues", 3],
      ["promotion_clicks", 1]
    ]);
    expect(all.untrackedGoals).toEqual(["return-visits"]);

    const oneEgg = buildGoalProgressSeries(records, campaigns, "7", new Date("2026-11-10T12:00:00Z"));
    expect(oneEgg.series.map(({ metric, total }) => [metric, total])).toEqual([
      ["responses", 4],
      ["contacts", 2],
      ["promotion_clicks", 1]
    ]);
    expect(oneEgg.untrackedGoals).toEqual([]);
  });

  it("normalizes legacy goal names when assigning measurable outcomes", () => {
    const result = buildGoalProgressSeries([
      { campaign_id: 7, activity_date: "2026-11-10", metric: "responses", event_count: 5 }
    ], [{ id: 7, goal_keys: ["answers"] }], "all", new Date("2026-11-10T12:00:00Z"));
    expect(result.series.map(({ metric, total }) => [metric, total])).toEqual([["help_interactions", 0]]);
    expect(result.series[0].goals).toEqual(["help-and-guide"]);
    expect(result.untrackedGoals).toEqual([]);
  });

  it.each(Object.keys(locales))("provides complete goal-progress labels in %s", (language) => {
    const copy = locales[language].admin.goalProgress;
    for (const key of progressCopy) expect(copy[key]).toBeTruthy();
    for (const key of ["help_interactions", "responses", "contacts", "private_reviews", "issues", "promotion_clicks"]) {
      expect(copy.series[key]).toBeTruthy();
    }
  });
});
