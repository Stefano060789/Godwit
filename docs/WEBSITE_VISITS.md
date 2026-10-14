# Public website visit counter

Apply `supabase/20261007_website_visits.sql` in the Supabase SQL editor before
deploying the application. The migration is safe to run again if the tables
already exist. It depends on the existing `is_creator()` function.
No new environment variables are required.

The Creator page shows total visits, today's visits (UTC), and visits over the
last 30 calendar days. It has a refresh button and displays database errors
explicitly rather than treating an unavailable counter as zero.

Only production visits to `/`, `/essentials`, `/privacy`, `/terms`, and
`/support` are measured after optional consent is accepted. Signed-in users,
Creator/dashboard pages, and QR/voting pages are excluded. Declining consent
leaves the website functional and sends no visit measurement.
The consent preference key is versioned so visitors who previously accepted
error reporting are asked again before the new measurement starts.

A random session-storage identifier deduplicates visits within a browser tab
and UTC day. Reloads and navigation among these pages do not increment the
counter again that day. A new tab/session or day can count again, so this is a
session count, not a count of distinct humans. Consent refusals, blockers and
automated traffic can affect accuracy; this is not a bot-proof analytics system.

Identifiers are pruned on subsequent writes once older than 30 days. Only daily
totals are retained long term. No historical traffic is backfilled.

Verification after installation:

1. Open the production homepage in a signed-out private browser and decline
   consent: the counter must not change.
2. Open a new signed-out session, accept consent, and load the homepage: today's
   and total visits should increase by one.
3. Reload and open Essentials in that tab: the counter should not increase.
4. Open Creator signed in and select **Refresh visits** to view the totals.
5. Verify a non-Creator account cannot call `creator_website_visits` or read the
   two counter tables directly.
