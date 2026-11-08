import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBusinessNotes, addInstagramLink, importBusinessWebsite, listBusinessSources, normalizeInstagramUrl, removeBusinessSource } from "./businessData";
import { supabase } from "./supabase";

vi.mock("./supabase", () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } }
}));

describe("business data", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("only accepts Instagram profile URLs", () => {
    expect(normalizeInstagramUrl("https://instagram.com/Example/")).toBe("https://www.instagram.com/Example");
    for (const value of ["https://instagram.com/p/post", "http://instagram.com/name", "https://instagram.com.evil.test/name", "https://instagram.com/name?x=1", "https://user@instagram.com/name"]) {
      expect(() => normalizeInstagramUrl(value)).toThrow();
    }
  });

  it("persists notes and an Instagram link without fetching it", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ insert });
    await addBusinessNotes("workspace", " Hours ", " Open daily. ");
    await addInstagramLink("workspace", "https://instagram.com/example");
    expect(insert).toHaveBeenNthCalledWith(1, { workspace_id: "workspace", source_type: "notes", title: "Hours", content: "Open daily." });
    expect(insert).toHaveBeenNthCalledWith(2, {
      workspace_id: "workspace", source_type: "instagram", title: "Instagram profile",
      source_url: "https://www.instagram.com/example", content: "https://www.instagram.com/example"
    });
  });

  it("makes missing migrations explicit", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    supabase.from.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    await expect(listBusinessSources("workspace")).rejects.toThrow("migration");
  });

  it("scopes deletion to the workspace", async () => {
    const eq = vi.fn().mockReturnThis();
    eq.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: null }) });
    supabase.from.mockReturnValue({ delete: () => ({ eq }) });
    await removeBusinessSource("workspace", 12);
    expect(eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(eq.mock.results[0].value.eq).toHaveBeenCalledWith("id", 12);
  });

  it("uses the current session to import a workspace website", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: { id: 1 } }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await expect(importBusinessWebsite("workspace", " https://example.com ")).resolves.toEqual({ id: 1 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "import-workspace-website", workspaceId: "workspace", websiteUrl: "https://example.com" });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
  });
});
