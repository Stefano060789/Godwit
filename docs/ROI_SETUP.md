# ROI Roadmap Setup

## Database

Run `supabase/20260907_secure_workspaces.sql` first, then run `supabase/20260907_roi_roadmap.sql` in the Supabase SQL Editor. The second migration is additive: it creates durable QR campaigns, scan events, consented leads, and vote-to-campaign attribution. It keeps public anonymous vote submission available through the existing vote trigger and public RPC functions.

Campaign tracking applies only to links created under **Admin > QR campaigns**. Existing poll links and QR links continue to open the public voter flow without tracking attribution.

## Stripe checkout

The interaction billing integration supports monthly subscriptions and one-time
packs through Stripe-hosted checkout. **Code alone does not activate payments.**
Apply the migrations and configure the catalogue, portal, webhook, and server
environment below before enabling payments. Validate in an isolated test deployment
first; no remote Stripe objects or deployment settings are provisioned by this code.

The older Starter/Growth sandbox is separate and still uses its pinned test
catalogue and existing guards; see [STRIPE_SANDBOX.md](STRIPE_SANDBOX.md).
Interaction billing uses dedicated keys and must not reuse another app's webhook
endpoint or portal configuration on the shared Stripe account. Donation and Connect
features remain unchanged.

### Interaction billing deployment

1. Apply `supabase/20261116_workspace_interaction_trial.sql`, then
   `supabase/20261117_trial_ten_interactions.sql`, then
   `supabase/20261118_paid_interaction_billing.sql` after the existing migrations.
   The second migration lowers existing and new trials to 10 sessions over 30 days
   without resetting recorded usage or dates. The third adds paid quotas, expiring
   packs, and atomic service-only payment fulfillment.
2. In the intended Stripe account and environment, create **EUR, per-unit,
   exclusive-tax** prices (quantity one, no metered billing):

   | Key | Amount | Recurrence | Included interactions |
   | --- | --- | --- | --- |
   | Small | EUR 9 | Monthly | 100 |
   | Standard | EUR 29 | Monthly | 500 |
   | Scale | EUR 79 | Monthly | 2,000 |
   | Regional | EUR 249 | Monthly | 10,000 |
   | Top-up | EUR 7 | One-time | 100 |

   Configure Stripe Tax and appropriate tax registrations. Checkout collects billing
   addresses and tax IDs and enables automatic tax. Displayed prices exclude VAT.
   There is no additional Stripe subscription trial; the account's 10-session trial
   is managed in Godwit, with no automatic conversion or charge.
3. Create a dedicated Stripe Billing Portal configuration with metadata
   `app=godwit`, `billing_kind=interactions`. Enable payment method management,
   invoice history, and cancellation **at period end**. Enable subscription updates
   for **price only**, allowing exactly the four monthly price IDs above, with
   `proration_behavior=always_invoice`, unchanged billing cycle anchor, and
   `schedule_at_period_end.conditions=[{type:decreasing_item_amount}]`.
   Upgrades are immediate and prorated; downgrades and cancellations take effect
   at renewal. Do not enable quantity changes or promotion codes in this configuration.
4. Create a Godwit-specific platform webhook at
   `https://<godwit-host>/api/stripe-webhook` listening for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, and `charge.refunded`.
5. Set the following **server-only** deployment environment values:

   | Variable | Value |
   | --- | --- |
   | `INTERACTION_BILLING_ENABLED` | Exact `1` after configuration and database setup |
   | `INTERACTION_STRIPE_MODE` | `test` or `live` |
   | `INTERACTION_STRIPE_SECRET_KEY` | Matching test/live key for the intended account |
   | `INTERACTION_STRIPE_ACCOUNT_ID` | Expected `acct_...` identity |
   | `INTERACTION_STRIPE_WEBHOOK_SECRET` | This Godwit endpoint's signing secret |
   | `INTERACTION_STRIPE_PRICE_SMALL` | Small monthly `price_...` |
   | `INTERACTION_STRIPE_PRICE_STANDARD` | Standard monthly `price_...` |
   | `INTERACTION_STRIPE_PRICE_SCALE` | Scale monthly `price_...` |
   | `INTERACTION_STRIPE_PRICE_REGIONAL` | Regional monthly `price_...` |
   | `INTERACTION_STRIPE_PRICE_TOPUP` | One-time EUR 7 `price_...` |
   | `INTERACTION_STRIPE_PORTAL_CONFIGURATION` | Dedicated validated `bpc_...` |
   | `APP_URL` | Canonical HTTPS app origin, without a path or query |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Matching project/auth/service credentials |
   | `INTERACTION_STRIPE_TEST_SUPABASE_URL` | Test only: isolated project's URL, exactly matching `SUPABASE_URL` |
   | `INTERACTION_STRIPE_TEST_STORAGE_ACK` | Test only: `1` after verifying isolated storage |

   Leave legacy sandbox flags disabled in the live deployment. When interaction
   billing is enabled, the webhook and daily reconciliation use the interaction
   implementation, not the legacy sandbox. Test and live storage must be separate.
   Never paste keys into source, chat, logs, screenshots, or browser variables.

