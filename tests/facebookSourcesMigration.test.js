import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Facebook business sources migration", () => {
  it("adds Facebook without removing existing source types or data", () => {
    const sql = readFileSync(new URL("../supabase/20261114_workspace_facebook_sources.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/source_type in \('website', 'notes', 'instagram', 'facebook'\)/i);
    expect(sql).toMatch(/content = source_url/i);
    expect(sql).not.toMatch(/\b(?:delete|truncate|update|drop\s+table)\b/i);
  });
});
