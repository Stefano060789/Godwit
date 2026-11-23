# Privacy and provider inventory

## Scope and evidence

This is a source-code inventory for the Godwit repository, not a statement that every integration is configured or active in production. Provider dashboards, deployed environment variables, contracts, retention settings, data regions, and subprocessors were not inspected. A feature described as available below means a transfer path exists in code; it does not confirm deployment configuration or legal readiness.

The repository's `dpa/` folder contains PDFs titled for Resend, Stripe, Supabase, and Vercel. Their contents, currency, applicability, signatory/entity, and execution or acceptance status were not reviewed; their presence is not treated as an approved or current DPA.

Google Places prospect research and reputation refresh are disabled in code. The research route/job returns an explicit disabled result and logs it; snapshot refresh returns HTTP 503 with a stable disabled code. Client helpers reject reputation-history reads and refreshes, and the settings UI no longer loads or displays historical ratings or Place ID settings. Existing Place IDs, prospect rows, and reputation snapshots are retained; the disabled paths do not delete stored rows. Previously stored Creator prospects remain accessible in that separate queue and can be changed through its existing management actions. Google Cloud Translation is a separate integration and remains in code.

## Provider data flows

| Provider / path | Code status | Data transferred and purpose | Owner verification still required |
| --- | --- | --- | --- |
| **Supabase** | Core database and authentication paths are present. | Account identifiers and email; workspace, team, poll, vote, response, consented lead, moderation, analytics, billing-reference, and settings data for app operation. Server-side jobs also read/write records using service credentials. | Confirm project region, DPA/processor terms, backups, logs, retention/deletion behavior, access controls, and subprocessors. |
| **Vercel** | Hosting, API routes, and scheduled jobs are present. | Application requests and responses, deployment/runtime metadata, and server-side processing of the data passed through API and cron paths. Hosting logs may contain request/error details depending on deployment settings. | Confirm production/preview regions, log retention, access policy, DPA, subprocessors, and what request/response data is logged. |
| **Resend** | Email paths are available behind purpose gates. | Recipient addresses and email content for support/product-feedback notifications, content-report alerts, weekly reports, data-export delivery, Stripe reconciliation alerts, and consented voter nurture/win-back. Nurture requires a recorded consent timestamp and a matching profile not marked unsubscribed. No cold/prospect purpose is accepted. | Confirm sender/domain setup, region, DPA, retention, suppression handling, subprocessors, and the legal basis/consent records for each marketing flow. |
| **Google / Gmail** | Google Places disabled; Translation and Creator SMTP/IMAP remain in code. | Translation sends submitted text (limited by the endpoint to 1,000 characters) and target language to Google. Creator SMTP sends reviewed prospect messages and contact details; Gmail IMAP reads reply messages, and matched reply sender, subject, body, and message metadata are stored in Supabase and may be forwarded to the configured internal notification address. | Confirm the translation project’s processing region and terms. Separately confirm Gmail account access, mailbox scope, retention, and the basis/controls for any Creator prospect outreach. |
| **SerpApi** | Optional public-email lookup for existing Creator records. | Search terms can contain a business name, country/city, and website context to locate a public business email. | Confirm whether this optional feature should remain enabled, provider account/region/retention, terms, and usage billing. |
| **Google Gemini / OpenAI** | Optional AI-assisted Creator draft generation; OpenAI also supports sentiment classification. | Draft generation can send a business name, business type, location, listed website content, and prior draft context. Sentiment classification sends a short submitted answer (up to 500 characters) for labeling. | Confirm which provider is enabled, model/region, DPA, retention/training settings, subprocessors, and whether the transmitted content is appropriate for the intended purpose. |
| **Anthropic Claude** | Optional public Egg AI assistant. | Customer prompt/history, configured business information, poll/action options, and business-provided website source text are sent to generate an answer and suggested actions. | Confirm provider/model region, DPA, retention/training settings, subprocessors, and the disclosure shown to visitors. |
| **Stripe** | Checkout, subscription, webhook, and reconciliation code exists; runtime feature gates/configuration were not inspected. | Subscription and billing identifiers, customer email, and payment-related data needed for checkout and reconciliation. Payment entry is handled through Stripe-hosted checkout in the source flow. | Confirm whether billing is enabled, account/merchant status, processing region, DPA, retention, and webhook access. No checkout or account action was performed for this review. |
| **Sentry** | Optional browser/server error reporting. | Error messages, stack/runtime context, and associated event metadata may be sent for diagnostics; source review did not verify PII scrubbing or sampling configuration. | Confirm DSN activation, region, scrubbing, retention, DPA, access, and subprocessors. |
| **Workspace-configured webhooks** | Optional Growth feature; destination is customer-configured. | Selected event records are re-fetched from Supabase and posted to a configured HTTPS endpoint; payloads can contain vote text, consented lead email, or content-report data depending on the event. | Confirm customer notice/authorization, endpoint ownership, payload minimization, delivery retries/logs, and retention at the receiving system. |
| **Public business websites** | Server-side fetches support email lookup and AI context import. | Requests go to URLs supplied or previously stored for public business sites; requested pages and extracted text are used for business-contact lookup or AI context. | Confirm the applicable privacy notice, URL safety controls, cache/log retention, and whether site owners’ published content is sent onward to search/AI providers. |

