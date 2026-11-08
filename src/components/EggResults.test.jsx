import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EggResults from "./EggResults";

vi.mock("../lib/supabase", () => ({ supabase: { rpc: vi.fn(() => Promise.resolve({ data: [], error: null })) } }));
const campaigns = [{ id: 2, name: "Gallery", placement_label: "Entrance", goal_key: "feedback", goal_keys: ["feedback", "answers"], poll_id: 9 }];
describe("Egg-specific results", () => {
  it("shows Egg identity and customer message summary without poll, action, or visit analytics", () => {
    const labels = {
      "quickStart.goals.feedback.title": "Feedback",
      "quickStart.goals.answers.title": "Answers"
    };
    const t = (key, options = {}) => labels[key] || options.defaultValue || key;
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EggResults, {
      campaigns,
      onOpenEgg: vi.fn(), onOpenFeedback: vi.fn(), t
    })));
    expect(markup).toContain("Gallery");
    expect(markup).toContain("Entrance");
    expect(markup).toContain("Feedback · Answers");
    expect(markup).toContain("Customer messages");
    expect(markup).toContain("Only workspace owners and editors can view private customer messages.");
    expect(markup).not.toContain("QR visits");
    expect(markup).not.toContain("View poll answers");
    expect(markup).not.toContain("Connected actions");
    expect(markup).not.toContain("Detailed analytics");
  });
});
