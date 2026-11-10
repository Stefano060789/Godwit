import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import de from "../i18n/locales/de.json";
import itLocale from "../i18n/locales/it.json";
import sl from "../i18n/locales/sl.json";
import InteractionUsageNotice from "./InteractionUsageNotice";

const active = {
  state: "active", plan: "standard", base_limit: 500, base_used: 450, interactions_remaining: 50,
  period_start: "2026-11-01T00:00:00Z", period_end: "2026-12-01T00:00:00Z",
  topup_remaining: 0, warning: true, can_topup: true
};

async function renderNotice(usage, resources = en, language = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: resources } } });
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(InteractionUsageNotice, { usage, t: i18n.t.bind(i18n) })));
}

describe("InteractionUsageNotice", () => {
  it("renders nothing before usage is loaded", async () => {
    expect(await renderNotice(null)).toBe("");
  });

  it.each(Object.entries({ en, de, it: itLocale, sl }))("shows warning, usage and explicit billing links in %s", async (language, resources) => {
    const markup = await renderNotice(active, resources, language);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('value="90"');
    expect(markup).toContain('href="/billing"');
    expect(markup).toContain('href="/billing?topup=1"');
    expect(markup).toContain(resources.billing.interactions.warning);
    expect(markup).not.toMatch(/billing\.interactions\./);
    expect(markup).not.toContain("<button");
  });

  it("trusts the backend warning flag when a top-up covers a depleted monthly base", async () => {
    const markup = await renderNotice({ ...active, base_used: 500, warning: false, topup_remaining: 100, interactions_remaining: 100, topup_expires_at: "2026-12-05T00:00:00Z" });
    expect(markup).toContain('role="status"');
    expect(markup).toContain('value="100"');
    expect(markup).toContain("Top-up interactions remaining: 100");
    expect(markup).not.toContain(en.billing.interactions.warning);
    expect(markup).not.toContain('href="/billing?topup=1"');
  });

  it("shows top-up-only warnings even with no monthly base", async () => {
    const markup = await renderNotice({ ...active, base_limit: 0, base_used: 0, topup_remaining: 5, interactions_remaining: 5 });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(en.billing.interactions.warning);
    expect(markup).toContain('href="/billing?topup=1"');
  });

  it.each(["active", "exhausted", "expired"])("offers paid plans, never top-ups, for a %s trial", async (state) => {
    const markup = await renderNotice({ ...active, plan: "trial", state, base_limit: 10, base_used: 9, can_topup: false });
    expect(markup).toContain(en.billing.interactions.trialWarning);
    expect(markup).toContain("Free trial: 9 / 10");
    expect(markup).toContain('href="/billing"');
    expect(markup).not.toContain('href="/billing?topup=1"');
    expect(markup).not.toContain(en.billing.interactions.topupLink);
    expect(markup).not.toContain(en.billing.interactions.states.exhausted);
  });

  it.each(["exhausted", "expired", "inactive"])("explains %s access even without a warning flag", async (state) => {
    const markup = await renderNotice({ ...active, state, warning: false, can_topup: state === "exhausted" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(en.billing.interactions.states[state]);
  });

  it("displays the scheduled next plan without claiming the allowance has reset", async () => {
    const markup = await renderNotice({ ...active, warning: false, next_plan: "small" });
    expect(markup).toContain("Next plan: Small");
    expect(markup).toContain("450 / 500");
  });

  it("explains legacy billing without displaying an invented zero allowance", async () => {
    const markup = await renderNotice({ state: "legacy", plan: "starter" });
    expect(markup).toContain(en.billing.interactions.legacy);
    expect(markup).not.toContain("<progress");
  });

  it("shows unavailable usage and explicit load errors", async () => {
    const markup = await renderNotice({ state: "unavailable", error: "RPC unavailable" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(en.billing.interactions.usageUnavailable);
    expect(markup).toContain("RPC unavailable");
    expect(markup).not.toContain("<progress");
  });
});
