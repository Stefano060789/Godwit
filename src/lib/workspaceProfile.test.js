import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { eq, from, update } = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  update: vi.fn()
}));

vi.mock("./supabase", () => ({
  supabase: { from }
}));

import { saveWorkspaceBusinessType } from "./workspaceProfile";

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
  from.mockReturnValue({ update });
  const values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("workspace business profile persistence", () => {
  it("saves the business type and custom description and caches them after the database update", async () => {
    await expect(saveWorkspaceBusinessType("workspace-id", "cafe-pub")).resolves.toEqual({
      businessType: "cafe-pub",
      businessDescription: ""
    });

    expect(from).toHaveBeenCalledWith("workspaces");
    expect(update).toHaveBeenCalledWith({ business_type: "cafe-pub", business_description: null });
    expect(eq).toHaveBeenCalledWith("id", "workspace-id");
  });

  it("requires a description when saving an unlisted business", async () => {
    await expect(saveWorkspaceBusinessType("workspace-id", "other")).rejects.toThrow("Describe your business");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects unknown categories before writing", async () => {
    await expect(saveWorkspaceBusinessType("workspace-id", "unknown")).rejects.toThrow("valid business type");
    expect(from).not.toHaveBeenCalled();
  });
});
