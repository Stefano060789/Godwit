import { describe, expect, it } from "vitest";
import { findPersona, PERSONAS } from "./personas";

describe("business guidance paths", () => {
  it("covers the five primary business groups", () => {
    expect(PERSONAS.map((persona) => persona.key)).toEqual([
      "arts-culture",
      "hospitality",
      "tourism-places",
      "events-communities",
      "shops-services"
    ]);
  });

  it("preserves saved persona choices from the previous guide", () => {
    expect(findPersona("artist")).toBe(findPersona("arts-culture"));
    expect(findPersona("small-business")).toBe(findPersona("shops-services"));
    expect(findPersona("large-org")).toBe(findPersona("tourism-places"));
    expect(findPersona("unknown")).toBeNull();
    expect(findPersona(null)).toBeNull();
    expect(findPersona("")).toBeNull();
  });

  it("sends the arts enquiry recommendation to an Egg information card, not a poll", () => {
    const enquiry = findPersona("arts-culture").steps.find((step) => step.title === "Invite an enquiry");
    expect(enquiry.tab).toBe("engagement");
    expect(enquiry.route).toBeUndefined();
  });
  it("uses only existing dashboard tabs and routes in its recommended steps", () => {
    const tabs = new Set(["engagement", "connection", "settings"]);

    PERSONAS.forEach((persona) => {
      expect(persona.steps.length).toBeGreaterThan(0);
      persona.steps.forEach((step) => {
        expect(Boolean(step.tab || step.route)).toBe(true);
        if (step.tab) expect(tabs.has(step.tab)).toBe(true);
        if (step.route) expect(step.route).toMatch(/^\/(create|admin)/);
      });
    });
  });

  it("keeps business recommendations inside the Egg workspace", () => {
    for (const persona of PERSONAS) {
      for (const step of persona.steps) {
        expect(step.tab).toBe("engagement");
        expect(step.route).toBeUndefined();
      }
    }
  });
});
