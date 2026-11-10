import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";
import Login from "./Login";
import Register from "./Register";
import en from "../i18n/locales/en.json";

vi.mock("../lib/supabase", () => ({ supabase: { auth: {} } }));

describe("workspace entry pages", () => {
  it.each([
    [Login, "login", "current-password", "/register"],
    [Register, "register", "new-password", "/login"]
  ])("provides labeled fields and consistent account navigation (%s)", async (Page, prefix, passwordAutocomplete, destination) => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", fallbackLng: false, resources: { en: { translation: en } } });
    const markup = renderToStaticMarkup(
      createElement(I18nextProvider, { i18n }, createElement(MemoryRouter, null, createElement(Page)))
    );
    expect(markup).toContain("auth-page");
    expect(markup).toContain(`for="${prefix}-email"`);
    expect(markup).toContain(`id="${prefix}-email"`);
    expect(markup).toContain(`for="${prefix}-password"`);
    expect(markup).toContain(`id="${prefix}-password"`);
    expect(markup).toContain('autoComplete="email"');
    expect(markup).toContain(`autoComplete="${passwordAutocomplete}"`);
    expect(markup).toContain('class="auth-primary"');
    expect(markup).toContain(`href="${destination}"`);
  });

  it("uses account-focused wording on login and offers the free trial during registration", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", fallbackLng: false, resources: { en: { translation: en } } });
    const login = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(MemoryRouter, null, createElement(Login))));
    const register = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(MemoryRouter, null, createElement(Register))));
    expect(login).toContain("Sign in to Godwit");
    expect(login).toContain("Create a Godwit account");
    expect(login).not.toContain("Sign in to your workspace");
    expect(register).toContain("Try Godwit free for one month");
    expect(register).toContain("10 customer Egg sessions");
  });
});
