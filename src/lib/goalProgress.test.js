import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({
  supabase: { rpc: vi.fn() }
}));

import { supabase } from "./supabase";
import { recordEggPromotionLinkClick, submitEggReviewFeedback } from "./goalProgress";

describe("goal progress visitor events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits explicit visitor review feedback", async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null });

    await expect(submitEggReviewFeedback("12", "session-id", "Helpful experience")).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("submit_egg_review_feedback", {
      target_campaign_id: 12,
      target_session_id: "session-id",
      review_feedback: "Helpful experience"
    });
  });

  it("surfaces review submission failures", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: "Unavailable" } });

    await expect(submitEggReviewFeedback(12, "session-id", "Helpful experience"))
      .rejects.toThrow("Unable to submit review feedback: Unavailable");
  });

  it("records promotion clicks with the visitor's current session", async () => {
    supabase.rpc.mockResolvedValue({ error: null });

    await expect(recordEggPromotionLinkClick(12, 34, "session-id")).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("record_egg_promotion_link_click", {
      target_campaign_id: 12,
      target_item_id: 34,
      target_session_id: "session-id"
    });
  });
});
