import { beforeEach, describe, expect, it, vi } from "vitest";

const { addQrCampaignInfoItem, addQrCampaignPollItem, from, query } = vi.hoisted(() => ({
  addQrCampaignInfoItem: vi.fn(),
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
vi.mock("./qrCampaignItems", () => ({ addQrCampaignInfoItem, addQrCampaignPollItem }));

import { createGoalEggSetup } from "./goalEggSetup";

beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(query);
  query.delete.mockReturnThis();
  query.eq.mockResolvedValue({ error: null });
  query.insert.mockReturnThis();
  query.select.mockReturnThis();
  query.single.mockResolvedValueOnce({ data: { id: 8, question: "How was your visit?" }, error: null });
  addQrCampaignPollItem.mockResolvedValue({ id: 9, campaign_id: 4, item_type: "poll", poll_id: 8 });
  addQrCampaignInfoItem.mockResolvedValue({ id: 10, campaign_id: 4, item_type: "info" });
});

describe("goal-led Egg content creation", () => {
  it("creates and attaches a goal poll without a legacy action task", async () => {
    const result = await createGoalEggSetup({
      campaign: { id: 4 },
      workspaceId: "workspace-1",
      userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] }
    });

    expect(from).toHaveBeenNthCalledWith(1, "polls");
    expect(query.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      question: "How was your visit?",
      answers: ["Great", "Could improve"],
      multiple_choice: false,
      allow_organizer_messages: false,
      creator_id: "user-1"
    }));
    expect(addQrCampaignPollItem).toHaveBeenCalledWith(4, 8);
    expect(from).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty("task");
  });

  it("attaches the business benefit to the AI poll without manual poll setup", async () => {
    await createGoalEggSetup({
      campaign: { id: 4 }, workspaceId: "workspace-1", userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] },
      emailBenefit: { type: "voucher", value: "Free coffee", url: "https://example.com/redeem" }
    });
    expect(query.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      email_benefit_type: "voucher", email_benefit_value: "Free coffee", email_benefit_url: "https://example.com/redeem",
      workspace_id: "workspace-1"
    }));
  });

  it("creates independent polls when different Eggs use the same question", async () => {
    query.single.mockResolvedValueOnce({ data: { id: 11, question: "How was your visit?" }, error: null });
    const pollDraft = { question: "How was your visit?", answers: ["Great", "Could improve"] };
    const first = await createGoalEggSetup({
      campaign: { id: 4 }, workspaceId: "workspace-1", userId: "user-1", pollDraft
    });
    const second = await createGoalEggSetup({
      campaign: { id: 5 }, workspaceId: "workspace-2", userId: "user-2", pollDraft
    });

    expect(first.poll.id).toBe(8);
    expect(second.poll.id).toBe(11);
    expect(query.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ workspace_id: "workspace-1", question: pollDraft.question }));
    expect(query.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ workspace_id: "workspace-2", question: pollDraft.question }));
    expect(addQrCampaignPollItem).toHaveBeenNthCalledWith(1, 4, 8);
    expect(addQrCampaignPollItem).toHaveBeenNthCalledWith(2, 5, 11);
  });

  it("explains the required database update if the legacy constraint still exists", async () => {
    query.single.mockReset().mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "polls_question_key"' }
    });
    await expect(createGoalEggSetup({
      campaign: { id: 4 }, workspaceId: "workspace-1", userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] }
    })).rejects.toThrow("An administrator needs to apply the latest database update.");
    expect(addQrCampaignPollItem).not.toHaveBeenCalled();
    expect(query.delete).not.toHaveBeenCalled();
  });

  it("preserves other database errors instead of treating them as duplicate questions", async () => {
    query.single.mockReset().mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "another_key"' }
    });
    await expect(createGoalEggSetup({
      campaign: { id: 4 }, workspaceId: "workspace-1", userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] }
    })).rejects.toThrow('Unable to create the generated poll: duplicate key value violates unique constraint "another_key"');
  });

  it("validates the benefit before any write", async () => {
    await expect(createGoalEggSetup({ emailBenefit: { type: "voucher" } })).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects unsafe review links before writing content", async () => {
    await expect(createGoalEggSetup({ reviewCards: [{ title: "Google", linkUrl: "javascript:alert(1)" }] }))
      .rejects.toThrow("Fix the review links");
    expect(from).not.toHaveBeenCalled();
  });
  it("automatically attaches configured review links separately from benefits", async () => {
    const card = { title: "Google", linkUrl: "https://example.com/review", body: "Optional honest review" };
    const result = await createGoalEggSetup({
      campaign: { id: 4 }, workspaceId: "workspace-1", userId: "user-1",
      pollDraft: { question: "How was your visit?", answers: ["Great", "Could improve"] },
      reviewCards: [card]
    });
    expect(addQrCampaignInfoItem).toHaveBeenCalledWith(4, card);
    expect(result.reviewItems).toHaveLength(1);
  });
});