### Usage, top-ups, and warnings

Account-management actions (refresh billing, manage/cancel a subscription, and buy
100 extra interactions) are available under Dashboard > Settings. Billing remains
the plan catalogue and also offers the one-time pack. Purchase buttons use the
terracotta primary-action colour in both places.

### Complimentary creator access

After the paid-interaction migration, run
[`20261119_creator_access.sql`](../supabase/20261119_creator_access.sql) in the
Supabase SQL editor. It grants the existing confirmed account
`bonomistefano@outlook.it` complimentary access to all available feature tiers,
unlimited interactions, Eggs, polls and seats in accounts it owns. The grant is
stored against its auth user ID, not an email supplied by the browser. The script
fails explicitly if that confirmed user cannot be uniquely identified.

Only a database administrator/service role can grant or revoke access; members
cannot edit the grant table. Other accounts retain existing billing and quotas.
The creator sees "Complimentary creator access" instead of the legacy warning.
New subscription and top-up purchases are blocked in the UI and backend; existing
Stripe subscriptions are not automatically cancelled. If one exists, cancel it
through Settings to stop renewal. Removing the user's row from `creator_accounts`
restores the original billing state. This migration must actually be applied to
the target database; deploying the frontend alone does not grant access.

### Interaction accounting

One first customer Egg open per browser session across an account's Eggs consumes
one interaction; this is not a verified unique-person count. Staff previews do not
count. Base usage renews on Stripe's actual monthly period, not the calendar month,
and does not reset when a plan is upgraded. Unused monthly allowance does not roll
over. Paid plans include unlimited Eggs; existing feature tiers otherwise remain.

The one-time EUR 7 pack adds 100 interactions **only after verified payment**,
expires 30 days after successful purchase, and never renews automatically. Packs
are consumed only after monthly allowance, earliest expiry first. Their expiry
does not reset at plan renewal. An active paid subscription is required to buy or
use packs. Refunds revoke unspent pack credits (including partial refunds); past
usage is retained. A checkout return URL never grants allowance.

At 90% usage, the dashboard offers plan management and the 100-interaction pack.
It refreshes usage every 30 seconds; Billing also reloads after returning from
Stripe. Trials receive a plan-choice warning at 9 of 10 sessions, not a top-up offer.
Once allowance is exhausted new customer sessions pause; already admitted sessions
can finish while the billing period is valid. Invalid, unpaid, inactive, or expired
subscriptions cannot start new sessions. Top-up balances may remain recorded while
a subscription is inactive, but cannot be used until it is active again.

Payments are restricted to the actual account owner. Checkout reservations prevent
concurrent duplicate purchases; webhook RPCs are idempotent and quotas serialize
access to prevent overspending. The existing daily `stripe-reconciliation` cron
re-reads current subscriptions and recovers completed checkouts if delivery failed.
Keep webhooks healthy: the daily cron is a recovery path, not immediate fulfillment.
Test payment failures, duplicate/out-of-order webhooks, 90%/100% boundaries, renewal,
upgrades, scheduled downgrades/cancellation, refunds, and 30-day pack expiry before launch.

The browser only sends a fixed plan key and the authenticated Supabase access token.
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain required client variables;
do not create any `VITE_` Stripe variable.

## Follow-up consent

The vote page includes an unchecked, optional email field. A lead is stored only after the voter explicitly checks the consent box and submits a successful vote. Leads are visible only to workspace managers through RLS. This MVP records consent time and email; configure an appropriate privacy notice and downstream contact process before production use.