import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261114_workspace_rpc_volatility.sql", import.meta.url), "utf8");

describe("workspace RPC volatility migration", () => {
  it("allows workspace resolution to update activity while these RPCs run", () => {
    expect(migration).toContain("alter function public.get_workspace_egg_access_metrics() volatile;");
    expect(migration).toContain("alter function public.get_workspace_egg_message_summaries() volatile;");
    for (const functionSignature of [
      "get_workspace_egg_messages(bigint, timestamptz, bigint)",
      "get_workspace_vote_counts()",
      "get_workspace_vote_timeline()",
      "get_workspace_campaign_metrics()",
      "get_workspace_adaptive_poll_status()"
    ]) {
      expect(migration).toContain(`'public.${functionSignature}'`);
    }
    expect(migration).toContain("if to_regprocedure(function_signature) is not null then");
    expect(migration).toContain("execute format('alter function %s volatile', function_signature)");
  });
});
