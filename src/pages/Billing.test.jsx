import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";
import Billing from "./Billing";

vi.mock("../components/Layout", () => ({ default: ({ children }) => children }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));

async function renderBilling(language, resources, path = "/billing") {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: resources } } });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(Billing))));
}

describe("interaction billing", () => {
  it.each(Object.entries({ en, de, it: itLocale, sl }))("shows purchasable prices, VAT, top-ups and terms in %s", async (language, resources) => {
    const markup = await renderBilling(language, resources);
    expect(markup.match(/<h3 /g)).toHaveLength(4);
    for (const key of ["small", "standard", "scale", "regional"]) {
      expect(markup).toContain(resources.billing.proposed.tiers[key]);
      expect(resources.billing.proposed.useCases[key]).toBeTruthy();
    }
    for (const price of [7, 9, 29, 79, 249]) {
      expect(markup).toContain(new Intl.NumberFormat(language, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(price));
    }
    expect(markup).toContain((10000).toLocaleString(language));
    expect(markup).toContain('href="/register"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain(resources.billing.interactions.vat);
    expect(markup).toContain(resources.billing.interactions.availability);
    expect(markup).toContain(resources.billing.interactions.topupBody);
    expect(markup).toContain(resources.billing.interactions.refunds);
    expect(markup).not.toContain(resources.billing.proposed.notice);
    expect(markup).not.toMatch(/billing\.(proposed|interactions)\./);
    expect(resources.billing.interactions.trialInfo).toMatch(/\b10\b/);
    expect(resources.billing.interactions.trialInfo).toMatch(/\b30\b/);
    expect(resources.billing.interactions.countingBody).not.toContain("workspace");
    expect(resources.billing.interactions.planChanges).not.toContain("shown in your usage summary");
    expect(resources.trial.signupBody).not.toMatch(/\b100\b/);
    expect(resources.trial.signupBody).toMatch(/\b10\b/);
  });

  it("highlights top-up links without automatically starting a purchase", async () => {
    const markup = await renderBilling("en", en, "/billing?topup=1");
    expect(markup).toMatch(/id="topup"[^>]*ring-2/);
    expect(markup).toContain(en.billing.interactions.buyTopup);
    expect(markup).not.toContain("Opening billing");
    expect(markup).toMatch(/disabled=""[^>]*>Buy 100 extra interactions/);
  });
  it("keeps account-management controls in Settings and uses non-green purchase buttons", async () => {
    const markup = await renderBilling("en", en);
    expect(markup).not.toContain(en.billing.interactions.refresh);
    expect(markup).not.toContain(en.billing.interactions.manage);
    expect(markup).toContain("billing-purchase-action");
    expect(markup).not.toContain("bg-teal-800");
  });

  it("does not claim that a return URL confirms payment", async () => {
    const markup = await renderBilling("en", en, "/billing?checkout=success");
    expect(markup).toContain(en.billing.interactions.returned);
    expect(markup).not.toContain(en.billing.checkoutSuccess);
  });

  it("explains cancelled checkout using the backend return URL", async () => {
    expect(await renderBilling("en", en, "/billing?checkout=cancelled")).toContain(en.billing.checkoutCancelled);
  });

  it.each(["success=1", "canceled=1", "cancelled=1"])("does not interpret obsolete return parameters (%s)", async (parameters) => {
    const markup = await renderBilling("en", en, `/billing?${parameters}`);
    expect(markup).not.toContain(en.billing.interactions.returned);
    expect(markup).not.toContain(en.billing.checkoutCancelled);
  });
});
