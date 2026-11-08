import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261108_workspace_business_data.sql", import.meta.url), "utf8");
const multiGoalMigration = readFileSync(new URL("../supabase/20261109_multiple_egg_goals.sql", import.meta.url), "utf8");
const messageResultsMigration = readFileSync(new URL("../supabase/20261110_egg_message_results.sql", import.meta.url), "utf8");
const existing = readFileSync(new URL("../supabase/20260914_remove_poll_rotations.sql", import.meta.url), "utf8");

function campaignReturnColumns(sql) {
  const declaration = sql.match(/function public\.get_public_qr_campaign\(target_token text\)\s+returns table\(([\s\S]*?)\)/i);
  if (!declaration) throw new Error("Public campaign return declaration is missing.");
  return declaration[1].split(",").map((column) => column.trim().replace(/\s+/g, " "));
}

describe("workspace business data migration", () => {
  it("preserves the existing public campaign OUT parameter names, types, and order", () => {
    expect(campaignReturnColumns(migration)).toEqual(campaignReturnColumns(existing));
  });

  it("retains portal fields and supports active AI-only Eggs without dropping the function", () => {
    expect(migration).toMatch(/select id, poll_id, portal_title, portal_message, portal_button_label\s+from public\.qr_campaigns\s+where token = target_token and is_active\s+limit 1;/);
    expect(migration).not.toMatch(/drop function.*get_public_qr_campaign/i);
    expect(migration).toContain("grant execute on function public.get_public_qr_campaign(text) to anon, authenticated;");
  });

  it("backfills and synchronizes multi-goal data without breaking legacy readers", () => {
    expect(multiGoalMigration).toContain("add column if not exists goal_keys text[]");
    expect(multiGoalMigration).toMatch(/set goal_keys = array\[goal_key\]\s+where goal_key is not null\s+and goal_keys is null/i);
    expect(multiGoalMigration).toContain("new.goal_key := new.goal_keys[1]");
    expect(multiGoalMigration).toContain("new.goal_keys := case");
    expect(multiGoalMigration).toContain("create trigger sync_qr_campaign_goal_keys");
  });

  it("limits Egg message summaries to the current manager workspace and returns recent previews", () => {
    expect(messageResultsMigration).toContain("public.get_workspace_egg_message_summaries()");
    expect(messageResultsMigration).toContain("campaign.workspace_id = public.current_workspace_id()");
    expect(messageResultsMigration).toContain("message.workspace_id = public.current_workspace_id()");
    expect(messageResultsMigration).toContain("public.is_workspace_manager(campaign.workspace_id)");
    expect(messageResultsMigration).toContain("message_rank <= 3");
    expect(messageResultsMigration).toContain("grant execute on function public.get_workspace_egg_message_summaries() to authenticated");
    expect(messageResultsMigration).toContain("from public, anon");
  });
});
