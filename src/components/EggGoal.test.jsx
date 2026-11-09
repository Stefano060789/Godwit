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
    expect(markup).toContain("Choose the closest fit.");
    expect(markup).toContain("For artists, galleries, and museums");
    expect(markup).toContain("Choose one or more outcomes that matter for this Egg.");
    expect(markup).not.toContain("Godwit creates and connects the polls");
    expect(markup).toContain('aria-pressed="true"');
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
    expect(render({ canManage: false }).match(/<fieldset disabled=""/g)).toHaveLength(3);
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
    expect(markup).toContain("Cafes, pubs &amp; hospitality");
    expect(markup).toContain("Answer customer questions");
    expect(markup).toContain("Show menus, stories &amp; details");
    expect(markup).toContain("Collect private feedback");
    expect(markup).toContain("Drive bookings &amp; enquiries");
    expect(markup).toContain("Grow a consented email list");
    expect(markup).toContain("Invite honest reviews");
  });
  it("adapts the outcome guidance to hospitality businesses", () => {
    const markup = render({ initialSelection: getStartSelection("?business=hospitality") });
    expect(markup).toContain("For cafes, pubs, restaurants, and hotels");
    expect(markup).toContain("share menus or events");
    expect(markup).toContain("link to bookings");
  });
});
