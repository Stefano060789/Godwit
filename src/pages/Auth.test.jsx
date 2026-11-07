import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Login from "./Login";
import Register from "./Register";

vi.mock("../lib/supabase", () => ({ supabase: { auth: {} } }));

describe("workspace entry pages", () => {
  it.each([
    [Login, "login", "current-password", "/register"],
    [Register, "register", "new-password", "/login"]
  ])("provides labeled fields and consistent account navigation (%s)", (Page, prefix, passwordAutocomplete, destination) => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(Page))
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
});
