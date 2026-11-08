import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261111_adaptive_egg_polls.sql", import.meta.url), "utf8");

describe("adaptive Egg polls migration", () => {
  it("keeps adaptive polling opt-in and bounds retained poll versions", () => {
    expect(migration).toContain("adaptive_polls_enabled boolean not null default false");
    expect(migration).toContain("version between 1 and 3");
    expect(migration).toContain("next_version > 3");
    expect(migration).toContain("references public.polls(id) on delete restrict");
  });

  it("publishes one new version transactionally without changing prior poll records", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("current_item_poll_id is distinct from expected_poll_id");
    expect(migration).toContain("set poll_id = new_poll_id");
    expect(migration).toContain("update public.qr_campaigns");
    expect(migration).toContain("insert into public.egg_adaptive_poll_versions");
    expect(migration).not.toContain("delete from public.polls");
  });

  it("protects the publishing function and does not carry review incentives forward", () => {
    expect(migration).toContain("revoke all on function public.publish_adaptive_egg_poll");
    expect(migration).toContain("to service_role");
    expect(migration).toMatch(/'none',\s+null,\s+null,\s+'\{\}',\s+false/);
  });

  it("preserves current poll email benefits, response permissions, and branding", () => {
    for (const field of [
      "allow_user_answers",
      "allow_organizer_messages",
      "email_benefit_type",
      "email_benefit_value",
      "email_benefit_url",
      "brand_name",
      "brand_logo_url",
      "brand_primary_color",
      "brand_accent_color"
    ]) {
      expect(migration).toContain(`prior_poll.${field}`);
    }
  });

  it("tracks initial goal-poll setup atomically and leaves incomplete setup recoverable", () => {
    expect(migration).toContain("create table if not exists public.egg_adaptive_poll_setups");
    expect(migration).toContain("setup_status text not null default 'pending'");
    expect(migration).toContain("setup_status = 'ready'");
    expect(migration).toContain("after insert or update of adaptive_polls_enabled, goal_keys");
    expect(migration).toContain("after insert or update or delete on public.qr_campaign_items");
    expect(migration).toContain("sync_adaptive_egg_poll_setup(old.campaign_id)");
    expect(migration).toContain("initial_poll_item_id = null");
  });

  it("requires explicit manager opt-in and exposes scoped business status without backfilling", () => {
    expect(migration).toContain("create or replace function public.set_egg_adaptive_polling");
    expect(migration).toContain("public.is_workspace_manager(campaign_record.workspace_id)");
    expect(migration).toContain("exactly one open poll attached to this Egg");
    expect(migration).toContain("create or replace function public.get_workspace_adaptive_poll_status()");
    for (const statusField of ["last_decision", "last_run_at", "next_run_at", "last_error"]) {
      expect(migration).toContain(statusField);
    }
    expect(migration).not.toMatch(/update public\.qr_campaigns[\s\S]{0,120}adaptive_polls_enabled\s*=\s*true/i);
  });

  it("updates benefits on the current managed poll with manager and plan checks", () => {
    expect(migration).toContain("create or replace function public.set_goal_egg_email_benefit");
    expect(migration).toContain("public.is_workspace_manager(campaign_record.workspace_id)");
    expect(migration).toContain("public.workspace_plan(campaign_record.workspace_id) = 'free'");
    expect(migration).toContain("for update of poll");
    expect(migration).toContain("set email_benefit_type = normalized_type");
    expect(migration).toContain("email_benefit_url = normalized_url");
    expect(migration).toContain("to authenticated;");
    expect(migration).toContain("without credentials");
  });
});
