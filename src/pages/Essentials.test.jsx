import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";
import { SUPPORTED_LANGUAGES } from "../i18n/languages";
import Essentials from "./Essentials";
import { START_GOALS, buildStartLink } from "../lib/startGuide";

const locales = { en, de, it: itLocale, sl };

async function renderGuide(entry = "/essentials") {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false }
  });
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Essentials))
    )
  ).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
}

describe("goal-led quick start", () => {
  it("offers five business groups and clear customer goals without requiring a category", async () => {
    const markup = await renderGuide();
    expect(markup).toContain("Arts and culture");
    expect(markup).toContain("Cafes, pubs & hospitality");
    expect(markup).toContain("Tourism and places");
    expect(markup).toContain("Events and communities");
    expect(markup).toContain("Shops and services");
    START_GOALS.forEach((goal) => expect(markup).toContain(en.quickStart.goals[goal.key].title));
    expect(markup).toContain(en.quickStart.chooseHint);
    expect(markup).toContain("Optional");
  });

  it.each(START_GOALS)("restores the $key selection and keeps context when continuing", async (goal) => {
    const markup = await renderGuide(`/essentials?business=arts&goal=${goal.key}`);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(en.quickStart.goals[goal.key].setup);
    expect(markup).toContain(en.quickStart.goals[goal.key].result);
    expect(markup).toContain(en.quickStart.shareStep);
    expect(markup).toContain(`href="${buildStartLink(goal.key, "arts")}"`);
    expect(markup).not.toContain("quickStart.");
  });

  it("keeps email consent and public review incentives separate", async () => {
    const markup = await renderGuide("/essentials?goal=contacts");
    expect(markup).toContain(en.quickStart.benefitNote);
    expect(markup).toContain(en.quickStart.planAvailability);
    expect(markup).toContain("People can vote without sharing their email.");
  });

  it("recovers from unknown URL selections with a usable chooser", async () => {
    const markup = await renderGuide("/essentials?goal=bad&business=bad");
    expect(markup).toContain(en.quickStart.chooseHint);
    expect(markup).not.toContain('aria-pressed="true"');
  });

  it.each(SUPPORTED_LANGUAGES)("provides complete quick-start copy in $code", async ({ code }) => {
    const i18n = createInstance();
    await i18n.init({ lng: code, fallbackLng: false, resources: { [code]: { translation: locales[code] } } });
    for (const key of Object.keys(en.quickStart).filter((key) => typeof en.quickStart[key] === "string")) {
      expect(i18n.exists(`quickStart.${key}`)).toBe(true);
    }
    for (const goal of START_GOALS) {
      for (const key of ["title", "example", "setup", "result"]) {
        expect(i18n.exists(`quickStart.goals.${goal.key}.${key}`)).toBe(true);
      }
    }
  });
});
