import { PERSONAS } from "./personas";

export const START_GOALS = [
  { key: "help-and-guide", group: "help", tab: "goal", action: "egg" },
  { key: "information", group: "help", tab: "goal", action: "egg" },
  { key: "feedback", group: "listen", tab: "goal", action: "egg" },
  { key: "preferences", group: "listen", tab: "goal", action: "egg" },
  { key: "satisfaction", group: "listen", tab: "goal", action: "egg" },
  { key: "issue-reporting", group: "report", tab: "goal", action: "egg" },
  { key: "promotion", group: "growth", tab: "goal", action: "egg" },
  { key: "event-interest", group: "growth", tab: "goal", action: "egg" },
  { key: "return-visits", group: "growth", tab: "goal", action: "egg" },
  { key: "contacts", group: "customer-connection", tab: "goal", action: "egg", feature: "leadCapture" },
  { key: "reviews", group: "customer-connection", tab: "goal", action: "egg", feature: "publicReviewLinks" }
];

export const START_GOAL_GROUPS = ["help", "listen", "report", "growth", "customer-connection"];
const LEGACY_GOAL_ALIASES = new Map([
  ["answers", "help-and-guide"],
  ["next-step", "help-and-guide"]
]);

export function normalizeGoalKey(key) {
  return LEGACY_GOAL_ALIASES.get(key) || key;
}

export function getCampaignGoalKeys(campaign) {
  const validKeys = new Set(START_GOALS.map((goal) => goal.key));
  const keys = Array.isArray(campaign?.goal_keys)
    ? campaign.goal_keys
    : campaign?.goal_key ? [campaign.goal_key] : [];
  return [...new Set(keys.map(normalizeGoalKey).filter((key) => validKeys.has(key)))];
}

const ADMIN_TABS = ["your-business", "business", "goal", "results", "goal-progress", "polls", "woodpecker", "connection", "engagement", "feedback", "settings"];

export function getAdminTab(search) {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "overview") return "goal";
  return ADMIN_TABS.includes(tab) ? tab : "engagement";
}

export function getStartSelection(search) {
  const params = new URLSearchParams(search);
  const goalKey = normalizeGoalKey(params.get("goal"));
  return {
    goal: START_GOALS.find((goal) => goal.key === goalKey) || null,
    business: PERSONAS.find((business) => business.audienceKey === params.get("business")) || null
  };
}

export function buildStartLink(goalKey, businessKey) {
  const goal = START_GOALS.find((item) => item.key === normalizeGoalKey(goalKey));
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
