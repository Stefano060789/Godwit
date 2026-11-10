import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";
import DashboardDemo from "./DashboardDemo";

const locales = {
  en: { resources: en, sampleBadge: "Illustrative sample data" },
  de: { resources: de, sampleBadge: "Beispieldaten" },
  it: { resources: itLocale, sampleBadge: "Dati dimostrativi" },
  sl: { resources: sl, sampleBadge: "Vzorčni podatki" }
};

describe("public dashboard demo", () => {
  it.each(Object.entries(locales))("shows a clearly marked, read-only sample dashboard in %s", async (language, locale) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: locale.resources } } });
    const markup = renderToStaticMarkup(
      createElement(
        I18nextProvider,
        { i18n },
        createElement(MemoryRouter, null, createElement(DashboardDemo))
      )
    );

    expect(markup).toContain(locale.sampleBadge);
    expect(markup).toContain(`aria-label="${locale.resources.dashboardDemo.tabsLabel}"`);
    expect(markup).toContain('href="/register"');
    expect(markup).not.toContain("<input");
  });
});
