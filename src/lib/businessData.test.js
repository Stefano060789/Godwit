import { beforeEach, describe, expect, it, vi } from "vitest";
import { addBusinessNotes, addFacebookLink, addInstagramLink, importBusinessWebsite, listBusinessSources, normalizeFacebookUrl, normalizeInstagramUrl, removeBusinessSource, uploadBusinessWebsite } from "./businessData";
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
    expect(normalizeInstagramUrl("https://www.instagram.com/mcmullensvillach?utm_source=ig_web_button_share_sheet&mdxt=ZDNlZDc0MzIxNw=="))
      .toBe("https://www.instagram.com/mcmullensvillach");
    expect(normalizeInstagramUrl("https://instagram.com/Example/?tracking=1#profile"))
      .toBe("https://www.instagram.com/Example");
    for (const value of ["https://instagram.com/p/post", "http://instagram.com/name", "https://instagram.com.evil.test/name", "https://user@instagram.com/name", "https://instagram.com:444/name"]) {
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

  it("normalizes Facebook page and profile links without tracking parameters", () => {
    expect(normalizeFacebookUrl("https://m.facebook.com/McMullens.Villach/?ref=share#top")).toBe("https://www.facebook.com/McMullens.Villach");
    expect(normalizeFacebookUrl("https://www.facebook.com/profile.php?id=123456&ref=share")).toBe("https://www.facebook.com/profile.php?id=123456");
    for (const value of ["http://facebook.com/example", "https://facebook.com.evil.test/example", "https://user@facebook.com/example", "https://facebook.com/groups/123", "https://facebook.com/name/posts/123", "https://facebook.com/profile.php?id=abc", "https://facebook.com/profile.php?id=1&id=2", "https://facebook.com/share"]) {
      expect(() => normalizeFacebookUrl(value)).toThrow();
    }
  });

  it("saves a Facebook link without fetching its content", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockReturnValue({ insert });
    await addFacebookLink("workspace", "https://facebook.com/example?ref=share");
    expect(insert).toHaveBeenCalledWith({
      workspace_id: "workspace", source_type: "facebook", title: "Facebook page or profile",
      source_url: "https://www.facebook.com/example", content: "https://www.facebook.com/example"
    });
  });

  it("explains when Facebook storage requires the migration", async () => {
    supabase.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({
      error: { code: "23514", message: 'violates check constraint "workspace_ai_sources_source_type_check"' }
    }) });
    await expect(addFacebookLink("workspace", "https://facebook.com/example")).rejects.toThrow("database update");
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

  it("uploads a saved HTML page with the current session", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: { id: 2 } }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const file = { name: "page.html", size: 31, text: vi.fn().mockResolvedValue("<html><body>Open daily</body></html>") };
    await expect(uploadBusinessWebsite("workspace", " https://example.com ", file)).resolves.toEqual({ id: 2 });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: "upload-workspace-website", workspaceId: "workspace", websiteUrl: "https://example.com",
      html: "<html><body>Open daily</body></html>"
    });
  });

  it("rejects missing, non-HTML and oversized uploads before reading or sending", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const text = vi.fn();
    await expect(uploadBusinessWebsite("workspace", "https://example.com", null)).rejects.toThrow("HTML");
    await expect(uploadBusinessWebsite("workspace", "https://example.com", { name: "page.pdf", size: 10, text })).rejects.toThrow("HTML");
    await expect(uploadBusinessWebsite("workspace", "https://example.com", { name: "page.html", size: 1_000_001, text })).rejects.toThrow("1 MB");
    expect(text).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
