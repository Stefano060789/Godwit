import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import EggConnections from "./EggConnections";

const translations = {
  "admin.engagement.items.sectionPolls": "Polls",
  "admin.engagement.items.addPollOption": "Choose a poll",
  "admin.engagement.items.addPoll": "Add poll",
  "admin.engagement.items.remove": "Remove",
  "admin.engagement.scanner.createNewPoll": "Create poll",
  "admin.engagement.wizard.addTask": "Add action",
  "admin.engagement.wizard.taskTitle": "Action title",
  "woodpecker.create": "Create action",
  "woodpecker.openPortal": "Open Action portal"
};
const t = (key, options = {}) => translations[key] || options.defaultValue || `Poll #${options.id}`;
const campaign = { id: 12, token: "egg-token", poll_id: 1 };
const polls = [{ id: 1, question: "Default question" }, { id: 2, question: "Item question" }, { id: 3, question: "Unlinked question" }];
const tasks = [
  { id: 4, title: "Linked action", status: "open", woodpecker_task_campaigns: [{ campaign_id: 12 }] },
  { id: 5, title: "Other action", status: "open", woodpecker_task_campaigns: [{ campaign_id: 99 }] }
];

function render(overrides = {}) {
  const props = {
    campaign, polls, items: [{ id: 7, item_type: "poll", poll_id: 2 }], tasks,
    tasksError: "", canManage: true, t,
    onOpenPoll: vi.fn(), onAddPoll: vi.fn(), onRemoveItem: vi.fn(),
    onAttachAction: vi.fn(), onCreateAction: vi.fn(), onOpenActions: vi.fn(),
    ...overrides
  };
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(EggConnections, props)));
}

describe("Egg connections", () => {
  it("shows actual linked poll items and task links, and warns about fallback visibility", () => {
    const markup = render();
    expect(markup).toContain("Default question");
    expect(markup).toContain("Item question");
    expect(markup).toContain("Linked action");
    expect(markup).toContain("default poll is a fallback");
    expect(markup).toContain("single-poll Egg may open the poll directly");
    expect(markup).toContain('href="/qr/egg-token/tasks"');
    expect(markup).toContain('value="1"');
    expect(markup).not.toContain('value="2"');
    expect(markup).toContain('value="5"');
    expect(markup).not.toContain('value="4"');
  });

  it("does not offer mutation controls to viewers", () => {
    const markup = render({ canManage: false });
    expect(markup).toContain("Linked action");
    expect(markup).not.toContain("Choose a poll");
    expect(markup).not.toContain("Create action");
    expect(markup).not.toContain(">Remove</button>");
  });

  it("reports failed action loading instead of presenting an empty list", () => {
    const markup = render({ tasks: [], tasksError: "Database unavailable" });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Database unavailable");
    expect(markup).not.toContain("No actions connected yet");
  });

  it("shows empty connections and allows creating a poll without changing the default", () => {
    const markup = render({ campaign: { id: 12, token: "egg-token", poll_id: null }, items: [], tasks: [] });
    expect(markup).toContain("No polls connected yet");
    expect(markup).toContain("No actions connected yet");
    expect(markup).toContain('href="/create"');
    expect(markup).not.toContain("/create?campaign=");
  });
  it("keeps poll management out of AI-managed Eggs", () => {
    const markup = render({ isAiManaged: true });
    expect(markup).toContain("AI-managed feedback");
    expect(markup).not.toContain("Default question");
    expect(markup).not.toContain("Item question");
    expect(markup).not.toContain("Choose a poll");
    expect(markup).not.toContain('href="/create"');
    expect(markup).not.toContain(">Remove</button>");
  });
});
