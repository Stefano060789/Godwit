import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QrRedirect from "./QrRedirect";
import Vote from "./Vote";
import ThankYou from "./ThankYou";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key, options) => options?.defaultValue || key }) }));

describe("visitor preview return navigation", () => {
  beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));
  afterEach(() => vi.unstubAllGlobals());
  const render = path => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null, createElement(Route, { path: "/qr/:token", element: createElement(QrRedirect) }))));
  it("keeps a dashboard return visible while the visitor preview loads", () => {
    const html = render("/qr/example?preview=1");
    expect(html).toContain("Visitor preview");
    expect(html).toContain('href="/admin?tab=engagement"');
    expect(html).toContain("Back to Godwit");
    expect(html).toContain("Opening feedback...");
  });
  it("does not show staff navigation on ordinary customer scans", () => {
    expect(render("/qr/example?via=qr")).not.toContain("egg-preview-bar");
  });
  it.each([
    ["/vote/1", Vote],
    ["/thanks", ThankYou]
  ])("retains the return control on %s only in preview mode", (path, Component) => {
    const renderPage = suffix => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path + suffix] },
      createElement(Component)));
    expect(renderPage("?preview=1")).toContain('href="/admin?tab=engagement"');
    expect(renderPage("")).not.toContain("egg-preview-bar");
  });
});
