import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";
import Landing from "./Landing";
import { FLOCK } from "../lib/flock";
import ar from "../i18n/locales/ar.json";
import de from "../i18n/locales/de.json";
import en from "../i18n/locales/en.json";
import es from "../i18n/locales/es.json";
import fr from "../i18n/locales/fr.json";
import itLocale from "../i18n/locales/it.json";
import pt from "../i18n/locales/pt.json";
import sl from "../i18n/locales/sl.json";
import zh from "../i18n/locales/zh.json";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      onAuthStateChange: vi.fn()
    }
  }
}));

const locales = { ar, de, en, es, fr, it: itLocale, pt, sl, zh };
const paymentPromotion = /donat|spend|zahlung|paiement|contribut|gorjeta|venue.support|support payment|support payments|دعم مالي|تبرع|捐赠|捐款|prispevek|plačilo/i;

describe("public landing donation messaging", () => {
  it.each(Object.entries(locales))("does not render donation promotions when disabled (%s)", async (language, translations) => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({
      lng: language,
      fallbackLng: "en",
      resources: {
        en: { translation: en },
        [language]: { translation: translations }
      },
      interpolation: { escapeValue: false }
    });

    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(Landing))
      )
    );
    const renderedCopy = markup.replaceAll("&#x27;", "'");

    expect(renderedCopy).not.toMatch(paymentPromotion);
    expect(renderedCopy).not.toContain(i18n.t("landing.steps.step1DetailWithDonations"));
    expect(renderedCopy).not.toContain(i18n.t("landing.flock.magpieDetailWithDonations"));
    expect(renderedCopy).not.toContain(i18n.t("landing.flock.waxwingDetailWithDonations"));
    expect(renderedCopy).toContain(i18n.t("landing.steps.step1Detail"));
    expect(renderedCopy).toContain(i18n.t("landing.flock.magpieDetail"));
    expect(renderedCopy).toContain(i18n.t("landing.flock.waxwingDetail"));
  });

  it("keeps the Magpie flock description free of payment promotion while disabled", () => {
    const magpie = FLOCK.find((bird) => bird.key === "magpie");

    expect(magpie.detail).not.toMatch(paymentPromotion);
    expect(magpie.detail).toContain("polls");
    expect(magpie.detail).toContain("prize draws");
  });
});
