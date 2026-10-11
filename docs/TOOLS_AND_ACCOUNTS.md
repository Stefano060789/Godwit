# Godwit tools, services, and account access

This is an operational handoff for the Godwit application. It records what each service does, which login identifiers are known from the project, and where its configuration is managed. It intentionally does not contain passwords, API keys, recovery codes, or other secrets.

## Main services

| Service | Why the project uses it | Login/account identifier known here | Configuration and notes |
| --- | --- | --- | --- |
| **Vercel** | Hosts `https://hellogodwit.com`, deploys the app from GitHub, and runs the serverless API and scheduled jobs. | Team/account scope: `bonomistefano123-6506`; project: `godwit`, renamed from `i-vote` on 11 October 2026 with the same project ID. | Project environment variables and deployment logs are managed in the Vercel dashboard. Set production secrets there and redeploy after changing them. |
| **Cloudflare (domain/DNS, if configured)** | May manage the `hellogodwit.com` domain's DNS, proxy, or security settings in front of Vercel. The application source does not confirm that Cloudflare is currently active for this domain. | Cloudflare account login is not recorded in the repository. | Check the domain's nameservers at the registrar and the DNS records in Cloudflare. Keep Vercel as the app host unless the deployment setup is intentionally changed. |
| **Supabase** | PostgreSQL database, authentication, Row Level Security, and application RPC functions. | Creator sign-in emails: `bonomistefano@outlook.it` and `afelix470@gmail.com`. The Supabase dashboard owner email is not recorded here. | The project URL and keys are environment variables. The service-role key must remain server-only. The migration `supabase/20261004_add_creator_access.sql` must be run in the SQL Editor to grant the additional Creator access in the database. |
| **GitHub** | Source control and the deployment source for the app. | Owner `Stefano060789`, repository [`Stefano060789/Godwit`](https://github.com/Stefano060789/Godwit); local `origin` is `https://github.com/Stefano060789/Godwit.git`. Renamed from `iVote` on 11 October 2026. | Push changes to `main`; Vercel's Git connection was refreshed to the renamed repository and the production deployment verified. |
| **Google / Gmail** | Google Places supplies business prospects and location details; Google Translate supports translation features; Gmail SMTP sends Creator outreach and Gmail IMAP checks for replies. | Outbound Creator mail account: `hellogodwit@gmail.com`. The Google Cloud project owner/login is not recorded here. | Places and Translate use separate API-key environment variables. SMTP uses a Google App Password in `OUTREACH_SMTP_PASSWORD`; IMAP also uses `OUTREACH_SMTP_USER`. Never use or store the normal Gmail password in the app. |
| **SerpApi** | Searches public Google results for business contact emails when the listed business website has no email or is unavailable. | SerpApi account email is not recorded here. | `SERPAPI_API_KEY` is a server-only Vercel variable. The key was configured by the project owner; public search may incur provider usage charges. |

## Additional and optional integrations

| Service | Why / when it is used | Login/account identifier known here | Configuration |
| --- | --- | --- | --- |
| **Stripe** | Subscription checkout and webhook processing, including retained donation/Connect history handling. New donations and Connect onboarding are disabled in the application. | Stripe dashboard login is not recorded here. | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`; subscription billing is gated by `BILLING_ENABLED`, and donation/Connect entry points by `DONATION_FEATURE_ENABLED` in `lib/donationFeature.js`. |
| **Resend** | Transactional notifications, reports, and consent-based lead follow-up email. | Resend account login is not recorded here. | `RESEND_API_KEY` and verified sender `REPORT_FROM_EMAIL`. This is separate from Gmail Creator outreach. |
| **Google Gemini** | Preferred provider for Creator outreach drafts, using available public business information to propose a business-specific feedback opportunity. | Google AI Studio account; the account owner is not recorded here. | Set `GEMINI_API_KEY` in Vercel. The app uses Gemini's OpenAI-compatible API; when both provider keys are configured, Gemini is preferred. Research does not create a sendable template; use Regenerate to create each draft. |
| **OpenAI** | Optional AI-assisted sentiment classification and fallback provider for Creator outreach drafts. | OpenAI account login is not recorded here. | `OPENAI_API_KEY`. Used for outreach only when `GEMINI_API_KEY` is not configured. |
| **Sentry** | Optional browser and server error monitoring. | Sentry organization/account login is not recorded here. | Client `VITE_SENTRY_DSN`; server `SENTRY_DSN`. |

## Vercel environment-variable checklist

Set secrets in **Vercel → godwit → Settings → Environment Variables**. Do not paste secret values into this document, GitHub, or chat. Use Production for the live site; configure Preview too only if preview deployments need the integration.

### Core app and authentication

- `APP_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CREATOR_EMAILS` (optional additional server-side allowlist)
- `VITE_CREATOR_EMAILS` (optional additional client-side allowlist)
- `CRON_SECRET` (protects scheduled-job endpoints)

The current Creator email allowlist includes `bonomistefano@outlook.it` and `afelix470@gmail.com` in the application. The Supabase allowlist is database-backed; run the migration listed above for the additional user.

### Outreach email and prospect discovery

- `OUTREACH_SMTP_PASSWORD` — Gmail App Password for `hellogodwit@gmail.com`, not its normal password.
- `OUTREACH_SMTP_USER` — Gmail account used by the IMAP reply monitor; use `hellogodwit@gmail.com`.
- `SERPAPI_API_KEY` — public web search fallback for business contact email discovery.
- `GOOGLE_PLACES_API_KEY` — Places search and business/location data.
- `OUTREACH_NOTIFICATION_EMAIL` (optional reply-monitor notification destination).
- `SUPPORT_TO_EMAIL` (optional support/notification destination).

### Other feature-specific variables

- Google Translate: `GOOGLE_TRANSLATE_API_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_TAX_ENABLED`, `BILLING_ENABLED`
- Resend: `RESEND_API_KEY`, `REPORT_FROM_EMAIL`
- Gemini outreach: `GEMINI_API_KEY`
- OpenAI sentiment classification and optional outreach fallback: `OPENAI_API_KEY`
- Sentry: `VITE_SENTRY_DSN`, `SENTRY_DSN`

Some variables are needed only when their corresponding feature is enabled. Confirm current feature usage in the Vercel project and provider dashboards; this document does not expose whether a secret is present or its value.

## Product naming and external identifiers

The local application/package branding is `Godwit`. The externally managed identifiers documented or verified here remain:

- GitHub repository: `Stefano060789/Godwit` (local `origin` updated and verified).
- Vercel project: `godwit`, ID `prj_IDogqilMq8YozqcL5OC3Tm2zVg1d`.
- Production domain: `hellogodwit.com`.
- Gmail outreach sender: `hellogodwit@gmail.com`; support fallback: `contact@hellogodwit.com`.

On 11 October 2026, GitHub and Vercel were renamed, the local remote updated,
and Vercel's Git link refreshed to the same GitHub repository ID. A production
deployment from the scoped naming/donation commit was verified; the existing
domain and `i-vote-one.vercel.app` alias were preserved. Google, DNS, Supabase,
and Stripe identifiers were not changed. Review any external scripts or hooks
that embed old dashboard URLs before relying on them; keep existing domains
and email addresses unless separately migrated and verified.

Legacy identifiers are intentionally retained where changing them could break compatibility: Supabase migration/schema names (including `ivote-business-schema.sql`), browser-storage keys, the `ivote_` API-key prefix, and the service-worker cache name. Renaming those requires an explicit data/client migration, not a global text replacement.

## Development tools (not hosted-service accounts)

- **Node.js and npm** run the project scripts.
- **Vite** serves and builds the frontend.
- **TypeScript** checks the application during `npm run build`.
- **Vitest** runs tests with `npm test`.

These are project dependencies and do not require service logins.

## Account and secret safety

- If an account owner/login is marked “not recorded,” check with the project owner or use the provider’s team/member page. Do not guess from the app’s sender or Creator email.
- Store credentials only in the provider’s secret manager or Vercel environment variables.
- Rotate a credential immediately if it is exposed. Never add its value to this document.