## Release gates requiring owner confirmation

### Optional AI continuation after voting

Visitors can opt into **Continue with AI** after a saved vote. The notice states that selected
predefined choices will be shared with the AI to provide a relevant next step; free-text poll answers
are not included. No AI request is triggered merely by voting. The server validates the poll's
Egg/session association and checks choices against the public poll before sending its question and
selected choices to Claude. This transfer serves the visitor's requested guidance and the configured
Egg goal, not advertising, training or contact collection. The owner must document the legal basis
and ensure the visitor-facing AI/provider notice remains accurate.
After the visitor chooses to share, up to three selected predefined poll responses are retained in
the open page's memory and may be sent again to Claude with later visitor-initiated chat requests
in the same conversation. They are not sent merely because a vote was cast, nor added to persistent
chat storage by this feature. Reloading or leaving the page clears this in-memory context. Existing
vote and poll-session records have their own retention rules.
AI interest-poll session hashes remain server-only, acquire a 30-day expiry, and are deleted by
the authenticated daily `purge-egg-ai-sessions` cron. New multi-select votes reuse the existing
vote storage and retention; this change does not introduce new identity fields.

### Manager-only business research

Optional Gemini Search grounding sends only the public business name, manager-specified public location,
selected topic and (for artwork research) public artwork/artist identity. This purpose is helping an adult
workspace manager inspect public business information, not profiling visitors or reusing customer conversations.
Activation requires `GOOGLE_RESEARCH_PROVIDER_APPROVED=1` after the owner documents the legal basis,
paid-provider DPA/terms, transfers/regions and notice. This flag records a deployment prerequisite, not legal clearance.
No visitor chat, feedback, issue report, manager email or account token is sent to Google.
The result is returned with `Cache-Control: no-store`, displayed with citations and search suggestions to the
requesting manager, and not saved, cached as business knowledge, or forwarded to Claude.
Component state is discarded when cleared/unmounted. Google's Search grounding terms retain grounding inputs
and output for 30 days even with stateless interaction storage. Confirm current terms before enabling.

`business_research_usage` stores workspace UUID, UTC week, request count and creation/expiry timestamps
solely for billing-abuse protection, with server-only access and 56-day retention.
The daily authenticated cron deletes expired counters, and deleting a workspace cascades deletion.
The existing account export/delete flows must continue to cover workspace deletion; this feature introduces
no new visitor or manager identifiers. Monitor cleanup failures through the existing cron error channel.
Shared business notes/imports remain under their existing storage controls; do not paste Google grounded
results into them to build a reusable database.

Before commercial release, the owner must verify and record for every provider that will be enabled:

- The correct contracting entity, controller/processor roles, current DPA, subprocessor list, and any required cross-border transfer terms.
- The production and backup data regions, log regions, and the provider’s configured retention/deletion periods.
- What personal data reaches each provider, whether minimization and PII redaction are adequate, and what notice/consent or other lawful basis is relied upon.
- Which optional integrations are actually enabled in production, including AI, Sentry, SerpApi, Stripe, and customer webhooks.
- Whether Creator prospect outreach remains enabled through Gmail SMTP; this change does not disable that separate path.

No DPA, regional setting, retention period, consent, purchase, account creation, provider setting, or legal acceptance is confirmed by this source review. These are owner-only release gates, not assumed approvals.
