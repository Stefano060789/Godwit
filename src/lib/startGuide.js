import { PERSONAS } from "./personas";

export const START_GOALS = [
  { key: "answers", tab: "engagement", action: "egg" },
  { key: "feedback", tab: "engagement", action: "egg" },
  { key: "information", tab: "engagement", action: "egg" },
  { key: "next-step", tab: "engagement", action: "egg" },
  { key: "contacts", tab: "engagement", action: "egg", feature: "leadCapture" },
  { key: "reviews", tab: "settings", action: "reviews", feature: "publicReviewLinks" }
];

const ADMIN_TABS = ["overview", "polls", "woodpecker", "connection", "engagement", "feedback", "settings"];

export function getAdminTab(search) {
  const tab = new URLSearchParams(search).get("tab");
  return ADMIN_TABS.includes(tab) ? tab : "overview";
}

export function getStartSelection(search) {
  const params = new URLSearchParams(search);
  return {
    goal: START_GOALS.find((goal) => goal.key === params.get("goal")) || null,
    business: PERSONAS.find((business) => business.audienceKey === params.get("business")) || null
  };
}

export function buildStartLink(goalKey, businessKey) {
  const goal = START_GOALS.find((item) => item.key === goalKey);
  if (!goal) throw new Error(`Unknown starting goal: ${goalKey}`);
  const params = new URLSearchParams({ tab: goal.tab, goal: goal.key });
  if (PERSONAS.some((business) => business.audienceKey === businessKey)) {
    params.set("business", businessKey);
  }
  return `/admin?${params}`;
}

export function getLoginReturnPath(returnTo) {
  // Only dashboard destinations from the starting guide are accepted.
  if (typeof returnTo !== "string" || !/^\/admin(?:\?|$)/.test(returnTo)) return "/admin";
  return returnTo;
}
