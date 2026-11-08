import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EggAiAssistant from "./EggAiAssistant";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key, options = {}) => options.defaultValue || key })
}));
describe("Egg assistant previews", () => {
  it("shows the assistant without exposing chat inputs or suggestions", () => {
    const markup = renderToStaticMarkup(createElement(EggAiAssistant, { token: "preview-egg", preview: true, initiallyExpanded: true }));
    expect(markup).toContain("Chat is disabled in this preview");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("<textarea");
  });
});
