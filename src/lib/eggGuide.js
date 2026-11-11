import { normalizeGoalKey } from "./startGuide";

const GOAL_INTENTS = {
  "help-and-guide": ["ask", "info"],
  information: ["info", "ask"],
  "next-step": ["info", "ask"],
  feedback: ["poll"],
  preferences: ["poll"],
  satisfaction: ["poll"],
  "event-interest": ["poll", "info"],
  "issue-reporting": ["report"],
  promotion: ["offer", "info"],
  "return-visits": ["offer", "poll"],
  contacts: ["poll"],
  reviews: ["review", "poll"]
};

export const INTENT_ICONS = {
  ask: "💬",
  poll: "🗳️",
  info: "ℹ️",
  offer: "🎁",
  report: "🛠️",
  review: "⭐",
  donate: "💛"
};

// Builds the ordered set of guided steps for a visitor. Goals decide the order; every
// published item stays reachable so nothing configured by the business is hidden.
export function buildGuideIntents({ goalKeys = [], items = [], aiEnabled = false, canReport = true }) {
  const polls = items.filter((item) => item.item_type === "poll");
  const infos = items.filter((item) => item.item_type === "info");
  const offers = items.filter((item) => item.item_type === "reward");
  const donations = items.filter((item) => item.item_type === "donation");
  const available = {
    ask: aiEnabled ? [] : null,
    review: aiEnabled && goalKeys.map(normalizeGoalKey).includes("reviews") ? [] : null,
    poll: polls.length ? polls : null,
    info: infos.length ? infos : null,
    offer: offers.length ? offers : null,
    report: canReport ? [] : null,
    donate: donations.length ? donations : null
  };
  const order = [];
  for (const goal of goalKeys.map(normalizeGoalKey)) {
    for (const kind of GOAL_INTENTS[goal] || []) if (!order.includes(kind)) order.push(kind);
  }
  for (const kind of ["ask", "poll", "info", "offer", "donate", "report"]) {
    if (!order.includes(kind)) order.push(kind);
  }
  return order
    .filter((kind) => available[kind])
    .map((kind) => ({ id: kind, kind, items: available[kind], fromGoal: order.indexOf(kind) < goalKeys.length * 2 }));
}

export function pickNextIntent(intents, doneIds) {
  return intents.find((intent) => !doneIds.includes(intent.id)) || null;
}
