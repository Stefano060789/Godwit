# On-site issue-report alerts

Visitors can report a service, cleanliness, accessibility, safety, or other on-site issue from an Egg QR page. Reports are saved to the owning workspace. Owners and editors can review recent in-app notifications and configure alert channels under **Admin → Settings → On-site issue alerts**.

## Database setup

Apply `supabase/20261120_issue_reporting_alerts.sql` to the Godwit Supabase project before deploying the matching application code. The migration adds the alert settings, reports, and in-app notification tables, plus the public report and server-only dispatch RPCs.

## Email alerts

Email uses the existing Resend integration. Configure `RESEND_API_KEY` and a verified `REPORT_FROM_EMAIL` in the Vercel environment. A workspace owner/editor must enable email alerts and provide the recipient address in Settings.

## SMS alerts

SMS is optional and may incur Twilio charges. To enable it, configure the following server-only variables in Vercel:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Then enable SMS alerts and provide a recipient phone number in international E.164 format (for example, `+436641234567`) in workspace Settings. Never place provider credentials in client-side `VITE_` variables.

In-app notifications are enabled by default for each workspace unless changed in Settings. Email and SMS are off by default. If a configured external alert fails, the visitor is told the report was saved and advised to contact the business directly for urgent issues. Delivery depends on the migration and provider configuration being in place.
