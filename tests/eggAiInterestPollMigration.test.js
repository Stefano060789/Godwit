import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261113_egg_ai_interest_polls.sql", import.meta.url), "utf8");

describe("customer-interest Egg poll migration", () => {
  it("deduplicates reusable polls and limits each visitor session to one poll", () => {
    expect(migration).toContain("unique (campaign_id, interest_key, version)");
    expect(migration).toContain("primary key (campaign_id, session_hash)");
    expect(migration).toContain("existing_interest_key <> target_interest_key");
    expect(migration).toContain("'session_limit'");
  });

  it("serializes poll creation and enforces active workspace plan limits", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("public.workspace_plan_limits(campaign_record.workspace_id)");
    expect(migration).toContain("and poll.closed_at is null");
    expect(migration).toContain("'poll_limit'");
  });

  it("creates neutral polls without requiring an existing template poll", () => {
    expect(migration).toContain("coalesce(template_poll.creator_id, workspace_owner_id)");
    expect(migration).toContain("coalesce(template_poll.brand_name, campaign_record.name)");
    expect(migration).not.toContain("The Egg needs a poll before AI can create an interest poll.");
  });

  it("disables organizer messages and incentives on generated polls", () => {
    expect(migration).toContain("allow_organizer_messages");
    expect(migration).toContain("email_benefit_type");
    expect(migration).toContain("review_benefit_type");
    expect(migration).toMatch(/false,\s+false,\s+false,\s+'none'[\s\S]{0,240}'none',\s+'\{\}',\s+false/);
  });

  it("restricts the poll-creation RPC to the service role", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("revoke all on function public.create_egg_ai_interest_poll");
    expect(migration).toMatch(/grant execute on function public\.create_egg_ai_interest_poll[\s\S]*to service_role;/);
  });
});
