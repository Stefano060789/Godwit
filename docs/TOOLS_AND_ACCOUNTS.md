# Godwit tools, services, and account access

This is an operational handoff for the Godwit application. It records what each service does, which login identifiers are known from the project, and where its configuration is managed. It intentionally does not contain passwords, API keys, recovery codes, or other secrets.

See [the privacy/provider inventory](./PRIVACY_PROVIDER_INVENTORY.md) for source-observed data flows and owner-only release checks, and [the license/source inventory](./LICENSE_SOURCE_INVENTORY.md) for installed direct dependency metadata and asset provenance gaps.

## Main services

| Service | Why the project uses it | Login/account identifier known here | Configuration and notes |
| --- | --- | --- | --- |
| **Vercel** | Hosts `https://hellogodwit.com`, deploys the app from GitHub, and runs the serverless API and scheduled jobs. | Team/account scope: `bonomistefano123-6506`; project: `godwit`, renamed from `i-vote` on 11 October 2026 with the same project ID. | Project environment variables and deployment logs are managed in the Vercel dashboard. Set production secrets there and redeploy after changing them. |
| **Cloudflare (domain/DNS, if configured)** | May manage the `hellogodwit.com` domain's DNS, proxy, or security settings in front of Vercel. The application source does not confirm that Cloudflare is currently active for this domain. | Cloudflare account login is not recorded in the repository. | Check the domain's nameservers at the registrar and the DNS records in Cloudflare. Keep Vercel as the app host unless the deployment setup is intentionally changed. |
| **Supabase** | PostgreSQL database, authentication, Row Level Security, and application RPC functions. | Creator sign-in emails: `bonomistefano@outlook.it` and `afelix470@gmail.com`. The Supabase dashboard owner email is not recorded here. | The project URL and keys are environment variables. The service-role key must remain server-only. The migration `supabase/20261004_add_creator_access.sql` must be run in the SQL Editor to grant the additional Creator access in the database. |
| **GitHub** | Source control and the deployment source for the app. | Owner `Stefano060789`, repository [`Stefano060789/Godwit`](https://github.com/Stefano060789/Godwit); local `origin` is `https://github.com/Stefano060789/Godwit.git`. Renamed from `iVote` on 11 October 2026. | Push changes to `main`; Vercel's Git connection was refreshed to the renamed repository and the production deployment verified. |
| **Google / Gmail** | Google Places prospect research and rating refresh are disabled in code. Google Cloud Translation remains available; Gmail SMTP sends Creator outreach and Gmail IMAP checks for replies. | Outbound Creator mail account: `hellogodwit@gmail.com`. The Google Cloud project owner/login is not recorded here. | Translation uses `GOOGLE_TRANSLATE_API_KEY`. Gmail SMTP/IMAP use the existing server-only `OUTREACH_SMTP_PASSWORD` and `OUTREACH_SMTP_USER`. A Places key, if still configured externally, does not re-enable the feature. Never use or store the normal Gmail password in the app. |
| **SerpApi** | Searches public Google results for business contact emails on previously stored Creator prospect records; it no longer discovers prospects through Google Places. | SerpApi account email is not recorded here. | `SERPAPI_API_KEY` is a server-only Vercel variable. The key was configured by the project owner; public search may incur provider usage charges. |

## Additional and optional integrations

| Service | Why / when it is used | Login/account identifier known here | Configuration |
| --- | --- | --- | --- |
| **Stripe** | Explicitly opted-in test subscription sandbox only, on shared account `acct_1UQsxxC5ufGRzg9R`. Donation/Connect flows and their webhook history processing remain blocked in the sandbox. | Stripe dashboard login is not recorded here. | `STRIPE_SECRET_KEY` must be test-only; `STRIPE_WEBHOOK_SECRET` must be Godwit's separate test endpoint secret. Both `BILLING_ENABLED=1` and `STRIPE_SANDBOX_ENABLED=1` are required. Public catalogue IDs are pinned in `lib/stripeSandbox.js`; see [STRIPE_SANDBOX.md](STRIPE_SANDBOX.md) for manual configuration. |
| **Resend** | Transactional notifications/reports and consent-based lead follow-up. Code accepts only transactional-notification and consented-marketing purposes; cold/prospect outreach is blocked. | Resend account login is not recorded here. | `RESEND_API_KEY` and sender `REPORT_FROM_EMAIL`. This is separate from Gmail Creator outreach; provider configuration and sender verification are not confirmed here. |
| **Twilio** | Optional SMS alerts for on-site Egg issue reports. | Twilio account login is not recorded here. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` are server-only Vercel variables. SMS is provider-billed; configure only if the workspace wants SMS alerts. |
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
- `CLAUDE_API_KEY` (server-only; required for the optional Egg AI assistant)
- `CLAUDE_HAIKU_MODEL` (optional server-side model override; defaults to `claude-haiku-4-5`)

The current Creator email allowlist includes `bonomistefano@outlook.it` and `afelix470@gmail.com` in the application. The Supabase allowlist is database-backed; run the migration listed above for the additional user.

### Outreach email and prospect discovery

- `OUTREACH_SMTP_PASSWORD` — Gmail App Password for `hellogodwit@gmail.com`, not its normal password.
- `OUTREACH_SMTP_USER` — Gmail account used by the IMAP reply monitor; use `hellogodwit@gmail.com`.
- `SERPAPI_API_KEY` — public web search fallback for business contact email discovery.
- `OUTREACH_NOTIFICATION_EMAIL` (optional reply-monitor notification destination).
- `SUPPORT_TO_EMAIL` (optional support/notification destination).

Google Places is disabled in code; do not configure a new `GOOGLE_PLACES_API_KEY` for this product. Existing workspace Place IDs and reputation snapshots remain stored and are not displayed or refreshed.

### Other feature-specific variables

- Google Translate: `GOOGLE_TRANSLATE_API_KEY`
- Stripe sandbox: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_ENABLED`, `STRIPE_SANDBOX_ENABLED`, `STRIPE_SANDBOX_SUPABASE_URL`, `STRIPE_SANDBOX_ISOLATED_STORAGE_ACK`; explicit isolated storage is required, tax automation is forced off, legacy price env overrides and Connect secrets are not used.
- Resend: `RESEND_API_KEY`, `REPORT_FROM_EMAIL`
- On-site issue-report SMS (optional): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
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
