import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import EggAiAssistant, { buildGuidedPrompts } from "./EggAiAssistant";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key, options = {}) => options.defaultValue || key })
}));
describe("Egg assistant previews", () => {
  it("allows interactive chat in preview and explains that test messages use the Egg allowance", () => {
    const markup = renderToStaticMarkup(createElement(EggAiAssistant, { token: "preview-egg", preview: true, initiallyExpanded: true }));
    expect(markup).toContain("previewHint");
    expect(markup).toContain("qr-portal-ai-assistant");
    expect(markup).toContain("qr-portal-ai-input");
    expect(markup).toContain("<form");
    expect(markup).toContain("<textarea");
    expect(markup).not.toContain("bg-violet-950");
    expect(markup).not.toContain("text-white");
  });

  it("keeps goal and topic quick starts concise", () => {
    const prompts = buildGuidedPrompts(["feedback"], ["service", "quality", "atmosphere"], (key) => key);
    expect(prompts).toHaveLength(2);
    expect(prompts.map(({ id }) => id)).toEqual(["sharePreference", "topic-service"]);
  });

  it("provides useful quick starts when no goal is set", () => {
    const prompts = buildGuidedPrompts([], [], (key) => key);
    expect(prompts.map(({ id }) => id)).toEqual(["askQuestion", "findInformation"]);
  });
});
