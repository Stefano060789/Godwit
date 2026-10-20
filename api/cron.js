// Consolidates cron-only endpoints (weekly-report, check-anomalies, purge-old-votes,
// send-winback-emails, creator outreach) into one Serverless Function. None of these are
// ever called by name from the browser - only Vercel's own scheduler hits them, on the
// schedules configured in vercel.json - so merging them costs nothing functionally and
// exposed as browser-callable API routes, keeping the deployment's function count low.
//
// Each cron entry in vercel.json points here with a distinguishing `?job=` query param,
// e.g. "/api/cron?job=weekly-report". The actual job logic lives in lib/cron/ - outside
// the api/ directory entirely, so Vercel bundles it as a dependency of this one function
// instead of treating it as a routable function in its own right (only files directly
// under api/ become Serverless Functions).
import { secureEqual } from "../lib/cron/cronHelpers.js";
import { runWeeklyReport } from "../lib/cron/weeklyReportJob.js";
import { runAnomalyCheck } from "../lib/cron/anomalyCheckJob.js";
import { runPurgeOldVotes } from "../lib/cron/purgeOldVotesJob.js";
import { runSendWinbackEmails } from "../lib/cron/sendWinbackEmailsJob.js";
import { runSendOutreachEmails } from "../lib/cron/sendOutreachEmailsJob.js";
import { runStripeReconciliation } from "../lib/cron/stripeReconciliationJob.js";
import { runDsarProcessing } from "../lib/cron/dsarJob.js";
import { runCheckGmailReplies } from "../lib/cron/gmailReplyMonitorJob.js";
import { runResearchGodwitProspects } from "../lib/cron/researchGodwitProspectsJob.js";
import { getSystemStatus } from "../lib/cron/systemStatus.js";
import { captureError } from "../lib/errorReporting.js";

const JOBS = {
  "weekly-report": { run: runWeeklyReport, methods: ["GET"] },
  "check-anomalies": { run: runAnomalyCheck, methods: ["GET", "POST"] },
  "purge-old-votes": { run: runPurgeOldVotes, methods: ["GET", "POST"] },
  "send-winback-emails": { run: runSendWinbackEmails, methods: ["GET"] },
  "send-outreach-emails": { run: runSendOutreachEmails, methods: ["GET"] },
  "stripe-reconciliation": { run: runStripeReconciliation, methods: ["GET"] },
  "process-dsar": { run: runDsarProcessing, methods: ["GET"] },
  "check-gmail-replies": { run: runCheckGmailReplies, methods: ["GET"] },
  "research-godwit-prospects": { run: runResearchGodwitProspects, methods: ["GET"] },
  "system-status": { run: getSystemStatus, methods: ["GET"] }
};

export default async function handler(request, response) {
  const jobName = String(request.query?.job || "");
  const job = JOBS[jobName];

  if (!job) {
    return response.status(400).json({ error: `Unknown or missing job. Expected one of: ${Object.keys(JOBS).join(", ")}.` });
  }
  if (!job.methods.includes(request.method)) {
    response.setHeader("Allow", job.methods.join(", "));
    return response.status(405).json({ error: "Method not allowed." });
  }

  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!secureEqual(supplied, secret)) return response.status(401).json({ error: "Unauthorized." });

  try {
    const result = await job.run();
    return response.status(200).json(result);
  } catch (error) {
    captureError(`Cron job "${jobName}" failed`, error);
    return response.status(500).json({ error: `Cron job "${jobName}" failed.` });
  }
}
