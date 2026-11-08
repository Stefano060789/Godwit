# Adaptive goal-created Egg polls

Adaptive polling is opt-in for newly created goal-based Eggs. The goal creation
flow must set `adaptive_polls_enabled: true` on the `qr_campaigns` row. The
database default is `false`, so legacy and manually created campaigns are not
adapted.

Existing Eggs are never automatically backfilled: goal/category fields cannot
prove that a poll was generated. A manager can explicitly enroll an eligible
goal Egg with `set_egg_adaptive_polling(campaign_id, true)`; it requires an
active campaign with one open poll item. Managers can read the Egg-card status
with `get_workspace_adaptive_poll_status()`. Status includes the last decision,
last run, next scheduled check, latest version, and any recorded error summary.
Decision values include `enrolled`, `adapted`, `cooldown`,
`insufficient_responses`, `poll_limit`, `poll_missing`, `generation_failed`,
`version_limit`, `setup_pending`, and `disabled`.
Managers can update the email benefit on the current managed poll without
opening poll controls using `set_goal_egg_email_benefit(campaign_id, type,
value, url)`. It validates the manager, plan entitlement, benefit fields, and
the managed poll; subsequent adaptive versions preserve the updated benefit.

The database tracks setup as `pending` until exactly one poll item belonging
to the campaign's workspace is attached. That transition is recorded in the
same transaction as the item insert. If setup cleanup removes the item, its
status returns to `pending`; a retry can register a replacement item. The
scheduled job only processes registrations in `ready` state.

The weekly `adaptive-egg-polls` cron job considers active, enabled Eggs that
are at least 30 days old. It adapts only when the current managed poll has at
least five votes in the preceding 30 days, there is room under the workspace's
poll plan limit, and the Egg has not been adapted in the last 30 days. The job
processes at most 20 Eggs per run.

Claude receives the Egg's selected goals and business category, the current
question, configured-answer vote counts, and counts of locally classified
topics from the latest organizer messages. The original message text, voter
answers outside the configured choices, email addresses, and phone numbers
are not sent to Claude. The generated question uses the current poll's
language, does not ask for contact details or public reviews, and does not
offer incentives. The current poll's email opt-in benefit, customer
free-text/message permissions, and poll branding carry forward; review
benefits and raffles are disabled on generated versions.

Each adaptation creates a new poll and switches the existing single managed
QR poll item to it in one database transaction. Prior polls and their votes
remain intact. There are at most three adaptive versions per Egg; after that
the job stops adapting it. Workspace poll limits are enforced by the existing
database trigger, and a full plan quota causes the job to skip the Egg without
calling Claude.

Apply `supabase/20261111_adaptive_egg_polls.sql` after the existing workspace,
campaign-item, poll-plan, and feedback-benefit migrations. Configure the
server-side `CLAUDE_API_KEY` and deploy the cron registration in `vercel.json`.
Provider, database, or validation errors are logged and surfaced by the cron
route; no version is recorded unless publication succeeds.
