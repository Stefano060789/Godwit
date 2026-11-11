import { describe, expect, it } from "vitest";
import { getReadableBrandColor } from "./pollBranding";
import { buildGuideIntents, pickNextIntent } from "./eggGuide";

describe("egg guide", () => {
  it("darkens light brand colours for readable text", () => {
    const c = getReadableBrandColor("#86efac");
    expect(c).not.toBe("#86efac");
  });
  it("builds intents and picks the next undone one", () => {
    const intents = buildGuideIntents({ goalKeys: [], items: [], aiEnabled: true, canReport: true });
    expect(intents.length).toBeGreaterThan(0);
    const next = pickNextIntent(intents, [intents[0].id]);
    expect(next?.id).not.toBe(intents[0].id);
  });
});
