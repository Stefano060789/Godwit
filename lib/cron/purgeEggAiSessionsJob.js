import { supabaseDelete } from "./cronHelpers.js";

export async function runPurgeEggAiSessions() {
  await supabaseDelete(`egg_ai_interest_poll_sessions?retention_expires_at=lt.${encodeURIComponent(new Date().toISOString())}`);
  return { purgedExpiredAiPollSessions: true };
}
