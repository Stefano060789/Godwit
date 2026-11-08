import { beforeEach, describe, expect, it, vi } from "vitest";

const { addQrCampaignPollItem, from, query } = vi.hoisted(() => ({
  addQrCampaignPollItem: vi.fn(),
  from: vi.fn(),
  query: {
    delete: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn()
  }
}));

vi.mock("./supabase", () => ({ supabase: { from } }));
vi.mock("./qrCampaignItems", () => ({ addQrCampaignPollItem }));

import { createGoalEggSetup } from "./goalEggSetup";

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(query);
  query.delete.mockReturnThis();
  query.eq.mockResolvedValue({ error: null });
  query.insert.mockReturnThis();
  query.select.mockReturnThis();
  query.single.mockResolvedValueOnce({ data: { id: 8, question: "How was your visit?" }, error: null })
    .mockResolvedValueOnce({ data: { id: 12, title: "Share an idea" }, error: null });
  addQrCampaignPollItem.mockResolvedValue({ id: 9, campaign_id: 4, item_type: "poll", poll_id: 8 });
});

describe("goal-led Egg content creation", () => {
  it("creates and attaches a poll and a text-response action", async () => {
    const result = await createGoalEggSetup({
      campaign: { id: 4 },
      workspaceId: "workspace-1",
      userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] },
      actionDraft: { title: "Share an idea", description: "Tell us what would help." }
    });

    expect(from).toHaveBeenNthCalledWith(1, "polls");
    expect(query.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      question: "How was your visit?",
      answers: ["Great", "Could improve"],
      multiple_choice: false,
      allow_organizer_messages: true,
      creator_id: "user-1"
    }));
    expect(addQrCampaignPollItem).toHaveBeenCalledWith(4, 8);
    expect(from).toHaveBeenNthCalledWith(2, "woodpecker_tasks");
    expect(query.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      campaign_id: 4,
      workspace_id: "workspace-1",
      completion_mode: "manual",
      response_mode: "text"
    }));
    expect(result.task.woodpecker_task_campaigns).toEqual([{ campaign_id: 4 }]);
  });

  it("removes partially created polls and actions when setup fails", async () => {
    query.single.mockReset();
    query.single.mockResolvedValueOnce({ data: { id: 8 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Action plan limit reached." } });

    await expect(createGoalEggSetup({
      campaign: { id: 4 },
      workspaceId: "workspace-1",
      userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] },
      actionDraft: { title: "Share an idea", description: "Tell us what would help." }
    })).rejects.toThrow("Action plan limit reached.");

    expect(from).toHaveBeenCalledWith("polls");
    expect(query.delete).toHaveBeenCalledTimes(1);
  });
});
