import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractQrToken, resolveManagedQrToken } from "./qrManage";
import { supabase } from "./supabase";

vi.mock("./supabase", () => ({ supabase: { from: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

describe("Egg recognition lookup", () => {
  it.each([
    ["https://hellogodwit.com/qr/egg-1?via=qr", "egg-1"],
    ["https://hellogodwit.com/qr/egg-1?via=nfc", "egg-1"],
    ["/qr/egg%2D1#preview", "egg-1"],
    [" egg-1 ", "egg-1"],
    ["https://example.test/unrelated", ""],
    ["", ""]
  ])("extracts the same token from %s", (link, token) => {
    expect(extractQrToken(link)).toBe(token);
  });
  it("surfaces database errors instead of claiming the Egg does not exist", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "Lookup unavailable" } }) };
    supabase.from.mockReturnValue(query);
    await expect(resolveManagedQrToken("egg")).rejects.toThrow("Lookup unavailable");
  });
  it("does not find inaccessible Eggs or query their polls", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    supabase.from.mockReturnValue(query);
    expect(await resolveManagedQrToken("someone-elses-egg")).toBeNull();
    expect(supabase.from).toHaveBeenCalledExactlyOnceWith("qr_campaigns");
  });
  it("recognizes an Egg even when it has no poll yet", async () => {
    const campaign = { id: 1, workspace_id: "workspace-1", poll_id: null };
    supabase.from.mockImplementation(table => table === "qr_campaigns"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: campaign }) }) }) }
      : { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) });
    expect(await resolveManagedQrToken("egg")).toEqual({ campaign, currentPoll: null, polls: [] });
  });
});
