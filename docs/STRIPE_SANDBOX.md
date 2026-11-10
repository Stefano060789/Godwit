# Godwit Stripe subscription sandbox

This document covers the **legacy Starter/Growth test-only integration**, not the
new interaction packages. See [ROI_SETUP.md](ROI_SETUP.md#stripe-checkout) for the
separately enabled interaction billing implementation and deployment requirements.

This is **test-only integration code**, not a claim that keys, deployment settings,
webhook endpoints, or signing secrets have been provisioned. Live billing remains
unsupported. The free-pilot UI is unchanged; sandbox checkout requires a signed-in
workspace owner/editor calling `POST /api/create-checkout-session` with
`{"mode":"subscription","plan":"starter"}` or `"growth"` and their Supabase bearer token.

## Shared account and public catalogue

The approved shared test account is `acct_1UQsxxC5ufGRzg9R`. Muse and AdventureBook
also use that account. Godwit's public Price and Product IDs are pinned in
`lib/stripeSandbox.js`: Starter EUR 29/month and Growth EUR 79/month, quantity one.

| Plan | Test Product ID | Test monthly Price ID | Amount |
| --- | --- | --- | --- |
| Starter | `prod_VZz3nie3Csda5A` | `price_1UYp5jC5ufGRzg9RpDhQdAl5` | EUR 29/month |
| Growth | `prod_VZz5Z2tJToSc6N` | `price_1UYp7CC5ufGRzg9RnA4pt2On` | EUR 79/month |

These public catalogue IDs were browser-verified in the approved test account.
They do not enable billing or imply that deployment secrets/webhooks exist.
The server checks the account and retrieves the price before creating checkout.
Legacy `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_GROWTH` environment variables are not
used and cannot override the allowlist. No portal/payment-management endpoint is
provided; donation checkout and Connect onboarding/status remain blocked.

## Manual server environment setup

Use the deployment provider's secret settings or a securely managed local environment.
Never paste API keys or signing secrets into chat, source, logs, screenshots, or browser
variables. No Stripe value should be prefixed `VITE_`.

| Variable | Required setting |
| --- | --- |
| `BILLING_ENABLED` | Exact `1`, only in the intended isolated test deployment. |
| `STRIPE_SANDBOX_ENABLED` | Exact `1` as the independent sandbox opt-in. Missing or any other value blocks checkout, webhooks, and Stripe reconciliation. |
| `STRIPE_SECRET_KEY` | A **test** secret or restricted API key for the approved account, with the permissions needed to retrieve account/prices/subscriptions and create Checkout Sessions. Live, missing, or malformed keys are rejected before network calls. |
| `STRIPE_WEBHOOK_SECRET` | The signing secret for **Godwit's own test platform webhook endpoint** below. This is separate from the API key. |
| `APP_URL` | Canonical HTTPS test app origin. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | The intended test database/auth project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only test database service key for webhook persistence. |
| `STRIPE_SANDBOX_SUPABASE_URL` | Explicit HTTPS URL of the isolated sandbox Supabase project. Must exactly match the effective server `SUPABASE_URL` (or its `VITE_SUPABASE_URL` fallback); a mismatch blocks operations before network calls. |
| `STRIPE_SANDBOX_ISOLATED_STORAGE_ACK` | Exact `1`, set only after verifying that the named project and its auth/service keys are isolated from production entitlements. Missing or any other value blocks operations. |
| `STRIPE_TAX_ENABLED` | Leave unset or `0`. Sandbox always sends `automatic_tax[enabled]=false`, even if this variable is accidentally `1`. |

Use an isolated test Supabase project: accepted sandbox events update subscription
entitlements. The URL match and explicit storage acknowledgment prevent silent use
of a deployment's default database, but cannot independently prove that an operator
has not mislabeled a production project. Verify the project identity and every
Supabase key before acknowledging isolation; never acknowledge a production database.
Do not configure the sandbox storage variables in production.
Neither opt-in authorizes real customer charging, guest donations,
Connect transfers, tax automation, a public launch, or changes to the pilot UI.
Disable either opt-in to stop all supported Stripe operations. This is not a switch
to live mode; live deployment requires a separately reviewed implementation.

## Manual webhook endpoint setup

1. In the approved account's **test mode**, manually create a **Godwit-specific**
   platform/“Your account” endpoint at `https://<godwit-test-host>/api/stripe-webhook`.
2. Subscribe only to `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Store **that endpoint's** signing secret as Godwit's `STRIPE_WEBHOOK_SECRET`.
   Muse and AdventureBook must each use their own endpoint and signing secret.
   Do not reuse their secrets; do not use a Connect endpoint secret.
   `STRIPE_CONNECT_WEBHOOK_SECRET` is not accepted by this sandbox.
4. For local forwarding, the CLI listener's signing secret is different from the
   Dashboard endpoint secret. Use it only in the local environment, never overwrite
   the deployed endpoint secret with it.
5. Redeploy after setting environment variables. Manually exercise both plans using
   Stripe's documented test payment details, then inspect test event delivery and
   the isolated database. Do not enter real payment details.

Both checkout and subscription metadata carry `app=godwit`,
`billing_environment=sandbox`, `workspace_id`, and `plan`. A valid webhook signature
alone does **not** establish app ownership on the shared account. Foreign/unmarked
events, unsupported types, donations, and connected-account events are acknowledged
without any database writes (including audit writes). Live or missing-mode events
are rejected. Godwit subscription events must match the pinned price/product,
amount, EUR currency, monthly recurrence, quantity and metadata. Checkout completion
retrieves and validates the subscription before persistence, preserving `trialing`.
Owned subscription deliveries and reconciliation also verify the API key's account
identity before database writes; foreign events are ignored without account API calls.
Legacy unmarked donation/Connect history is deliberately not replayed into this
sandbox; handle any historical reconciliation separately.

Webhook signatures have a five-minute tolerance. Successfully processed duplicate
events are skipped; incomplete deliveries can retry the idempotent subscription
upsert. Keep the host clock synchronized. Account verification, price checks, and
test-only response checks fail closed; an API error is never authorization to
continue with a guessed price or live object.

## Validation

Run `npm test -- tests/api/create-checkout-session.test.js tests/api/stripe-webhook.test.js lib/stripeSandbox.test.js`
and `npx tsc --noEmit`. These are mocked behavioral tests, not evidence that a
remote endpoint, deployment, account permission, or secret has been configured.
