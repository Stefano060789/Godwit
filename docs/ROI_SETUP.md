# ROI Roadmap Setup

## Database

Run `supabase/20260907_secure_workspaces.sql` first, then run `supabase/20260907_roi_roadmap.sql` in the Supabase SQL Editor. The second migration is additive: it creates durable QR campaigns, scan events, consented leads, and vote-to-campaign attribution. It keeps public anonymous vote submission available through the existing vote trigger and public RPC functions.

Campaign tracking applies only to links created under **Admin > QR campaigns**. Existing poll links and QR links continue to open the public voter flow without tracking attribution.

## Stripe checkout

Only the explicitly opted-in **test subscription sandbox** is supported. Follow
[STRIPE_SANDBOX.md](STRIPE_SANDBOX.md) for manual server environment and webhook
configuration, shared-account isolation, and the pinned public catalogue.
`BILLING_ENABLED=1` alone does not enable checkout; `STRIPE_SANDBOX_ENABLED=1`
and a test-only API key are also required, together with the explicit isolated-storage
URL and acknowledgment documented there. Legacy price environment overrides
are ignored. Tax automation, guest donations, Connect flows, and live billing
remain disabled. The pilot UI is unchanged.

The browser only sends a fixed plan key and the authenticated Supabase access token.
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` remain required client variables;
do not create any `VITE_` Stripe variable.

## Follow-up consent

The vote page includes an unchecked, optional email field. A lead is stored only after the voter explicitly checks the consent box and submits a successful vote. Leads are visible only to workspace managers through RLS. This MVP records consent time and email; configure an appropriate privacy notice and downstream contact process before production use.