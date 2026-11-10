import { PERSONAS } from "./personas";

export const START_GOALS = [
  { key: "answers", tab: "goal", action: "egg" },
  { key: "feedback", tab: "goal", action: "egg" },
  { key: "information", tab: "goal", action: "egg" },
  { key: "next-step", tab: "goal", action: "egg" },
  { key: "contacts", tab: "goal", action: "egg", feature: "leadCapture" },
  { key: "reviews", tab: "goal", action: "egg", feature: "publicReviewLinks" }
];

export function getCampaignGoalKeys(campaign) {
  const validKeys = new Set(START_GOALS.map((goal) => goal.key));
  const keys = Array.isArray(campaign?.goal_keys)
    ? campaign.goal_keys
    : campaign?.goal_key ? [campaign.goal_key] : [];
  return [...new Set(keys.filter((key) => validKeys.has(key)))];
}

const ADMIN_TABS = ["your-business", "business", "goal", "results", "goal-progress", "polls", "woodpecker", "connection", "engagement", "feedback", "settings"];

export function getAdminTab(search) {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "overview") return "goal";
  return ADMIN_TABS.includes(tab) ? tab : "engagement";
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
