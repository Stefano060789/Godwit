import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : "../.billing-sql-tools/node_modules/@electric-sql/pglite/dist/index.js");
const db = new PGlite();
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
let checks = 0;
async function value(sql, expected) {
  assert.deepEqual((await db.query(sql)).rows[0].value, expected);
  checks++;
}
async function denied(sql) {
  await assert.rejects(() => db.exec(sql), /permission denied/);
  checks++;
}
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.workspaces(id uuid primary key);
    insert into public.workspaces values ('${first}'), ('${second}');
  `);
  await db.exec(await readFile(new URL("../supabase/20261124_business_research_weekly_limits.sql", import.meta.url), "utf8"));
  await db.exec("set role service_role");
  await value(`select public.reserve_business_research('${first}',2,3) as value`, true);
  await value(`select public.reserve_business_research('${first}',2,3) as value`, true);
  await value(`select public.reserve_business_research('${first}',2,3) as value`, false);
  await value(`select public.reserve_business_research('${second}',2,3) as value`, true);
  await value(`select public.reserve_business_research('${second}',2,3) as value`, false);
  await value("select sum(request_count)::integer as value from public.business_research_usage", 3);
  await value("select bool_and(retention_expires_at = created_at + interval '56 days') as value from public.business_research_usage", true);
  await db.exec(`update public.business_research_usage set week_start = week_start - 7 where workspace_id = '${first}'`);
  await value(`select public.reserve_business_research('${first}',2,3) as value`, true);
  await value(`select request_count as value from public.business_research_usage where workspace_id = '${first}' and week_start = date_trunc('week', now() at time zone 'utc')::date`, 1);

  for (const user of [first, second]) {
    await db.exec(`reset role; set role authenticated; set request.jwt.claims = '{"sub":"${user}","role":"authenticated"}'`);
    await denied("select 1 from public.business_research_usage");
    await denied("update public.business_research_usage set request_count = 1 returning 1");
    await denied("delete from public.business_research_usage returning 1");
    await denied(`insert into public.business_research_usage values ('${first}', current_date, 1, now(), now())`);
    await denied(`select public.reserve_business_research('${first}',20,1000)`);
  }
  await db.exec("reset role; set role anon");
  await denied("select 1 from public.business_research_usage");
  await denied(`select public.reserve_business_research('${first}',20,1000)`);
  await db.exec("reset role");

  // Mutate only this isolated in-memory database to prove the guards catch open access.
  for (const operation of ["select", "update", "delete"]) {
    await db.exec(`grant ${operation} on public.business_research_usage to authenticated;
      create policy tmp_open on public.business_research_usage for ${operation} to authenticated using (true);
      set role authenticated;`);
    const probe = operation === "select" ? "select 1 from public.business_research_usage"
      : operation === "update" ? "update public.business_research_usage set request_count = 1 returning 1"
        : "delete from public.business_research_usage returning 1";
    await assert.rejects(() => denied(probe), { name: "AssertionError" });
    checks++;
    await db.exec(`reset role; drop policy tmp_open on public.business_research_usage;
      revoke ${operation} on public.business_research_usage from authenticated;`);
  }
  console.log(`Business research SQL: ${checks} checks passed, including two-user isolation and open-access mutation detection.`);
} finally {
  await db.close();
}
