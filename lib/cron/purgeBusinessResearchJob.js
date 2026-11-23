import { supabaseDelete } from "./cronHelpers.js";

export async function runPurgeBusinessResearch() {
  await supabaseDelete(`business_research_usage?retention_expires_at=lt.${encodeURIComponent(new Date().toISOString())}`);
  return { purgedExpiredResearchCounters: true };
}
