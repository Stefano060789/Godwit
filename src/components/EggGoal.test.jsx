import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EggGoal from "./EggGoal";
import { getStartSelection } from "../lib/startGuide";
import en from "../i18n/locales/en.json";

const t = (key, options = {}) => key.split(".").reduce((value, part) => value?.[part], en) || options.defaultValue || key;
function render(overrides = {}) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EggGoal, {
    initialSelection: getStartSelection("?business=arts&goal=feedback"),
    canManage: true, entitlements: {}, onCreate: vi.fn(), t, ...overrides
  })));
}
describe("Egg goal setup", () => {
  it("restores the business and goal and asks for separate Egg identity and location", () => {
    const markup = render();
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(markup).toContain("Give your Egg a purpose");
    expect(markup).toContain("Select every goal you want this Egg to support.");
    expect(markup).toContain("Godwit will create one poll and one text-response action for this Egg, based on your goals.");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('maxLength="120"');
    expect(markup).toContain('maxLength="80"');
    expect(markup).toContain("Create Egg");
    expect(markup).toContain("Customer benefits");
    expect(markup).toContain("Reward an email opt-in");
    expect(markup).toContain("Public reviews must stay optional and cannot be rewarded.");
    expect(markup).not.toContain("admin.goal.");
  });
  it("disables the form for viewers", () => {
    expect(render({ canManage: false }).match(/<fieldset disabled=""/g)).toHaveLength(3);
  });
  it("retains the upgrade route for gated goals", () => {
    expect(render({ initialSelection: getStartSelection("?business=arts&goal=contacts") })).toContain('href="/admin/billing"');
  });
});
