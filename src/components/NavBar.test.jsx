import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import NavBar from "./NavBar";

describe("public navigation", () => {
  it("shows the dashboard link to signed-out visitors and opens the sample dashboard", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", fallbackLng: false, resources: { en: { translation: en } } });
    const markup = renderToStaticMarkup(
      createElement(I18nextProvider, { i18n }, createElement(MemoryRouter, null, createElement(NavBar)))
    );

    expect(markup).toContain('href="/dashboard-demo"');
    expect(markup).toContain(">Dashboard</a>");
  });
});
