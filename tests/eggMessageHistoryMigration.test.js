import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../supabase/20261112_egg_message_history.sql", import.meta.url), "utf8");
describe("private Results history RPC", () => {
  it("requires management of the current workspace and verifies Egg ownership", () => {
    expect(migration).toContain("public.current_workspace_id()");
    expect(migration).toContain("not public.is_workspace_manager(target_workspace_id)");
    expect(migration).toContain("c.id = target_campaign_id and c.workspace_id = target_workspace_id");
    expect(migration).toContain("m.workspace_id = target_workspace_id");
    expect(migration).toContain("m.campaign_id = target_campaign_id");
    expect(migration).toContain("from public, anon");
  });
  it("uses stable bounded pagination without returning all private messages at once", () => {
    expect(migration).toContain("(m.created_at, m.id) < (before_created_at, before_message_id)");
    expect(migration).toContain("order by m.created_at desc, m.id desc");
    expect(migration).toContain("limit 21");
    expect(migration).toContain("(before_created_at is null) <> (before_message_id is null)");
  });
});
