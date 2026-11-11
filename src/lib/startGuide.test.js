import { describe, expect, it } from "vitest";
import { PERSONAS } from "./personas";
import { getCampaignGoalKeys, START_GOALS, buildStartLink, getAdminTab, getLoginReturnPath, getStartSelection } from "./startGuide";

describe("starting guide navigation", () => {
  it("carries every valid category and goal to the right dashboard tab", () => {
    for (const business of PERSONAS) {
      for (const goal of START_GOALS) {
        const url = buildStartLink(goal.key, business.audienceKey);
        const search = url.slice(url.indexOf("?"));
        expect(getAdminTab(search)).toBe(goal.tab);
        expect(getStartSelection(search)).toEqual({ business, goal });
        expect(getLoginReturnPath(url)).toBe(url);
      }
    }
  });

  it("keeps category optional and ignores invalid URL inputs", () => {
    expect(getStartSelection("?goal=unknown&business=unknown")).toEqual({ business: null, goal: null });
    expect(buildStartLink("feedback", "unknown")).toBe("/admin?tab=goal&goal=feedback");
    expect(() => buildStartLink("unknown", "arts")).toThrow("Unknown starting goal");
  });

  it("resolves hub tabs and preserves legacy destinations", () => {
    expect(getAdminTab("?tab=engagement")).toBe("engagement");
    expect(getAdminTab("?tab=woodpecker")).toBe("woodpecker");
    for (const tab of ["your-business", "business", "goal", "results", "settings", "feedback", "connection", "polls"]) {
      expect(getAdminTab(`?tab=${tab}`)).toBe(tab);
    }
    expect(getAdminTab("?tab=overview")).toBe("goal");
    expect(getAdminTab("?tab=unknown")).toBe("engagement");
    expect(getAdminTab("")).toBe("engagement");
  });

  it("respects existing plan requirements for contact and review goals", () => {
    expect(START_GOALS.find((goal) => goal.key === "contacts").feature).toBe("leadCapture");
    expect(START_GOALS.find((goal) => goal.key === "reviews").feature).toBe("publicReviewLinks");
  });

  it("starts every selectable customer goal from an Egg", () => {
    for (const { key } of START_GOALS) {
      expect(START_GOALS.find((goal) => goal.key === key)).toMatchObject({ tab: "goal", action: "egg" });
    }
  });

  it("normalizes legacy question and next-step goals to the combined goal", () => {
    expect(getStartSelection("?goal=answers").goal.key).toBe("help-and-guide");
    expect(getStartSelection("?goal=next-step").goal.key).toBe("help-and-guide");
  });

  it("reads multiple goals and falls back to the legacy single-goal column", () => {
    expect(getCampaignGoalKeys({ goal_keys: ["feedback", "answers", "next-step", "feedback", "invalid"] })).toEqual(["feedback", "help-and-guide"]);
    expect(getCampaignGoalKeys({ goal_key: "reviews" })).toEqual(["reviews"]);
    expect(getCampaignGoalKeys({ goal_key: "answers" })).toEqual(["help-and-guide"]);
    expect(getCampaignGoalKeys({ goal_keys: null, goal_key: null })).toEqual([]);
  });

  it.each([undefined, "", "https://example.com", "//example.com", "/admin/../login", "/administrator", "/\\example.com"])(
    "does not redirect sign-in to a destination outside the dashboard (%s)",
    (path) => expect(getLoginReturnPath(path)).toBe("/admin")
  );
});
