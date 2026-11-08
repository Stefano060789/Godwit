import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { rpc } }));
import { loadEggMessagePage } from "./eggMessages";

beforeEach(() => vi.clearAllMocks());
describe("inline Egg message history", () => {
  it("uses the extra row to show whether another page exists", async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 21 }, (_, id) => ({ id })), error: null });
    const result = await loadEggMessagePage(4);
    expect(result.messages).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_workspace_egg_messages", {
      target_campaign_id: 4, before_created_at: null, before_message_id: null
    });
  });
  it("uses both cursor values to page without duplicates", async () => {
    rpc.mockResolvedValue({ data: [{ id: 7 }], error: null });
    const result = await loadEggMessagePage(4, { id: 9, created_at: "2026-11-08T12:00:00Z" });
    expect(result.hasMore).toBe(false);
    expect(rpc).toHaveBeenCalledWith("get_workspace_egg_messages", {
      target_campaign_id: 4, before_created_at: "2026-11-08T12:00:00Z", before_message_id: 9
    });
  });
  it("surfaces a missing migration or permission failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(loadEggMessagePage(4)).rejects.toThrow("Permission denied");
  });
});
