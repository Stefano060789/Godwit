import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import EggRecognizer from "./EggRecognizer";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";

afterEach(() => vi.unstubAllGlobals());
async function render(resources = en, language = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: resources } } });
  return renderToStaticMarkup(createElement(EggRecognizer, { t: i18n.t.bind(i18n), onRecognize: vi.fn(), onOpenCamera: vi.fn() }));
}
describe("Recognize your Egg", () => {
  it.each(Object.entries({ en, de, it: itLocale, sl }))("offers a labelled pasted link, camera and NFC with fallback instructions in %s", async (language, resources) => {
    const markup = await render(resources, language);
    const strings = resources.admin.engagement.scanner;
    for (const key of ["linkLabel", "lookUp", "openCamera", "readNfc", "nfcUnsupported"]) {
      expect(markup).toContain(renderToStaticMarkup(createElement("span", null, strings[key])).slice(6, -7));
    }
    expect(markup).toContain('for="egg-recognition-link"');
    expect(markup).not.toContain("admin.engagement.scanner.");
    expect(strings.title).not.toBe("Manage an Egg");
    expect(markup).toMatch(/disabled=""[^>]*>Recognize with NFC|disabled=""[^>]*>(Mit NFC erkennen|Riconosci con NFC|Prepoznaj z NFC)/);
  });
  it("enables direct NFC only in a compatible secure browser", async () => {
    vi.stubGlobal("window", { isSecureContext: true, NDEFReader: class {} });
    expect(await render()).not.toMatch(/disabled=""[^>]*>Recognize with NFC/);
    expect(await render()).not.toContain(en.admin.engagement.scanner.nfcUnsupported);
    vi.stubGlobal("window", { isSecureContext: false, NDEFReader: class {} });
    expect(await render()).toMatch(/disabled=""[^>]*>Recognize with NFC/);
  });
});
