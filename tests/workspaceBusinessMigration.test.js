import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261108_workspace_business_data.sql", import.meta.url), "utf8");
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
});
