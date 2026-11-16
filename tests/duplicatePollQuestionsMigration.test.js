import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/20261123_allow_duplicate_poll_questions.sql", import.meta.url), "utf8");

describe("duplicate poll questions migration", () => {
  it("removes the legacy global question constraint without changing existing polls", () => {
    expect(migration).toMatch(/alter table public\.polls\s+drop constraint if exists polls_question_key;/i);
    expect(migration).not.toMatch(/\b(delete|update|truncate|drop table)\b/i);
  });
});
