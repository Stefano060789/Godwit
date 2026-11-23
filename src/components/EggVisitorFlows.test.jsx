// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EggGuide from "./EggGuide";
import IssueReportForm from "./IssueReportForm";
import BusinessData from "./BusinessData";
import BusinessResearch from "./BusinessResearch";
import EggResults from "./EggResults";
import { supabase } from "../lib/supabase";
import en from "../i18n/locales/en.json";

vi.mock("../lib/supabase", () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(), auth: { getSession: vi.fn(), getUser: vi.fn() } }
}));
const translate = (key, options = {}) => key.split(".").reduce((value, part) => value?.[part], en) || options.defaultValue || key;
vi.mock("react-i18next", () => ({
  useTranslation: (_namespace, options = {}) => ({
    t: (key, values) => translate(options.keyPrefix ? `${options.keyPrefix}.${key}` : key, values)
  })
}));

let host;
let root;
const branding = { primaryColor: "#31565d", brandName: "Example Pub" };
const sessionId = "38dfeb63-639c-4c17-8882-7a82da0e84cc";
const menu = {
  portalTitle: "Welcome", branding, campaignId: 42, trialSessionId: sessionId,
  items: [{ item_id: 7, item_type: "info", title: "Menu", body: "Today's supplied menu" }],
  aiEnabled: true
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const button = (text) => [...host.querySelectorAll("button")].find((entry) => entry.textContent.includes(text));
const render = async (component, props) => { await act(async () => root.render(createElement(component, props))); };
const click = async (element) => { expect(element).toBeTruthy(); await act(async () => element.click()); };
async function fill(element, value) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = async (form) => { await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); };

beforeEach(() => {
  vi.resetAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "synthetic-token" } }, error: null });
  supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

