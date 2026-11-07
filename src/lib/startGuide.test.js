import { describe, expect, it } from "vitest";
import { PERSONAS } from "./personas";
import { START_GOALS, buildStartLink, getAdminTab, getLoginReturnPath, getStartSelection } from "./startGuide";

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
    expect(buildStartLink("feedback", "unknown")).toBe("/admin?tab=polls&goal=feedback");
    expect(() => buildStartLink("unknown", "arts")).toThrow("Unknown starting goal");
  });

  it("resolves valid dashboard tabs and falls back to overview", () => {
    expect(getAdminTab("?tab=engagement")).toBe("engagement");
    expect(getAdminTab("?tab=woodpecker")).toBe("woodpecker");
    expect(getAdminTab("?tab=unknown")).toBe("overview");
    expect(getAdminTab("")).toBe("overview");
  });

  it("respects existing plan requirements for contact and review goals", () => {
    expect(START_GOALS.find((goal) => goal.key === "contacts").feature).toBe("leadCapture");
    expect(START_GOALS.find((goal) => goal.key === "reviews").feature).toBe("publicReviewLinks");
  });

  it.each([undefined, "", "https://example.com", "//example.com", "/admin/../login", "/administrator", "/\\example.com"])(
    "does not redirect sign-in to a destination outside the dashboard (%s)",
    (path) => expect(getLoginReturnPath(path)).toBe("/admin")
  );
});
