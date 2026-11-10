import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
import BillingSettings from "./BillingSettings";
import useInteractionBilling from "../lib/useInteractionBilling";

vi.mock("../lib/useInteractionBilling", () => ({ default: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: key => key.split(".").reduce((value, part) => value?.[part], en) || key })
}));
const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(BillingSettings)));
beforeEach(() => {
  useInteractionBilling.mockReturnValue({
    billing: { membership: { role: "owner" } }, owner: true,
    usage: { state: "active", plan: "small", can_topup: true },
    disabled: false, canManage: true, canTopup: true, loading: false, error: "", pending: "",
    refresh: vi.fn(), checkout: vi.fn()
  });
});
describe("billing in Settings", () => {
  it("shows refresh, subscription management and the one-time pack", () => {
    const markup = render();
    for (const key of ["refresh", "manage", "buyTopup", "topupBody"]) {
      expect(markup).toContain(en.billing.interactions[key]);
    }
    expect(markup).toContain('href="/billing"');
    expect(markup).not.toContain('disabled=""');
  });
  it("does not offer paid purchases for complimentary access", () => {
    useInteractionBilling.mockReturnValue({
      ...useInteractionBilling(), usage: { state: "complimentary", plan: "creator" },
      canTopup: false, canManage: false
    });
    const markup = render();
    expect(markup).toContain(en.billing.interactions.creatorTitle);
    expect(markup).toMatch(/disabled=""[^>]*>Buy 100 extra interactions/);
    expect(markup).not.toContain(en.billing.interactions.manage);
    expect(markup).not.toContain(en.billing.interactions.legacy);
  });
  it("keeps account actions disabled and explains owner-only access for members", () => {
    useInteractionBilling.mockReturnValue({
      ...useInteractionBilling(), owner: false, disabled: true, canManage: false
    });
    const markup = render();
    expect(markup).toContain(en.billing.interactions.ownerOnly);
    expect(markup).not.toContain(en.billing.interactions.manage);
    expect(markup).toMatch(/disabled=""[^>]*>Buy 100 extra interactions/);
  });
  it("surfaces billing failures", () => {
    useInteractionBilling.mockReturnValue({ ...useInteractionBilling(), error: "Network unavailable" });
    expect(render()).toContain('role="alert"');
  });
});