describe("Egg visitor interactions", () => {
  it("shows unavailable AI settings instead of leaving the guide blank", async () => {
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 503)));
    await render(EggGuide, { token: "example-egg", menu, goalKeys: ["preferences"] });
    await click(button("Ask a question"));
    expect(host.querySelector('[role="alert"]').textContent).toContain("AI guide is unavailable");
    expect(logging).toHaveBeenCalled();
    await click(button("Back"));
    expect(button("Ask a question")).toBeTruthy();
  });

  it("supports multi-select AI polls, a second poll and optional continuation after voting", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ insert });
    supabase.rpc.mockImplementation((_name, body) => ({
      single: async () => ({ data: {
        id: body.target_poll_id, question: body.target_poll_id === 91 ? "Which menu choices?" : "Which event?",
        answers: ["One", "Two", "Three"], multiple_choice: body.target_poll_id === 91
      }, error: null })
    }));
    let chats = 0;
    const fetchMock = vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.action === "config") return json({ enabled: true, goalKeys: ["preferences"], feedbackTopics: [] });
      chats++;
      return json(chats === 1 ? {
        answer: "Which choices would you like?", poll: { id: 91, question: "Which menu choices?", answers: ["One", "Two", "Three"], multipleChoice: true }
      } : {
        answer: "Those preferences help. Which event interests you?",
        poll: { id: 92, question: "Which event?", answers: ["One", "Two", "Three"], multipleChoice: false },
        followUps: [{ label: "Explore event details", message: "What do you offer for these events?" }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await render(EggGuide, { token: "example-egg", menu, goalKeys: ["preferences"] });
    await click(button("Ask a question"));
    await fill(host.querySelector("#egg-ai-question"), "I would enjoy more menu choices.");
    await submit(host.querySelector(".qr-portal-ai-form"));
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    await click(host.querySelectorAll('input[type="checkbox"]')[0]);
    await click(host.querySelectorAll('input[type="checkbox"]')[1]);
    clock.mockReturnValue(1000);
    await click(button("Submit"));
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ poll_id: 91, answer: "One" }),
      expect.objectContaining({ poll_id: 91, answer: "Two" })
    ]);
    expect(chats).toBe(1);
    expect(button("Continue with AI")).toBeTruthy();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    await click(button("Continue with AI"));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).pollResponse).toEqual({ pollId: 91, answers: ["One", "Two"] });
    expect(chats).toBe(2);
    expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    await click(host.querySelectorAll('input[type="radio"]')[0]);
    await click(host.querySelectorAll('input[type="radio"]')[1]);
    expect(host.querySelectorAll('input[type="radio"]:checked')).toHaveLength(1);
    await click(button("Explore event details"));
    expect(chats).toBe(3);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).sharedPollResponses).toEqual([{ pollId: 91, answers: ["One", "Two"] }]);
    await click(button("I'm done"));
    expect(host.textContent).toContain("Everything is optional");
  });

  it("continues a published poll only after the visitor explicitly shares choices with AI", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    supabase.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
    supabase.rpc.mockReturnValue({ single: async () => ({ data: { question: "What interests you?", answers: ["Art", "Music"], multiple_choice: false }, error: null }) });
    const fetchMock = vi.fn(async (_url, options) => JSON.parse(options.body).action === "config"
      ? json({ enabled: true, goalKeys: ["feedback"], feedbackTopics: [] })
      : json({ answer: "Here is the supplied artist story.", followUps: [{ label: "Explore the story", message: "Tell me more about the artist." }] }));
    vi.stubGlobal("fetch", fetchMock);
    await render(EggGuide, { token: "example-egg", menu: { ...menu, items: [{ item_id: 9, item_type: "poll", poll_id: 101, campaign_id: 42, trial_session_id: sessionId }] }, goalKeys: ["feedback"] });
    await click(button("Give quick feedback"));
    await click(host.querySelector('input[type="radio"]'));
    clock.mockReturnValue(1000);
    await click(button("Submit"));
    expect(fetchMock).not.toHaveBeenCalled();
    await click(button("Continue with AI"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).pollResponse).toEqual({ pollId: 101, answers: ["Art"] });
    expect(button("Explore the story")).toBeTruthy();
    expect(host.textContent).not.toContain("seeGodwitFeatures");
  });
  it("opens private feedback without AI and completes it only after submission succeeds", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: false, error: { message: "Synthetic storage failure" } })
      .mockResolvedValueOnce({ data: true, error: null });
    await render(EggGuide, { token: "example-egg", menu: { ...menu, aiEnabled: false }, goalKeys: ["reviews"] });
    await click(button("Share your experience"));
    expect(host.querySelector(".qr-portal-ai-form")).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    await click(button("What could be better?"));
    expect(button("Send private feedback").disabled).toBe(true);
    await fill(host.querySelector("textarea"), "One thing that could be better: clearer opening hours.");
    await submit(host.querySelector("form"));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await submit(host.querySelector("form"));
    expect(host.querySelector('[role="status"]').textContent).toContain("sent to the business");
    expect(supabase.rpc).toHaveBeenLastCalledWith("submit_egg_review_feedback", {
      target_campaign_id: 42, target_session_id: sessionId, review_feedback: "One thing that could be better: clearer opening hours."
    });
  });

  it("offers editable issue templates, preserves written details and submits the selected category", async () => {
    const onSubmitted = vi.fn();
    supabase.rpc.mockReturnValue({ single: async () => ({ data: { issue_id: 1, notification_token: "synthetic" }, error: null }) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ notified: true })));
    await render(IssueReportForm, { campaignId: 42, branding, onSubmitted });
    await click(button("Something needs cleaning"));
    expect(host.querySelector("select").value).toBe("cleanliness");
    expect(host.querySelector("textarea").value).toContain("Where it is");
    expect(button("Send issue report").disabled).toBe(true);
    await click(button("Service or order problem"));
    expect(host.querySelector("textarea").value).toContain("I need help with my order");
    expect(button("Send issue report").disabled).toBe(true);
    const details = "Something needs cleaning. Where it is: a spill near the entrance.";
    await fill(host.querySelector("textarea"), details);
    await click(button("Access is difficult"));
    expect(host.querySelector("textarea").value).toBe(details);
    expect(host.querySelector("select").value).toBe("accessibility");
    await submit(host.querySelector("form"));
    expect(supabase.rpc).toHaveBeenCalledWith("report_egg_issue", expect.objectContaining({
      target_campaign_id: 42, issue_category: "accessibility", issue_description: details
    }));
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("sent to the business");
  });

  it("renders validated business links and opens suggested cards inside the guide", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => JSON.parse(options.body).action === "config"
      ? json({ enabled: true, goalKeys: ["information"], feedbackTopics: [] })
      : json({
        answer: "We open at 17:00. Here is our supplied menu link.",
        businessLinks: [{ title: "Instagram", url: "https://www.instagram.com/example" }, { title: "Menu", url: "https://example.org/menu" }, { title: "Unsafe", url: "javascript:alert(1)" }],
        suggestions: [{ id: "7", type: "info", title: "Menu" }]
      })));
    await render(EggGuide, { token: "example-egg", menu, goalKeys: ["information"] });
    await click(button("Ask a question"));
    await fill(host.querySelector("#egg-ai-question"), "Where is the menu?");
    await submit(host.querySelector(".qr-portal-ai-form"));
    const links = [...host.querySelectorAll('a[target="_blank"]')];
    expect(links.map((link) => link.href)).toEqual(["https://www.instagram.com/example", "https://example.org/menu"]);
    expect(links.every((link) => link.rel.includes("noreferrer"))).toBe(true);
    const suggestion = host.querySelector('a[href="#egg-option-7"]');
    await click(suggestion);
    expect(host.textContent).toContain("Today's supplied menu");
    expect(host.querySelector("#egg-ai-question").closest("[hidden]")).not.toBeNull();
    await click(button("Back"));
    await click(button("Ask a question"));
    expect(host.textContent).toContain("We open at 17:00");
  });

  it("opens suggested offers and issue reporting without requiring another AI call", async () => {
    let count = 0;
    const fetchMock = vi.fn(async (_url, options) => {
      if (JSON.parse(options.body).action === "config") return json({ enabled: true });
      count++;
      return json({ answer: "Here is an option.", suggestions: count === 1
        ? [{ id: "8", type: "reward", title: "Today's offer" }]
        : [{ id: "guide:report", type: "report", title: "Report an issue" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const items = [...menu.items, { item_id: 8, item_type: "reward", title: "Today's offer", body: "A supplied offer" }];
    await render(EggGuide, { token: "example-egg", menu: { ...menu, items }, goalKeys: ["promotion"] });
    await click(button("Ask a question"));
    await fill(host.querySelector("#egg-ai-question"), "What is available?");
    await submit(host.querySelector(".qr-portal-ai-form"));
    await click(host.querySelector('a[href="#egg-option-8"]'));
    expect(host.textContent).toContain("A supplied offer");
    await click(button("Back"));
    await click(button("Ask a question"));
    await fill(host.querySelector("#egg-ai-question"), "There is a problem");
    await submit(host.querySelector(".qr-portal-ai-form"));
    await click(host.querySelector('a[href="#egg-option-guide%3Areport"]'));
    expect(host.querySelector(".issue-report-form")).toBeTruthy();
    expect(count).toBe(2);
  });

  it("offers a blank business template without overwriting written notes", async () => {
    supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) });
    await render(BusinessData, { workspaceId: "workspace", canManage: true, t: translate });
    await click(button("Start with a visitor information template"));
    const notes = host.querySelector("textarea");
    expect(notes.value).toContain("Address:");
    expect(notes.value).toContain("Opening hours");
    expect(button("Start with a visitor information template").disabled).toBe(true);
    await fill(notes, "Verified opening hours: Monday 9–12.");
    expect(notes.value).toContain("Monday 9–12");
  });

  it("shows scoped existing activity without implying clicks or selections are sales or voters", async () => {
    const feedbackQuery = vi.fn(async () => ({ data: [{ id: 1, feedback: "Clearer opening hours would help." }], error: null }));
    const feedbackOrder = vi.fn(() => ({ limit: feedbackQuery }));
    const feedbackEq = vi.fn(() => ({ order: feedbackOrder }));
    supabase.from.mockReturnValue({ select: () => ({ eq: feedbackEq }) });
    supabase.rpc.mockImplementation(async (name) => name === "get_workspace_primary_goal_progress"
      ? { data: [
        { campaign_id: 42, metric: "responses", event_count: 3 },
        { campaign_id: 42, metric: "promotion_clicks", event_count: 2 },
        { campaign_id: 99, metric: "responses", event_count: 50 }
      ], error: null }
      : { data: [{ campaign_id: 42, message_count: 0, latest_messages: [] }], error: null });
    await render(EggResults, { campaigns: [{ id: 42, name: "Pub" }], canViewMessages: true, onOpenEgg: vi.fn(), t: translate });
    expect(host.textContent).toContain("Poll answer selections: 3");
    expect(host.textContent).toContain("Promotion link clicks: 2");
    expect(host.textContent).toContain("Issue reports: 0");
    expect(feedbackEq).toHaveBeenCalledWith("campaign_id", 42);
    expect(host.textContent).toContain("Clearer opening hours would help.");
    expect(host.textContent).not.toContain("53");
    expect(host.textContent).toContain("do not confirm bookings or sales");
  });

  it("allows saving a clickable website link after content import is blocked", async () => {
    const sources = [];
    const insert = vi.fn(async (source) => { sources.push({ id: 1, ...source }); return { error: null }; });
    supabase.from.mockReturnValue({
      select: () => ({ eq: () => ({ order: async () => ({ data: [...sources], error: null }) }) }), insert
    });
    const fetchMock = vi.fn().mockResolvedValue(json({ error: "The website denied access to the importer." }, 422));
    vi.stubGlobal("fetch", fetchMock);
    await render(BusinessData, { workspaceId: "11111111-1111-4111-8111-111111111111", canManage: true, t: translate });
    const website = host.querySelector('input[placeholder="https://example.com"]');
    await fill(website, "https://example.org/menu");
    await submit(website.closest("form"));
    expect(host.querySelector('[role="alert"]').textContent).toContain("denied access");
    await click(button("Save link without importing"));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ source_url: "https://example.org/menu", source_type: "website" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".business-data-source a").href).toBe("https://example.org/menu");
  });

  it("keeps Google research consent-based, manager-only and unsaved, with clearable attribution", async () => {
    const text = "Example Pub opens at 17:00.\nCheck special dates.";
    const html = '<a target="_blank" href="https://www.google.com/search?q=Example">Example Pub</a>';
    const fetchMock = vi.fn().mockResolvedValue(json({
      text, researchedAt: "2026-11-23T00:00:00Z",
      citations: [{ url: "https://example.org", title: "Official information" }], searchSuggestions: [html]
    }));
    vi.stubGlobal("fetch", fetchMock);
    await render(BusinessResearch, { workspaceId: "11111111-1111-4111-8111-111111111111", t: translate });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(button("Research with Google").disabled).toBe(true);
    await fill(host.querySelector('input:not([type="checkbox"])'), "Villach");
    await click(host.querySelector('input[type="checkbox"]'));
    await submit(host.querySelector("form"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "research-workspace", workspaceId: "11111111-1111-4111-8111-111111111111", location: "Villach", topic: "practical", artwork: "", consent: true
    });
    expect(host.querySelector(".business-research-text").textContent).toBe(text);
    expect(host.querySelector("iframe").getAttribute("srcdoc")).toBe(html);
    expect(host.querySelector("iframe").getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(supabase.from).not.toHaveBeenCalled();
    await click(button("Clear research result"));
    expect(host.querySelector(".business-research-result")).toBeNull();
  });
});
