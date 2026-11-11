import { beforeEach, describe, expect, it, vi } from "vitest";
const { insert, single } = vi.hoisted(() => ({ insert: vi.fn(), single: vi.fn() }));
vi.mock("./supabase", () => ({
  supabase: { from: vi.fn(() => ({ insert })) }
}));
import { createQrCampaign } from "./qrCampaigns";

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReturnValue({ select: () => ({ single }) });
  single.mockResolvedValue({ data: { id: 4 }, error: null });
});
describe("goal-led Egg persistence", () => {
  it("saves each Egg's target and location alongside shared workspace identity", async () => {
    await createQrCampaign({ name: " Gallery ", placementLabel: " Entrance ", goalKey: "feedback", businessType: "arts", workspaceId: "workspace-id", aiEnabled: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      name: "Gallery", placement_label: "Entrance", goal_key: "feedback", business_type: "arts", workspace_id: "workspace-id", poll_id: null, ai_enabled: true
    }));
  });
  it("normalizes legacy single-goal keys before saving", async () => {
    await createQrCampaign({ name: "Gallery", goalKey: "next-step" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ goal_key: "help-and-guide" }));
  });
  it("saves multiple goals while keeping the first goal available to legacy readers", async () => {
    await createQrCampaign({ name: "Gallery", goalKeys: ["feedback", "answers", "help-and-guide", "feedback"], goalContext: "Improve weekday response rates." });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      goal_keys: ["feedback", "help-and-guide"],
      goal_key: "feedback",
      goal_context: "Improve weekday response rates."
    }));
  });
  it("accepts a detailed workspace business type for a new Egg", async () => {
    await createQrCampaign({ name: "Breakfast menu", businessType: "cafe-pub" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ business_type: "cafe-pub" }));
  });
  it("preserves legacy creation without requiring new columns", async () => {
    await createQrCampaign({ name: "Legacy" });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("goal_key");
  });
  it("rejects unknown goals and business types before writing", async () => {
    await expect(createQrCampaign({ name: "Egg", goalKey: "invalid" })).rejects.toThrow("valid Egg goal");
    await expect(createQrCampaign({ name: "Egg", goalKeys: [] })).rejects.toThrow("at least one Egg goal");
    await expect(createQrCampaign({ name: "Egg", goalKeys: ["feedback", "invalid"] })).rejects.toThrow("valid Egg goal");
    await expect(createQrCampaign({ name: "Egg", businessType: "invalid" })).rejects.toThrow("valid business type");
    expect(insert).not.toHaveBeenCalled();
  });
  it("surfaces database errors instead of dropping the target", async () => {
    single.mockResolvedValue({ data: null, error: { message: "Migration required" } });
    await expect(createQrCampaign({ name: "Egg", goalKey: "feedback" })).rejects.toThrow("Migration required");
  });
});
