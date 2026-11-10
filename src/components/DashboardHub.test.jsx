import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { describe, expect, it, vi } from "vitest";
import DashboardHub from "./DashboardHub";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";

const locales = { en, de, it: itLocale, sl };
describe("Egg dashboard hub", () => {
  it("places inputs left, the Egg in the center, results right and settings below", () => {
    const t = (key, options) => options?.defaultValue || key;
    const markup = renderToStaticMarkup(createElement(DashboardHub, { activeTab: "engagement", onSelect: vi.fn(), t }));
    expect(markup.indexOf("Your Business")).toBeLessThan(markup.indexOf("Business Data"));
    expect(markup).toContain("Business Data");
    expect(markup).toContain("dashboard-hub-your-business");
    expect(markup).toContain("Goal");
    expect(markup).toContain('class="dashboard-hub-egg" aria-current="page"');
    expect(markup).toContain("dashboard-hub-results");
    expect(markup).toContain("dashboard-hub-settings");
    expect(markup).toContain("dashboard-hub-outputs");
    expect(markup.match(/class="dashboard-hub-connector"/g)).toHaveLength(2);
    expect(markup.match(/<button /g)).toHaveLength(7);
    expect(markup).toContain(">QR<");
    expect(markup).toContain(">NFC<");
    expect(markup).not.toContain("Workspace");
    expect(markup).not.toContain("Overview");
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it.each(["en", "de", "it", "sl"])("localizes new dashboard pages in %s", async (language) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: locales[language] } } });
    for (const section of ["hub", "goalProgress", "goal", "businessProfile", "businessData", "eggList", "eggResults", "nfc"]) {
      for (const key of Object.keys(en.admin[section])) {
        expect(i18n.exists(`admin.${section}.${key}`)).toBe(true);
      }
    }
    for (const tab of ["your-business", "business", "goal", "results", "goal-progress"]) {
      expect(i18n.exists(`admin.hub.descriptions.${tab}`)).toBe(true);
    }
  });
});
