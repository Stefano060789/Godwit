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
    businessType: "cafe-pub",
    canManage: true, entitlements: {}, onCreate: vi.fn(), t, ...overrides
  })));
}
describe("Egg goal setup", () => {
  it("uses the saved business profile and restores the selected goal", () => {
    const markup = render();
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toContain("Give your Egg a purpose");
    expect(markup).toContain("For cafes and pubs");
    expect(markup).toContain("Choose one or more outcomes that matter for this Egg.");
    expect(markup).not.toContain("goal-business-grid");
    expect(markup).toContain('maxLength="120"');
    expect(markup).toContain('maxLength="80"');
    expect(markup).toContain("Create Egg");
    expect(markup).toContain("Customer benefits");
    expect(markup).toContain("Optional email thank-you");
    expect(markup).not.toContain("Open polls");
    expect(markup).not.toContain("After voting");
    expect(markup).toContain("Public reviews must stay optional and cannot be rewarded.");
    expect(markup).not.toContain("admin.goal.");
  });
  it("disables the form for viewers", () => {
    expect(render({ canManage: false }).match(/<fieldset disabled=""/g)).toHaveLength(2);
  });
  it("requires a saved business profile before creating an Egg", () => {
    const markup = render({ businessType: "" });
    expect(markup).toContain("Set your business type before creating an Egg.");
    expect(markup).toContain('href="/admin?tab=your-business"');
    expect(markup).toContain('disabled=""');
  });
  it("retains the upgrade route for gated goals", () => {
    expect(render({ initialSelection: getStartSelection("?business=arts&goal=contacts") })).toContain('href="/admin/billing"');
  });
  it("offers benefit selection in Goal without directing the business to polls", () => {
    const markup = render({ entitlements: { emailBenefits: true } });
    expect(markup).toContain("Customer benefit");
    expect(markup).toContain('value="voucher"');
    expect(markup).toContain('value="discount_code"');
    expect(markup).not.toContain("Open polls");
  });
  it("presents distinct customer outcomes and explicitly includes cafes and pubs", () => {
    const markup = render();
    expect(markup).toContain("Answer customer questions");
    expect(markup).toContain("Show menus, stories &amp; details");
    expect(markup).toContain("Collect feedback responses");
    expect(markup).toContain("Guide customers to a next step");
    expect(markup).toContain("Collect opted-in contacts");
    expect(markup).toContain("Invite honest reviews");
  });
  it("adapts the outcome guidance to the saved business type", () => {
    const markup = render({ businessType: "restaurant-food" });
    expect(markup).toContain("For restaurants and food venues");
    expect(markup).toContain("share menus and dietary information");
    expect(markup).toContain("ordering and reservations");
  });
});
