import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EggResults, { eggPollIds } from "./EggResults";

vi.mock("../lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
const campaigns = [{ id: 2, name: "Gallery", placement_label: "Entrance", goal_key: "feedback", poll_id: 9 }];
const items = [{ campaign_id: 2, item_type: "poll", poll_id: 9 }, { campaign_id: 2, item_type: "poll", poll_id: 10 }, { campaign_id: 7, item_type: "poll", poll_id: 11 }];
describe("Egg-specific results", () => {
  it("deduplicates default polls and excludes another Egg's items", () => {
    expect(eggPollIds(campaigns[0], items)).toEqual(["9", "10"]);
  });
  it("shows the Egg, location, report links and unavailable metrics rather than false zeros", () => {
    const t = (key, options = {}) => options.defaultValue || key;
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EggResults, {
      campaigns, items, polls: [{ id: 9, question: "Your experience?" }], tasks: [], tasksError: "",
      onOpenEgg: vi.fn(), onOpenFeedback: vi.fn(), onOpenActions: vi.fn(), onOpenContacts: vi.fn(), t
    })));
    expect(markup).toContain("Gallery");
    expect(markup).toContain("Entrance");
    expect(markup).toContain('href="/results/9"');
    expect(markup).toContain('href="/results/10"');
    expect(markup).not.toContain("/results/11");
    expect(markup.match(/<dd>—<\/dd>/g)).toHaveLength(4);
    expect(markup).toContain("Counts above are attributed to this Egg");
  });
});
