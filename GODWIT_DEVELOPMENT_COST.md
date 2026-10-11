# Godwit development cost evaluation

Prepared: 7 October 2026  
Currency: EUR  
Purpose: distinguish money actually spent, founder time, and the hypothetical
cost of commissioning a comparable product.

## 1. Executive summary

**Godwit's actual historical development cost is not currently known.**
The repository does not provide invoices, paid subscription totals, contractor
payments, or a record of founder hours. It would be misleading to present a
precise amount as money already spent.

For evaluation purposes, a rough bottom-up estimate for commissioning a
comparable implementation is **540-1,020 engineering hours**. At an assumed
blended rate of **EUR 70/hour**, this implies **EUR 37,800-71,400**, excluding
VAT, recurring services, marketing, and the contingency described below.

These are planning assumptions, not recorded hours, supplier quotations,
verified market rates, or a valuation of the business. AI-assisted development
may substantially reduce effort in some areas, but its actual savings cannot
be measured from commit history.

| Question | Answer |
| --- | --- |
| How much cash have we actually spent? | Unknown until invoices and payments are reconciled |
| How much founder time have we invested? | Unknown until hours are estimated or recorded |
| What could a comparable commissioned build cost? | Illustrative EUR 37,800-71,400 at EUR 70/hour |
| What is Godwit worth as a business? | Not established by development cost |
| What would it cost to build only a simpler MVP? | Requires a smaller, explicitly agreed feature scope |
| Which development agent was used? | AI assistant using Copilot SDK in VS Code; observed model labels listed below |
| How many AI credits were used? | Unverified; project-attributed billing/usage records are needed |
| What is the agent's market price? | Unverified; depends on plan, billing date, model and usage unit |

### AI development agent, credits, and pricing

This section records only what is visible in this conversation. It is not a
complete inventory of every model used throughout Godwit's development.

| Item | Information | Evidence / status |
| --- | --- | --- |
| Development agent | AI assistant using Copilot SDK in VS Code | Confirmed for this conversation |
| Earlier observed model label | `gpt-5.6-luna` | Conversation's model-switch notice on 6 October 2026 |
| Later observed model label | `gpt-6.1-sol` | Same notice records a switch to this model |
| Credits used for this conversation | Unknown | No usage meter or billing export supplied |
| Credits used for all Godwit development | Unknown | Cannot be reconstructed from commits or message counts |
| Subscription plan and included allowance | Unverified | Account billing details not supplied |
| Market subscription price | Unverified | No current official plan price verified |
| Extra-credit / usage-unit price | Unverified | Depends on the provider's actual billing scheme |
| Actual AI development expenditure | Unknown | Requires invoices, credits, refunds and project allocation |

The model labels identify observed selections, not independently verified
public API product names or pricing tiers. Do not assign an OpenAI API token
price to these labels or assume that the agent's billing matches API billing.

**Development AI and application AI are separate costs.** The assistant used
to build Godwit is distinct from Godwit's own OpenAI/Gemini calls for outreach
and sentiment classification. Record them separately, even when a provider
appears in both workflows.

#### Usage ledger to complete

Use the actual unit shown on each provider's export. Credits, requests and
tokens are not interchangeable, and different models may have different
charging rules.

| Period | Service / plan | Agent or model | Billing unit | Godwit units used | Included units applied | Extra units charged | Unit price and currency | Actual Godwit cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Development period | Copilot SDK / account plan: unverified | Observed labels above; full history unknown | Unverified | Unknown | Unknown | Unknown | Unverified | Unknown |
| Application usage period | OpenAI API, if billed | Confirm using usage export | Confirm from invoice | Unknown | Unknown | Unknown | Unverified | Unknown |
| Application usage period | Gemini API, if billed | Confirm using usage export | Confirm from invoice | Unknown | Unknown | Unknown | Unverified | Unknown |

For each price, record its official source, date, currency, tax basis and plan.
Historical spending should use historical invoices, not today's advertised
market price. Account-wide usage must be allocated to Godwit before it is
presented as a project total.

```text
Actual development-agent cash cost
  = Godwit share of subscription payments
    + Godwit extra-usage charges
    - attributable refunds and credits

Illustrative market purchase cost
  = required subscription periods x verified plan price
    + chargeable extra units x verified extra-unit price
```

Use the second formula only if the verified plan actually has this charging
structure. Included credits are not an additional cash charge. Do not count
both a credit top-up purchase and the same credits' consumption as two expenses.
If comparing retail value of consumed credits with actual payments, show it as
a separate hypothetical figure rather than adding it to actual expenditure.

No numerical AI-credit total or agent market price is asserted in this report.
Those entries remain explicitly unverified until usage and pricing evidence
is available.

## 2. Evidence and limitations

Repository observations on the preparation date:

- Earliest reachable commit: 2 September 2026, `fdc90fd`,
  "Replace old project with real Vite project."
- Latest committed change: 7 October 2026, `473a752`,
  "Add consented website visits counter to Creator."
- 285 reachable commits.
- 21 files under `src/pages`, 12 serverless API JavaScript files, and 50 SQL
  files under `supabase`.
- Stack includes React, Vite, Supabase/PostgreSQL, Vercel, Stripe, email
  integrations, and optional AI integrations.
- Services and configuration are documented in
  [TOOLS_AND_ACCOUNTS.md](docs/TOOLS_AND_ACCOUNTS.md).

These counts are scope indicators only. A commit is not an hour of work, a SQL
file is not necessarily an applied production migration, and code existence
does not prove a feature is production-ready. Work before the first commit,
uncommitted work, design, customer discussions, and operational effort may not
be represented.

This is not a full technical audit. Remaining defects, security review,
accessibility work, release hardening, and feature readiness could change a
supplier's estimate. No billing dashboards or financial records were accessed
for this report.

## 3. Illustrative replacement effort

Estimate for a competent developer/team using existing libraries and managed
services, recreating comparable scope rather than copying every historical
iteration. The work buckets are intended not to overlap.

| Work bucket | Scope | Assumed hours |
| --- | --- | ---: |
| Foundation and delivery setup | Architecture, app setup, deployment, environments | 40-80 |
| Core product and workspace experience | Accounts, workspace flows, polls, QR experiences, responses, dashboard and presentation | 120-200 |
| Database and access control | Schema, migrations, RPCs, authorization, data lifecycle | 80-160 |
| Commercial and engagement integrations | Subscription/payments, donation flows, notifications and follow-up features | 100-200 |
| Creator operations and outreach | Business research, AI drafts, email workflow, replies, operational reporting and visit counter | 60-120 |
| Localization, theme and responsive refinements | Cross-cutting presentation and usability work | 40-80 |
| Testing and release stabilization | Integration verification, edge cases, debugging, documentation and handoff | 100-180 |
| **Total assumed effort** | | **540-1,020** |

At 40 engineering hours per week, that is approximately 13.5-25.5 person-weeks.
It is not a delivery promise: meetings, parallel work, availability, and
external dependencies affect calendar duration.

### Rate sensitivity

The rates below are chosen scenarios, not researched supplier prices.

| Assumed hourly rate | 540 hours | 1,020 hours |
| --- | ---: | ---: |
| EUR 40/hour | EUR 21,600 | EUR 40,800 |
| EUR 70/hour | EUR 37,800 | EUR 71,400 |
| EUR 100/hour | EUR 54,000 | EUR 102,000 |

For budgeting, an illustrative additional 20% contingency at EUR 70/hour gives
**EUR 45,360-85,680**. Do not add this contingency to historical invoices; it is
only an allowance for uncertainty in a hypothetical future commissioned build.

Excluded: VAT, hosting/API charges, acquisition campaigns, professional legal
or tax advice, new hardware, and ongoing maintenance after handoff.

## 4. Calculate actual cash spent

Enter actual payments from invoices and bank/card records, not current
advertised plan prices. A service may be on a free tier; its presence in the
repository does not prove it incurred a charge.

| Expense category | Source to check | Paid amount (EUR) |
| --- | --- | --- |
| Developer or contractor payments | Contracts, invoices, bank transfers | Not supplied |
| AI development assistant | Copilot/ChatGPT/other subscription invoices; allocate the Godwit share | Not supplied |
| Vercel | Billing history and usage invoices | Not supplied |
| Supabase | Billing history and usage invoices | Not supplied |
| Domain and DNS | Registrar renewals and any paid DNS/security plan | Not supplied |
| OpenAI / Gemini | API billing and actual usage charges | Not supplied |
| Google Places / Translate | Google Cloud invoices and credits | Not supplied |
| SerpApi | Subscription and usage invoices | Not supplied |
| Resend / email services | Invoices for paid services, if any | Not supplied |
| Sentry | Paid monitoring invoices, if any | Not supplied |
| Design/assets/software | Purchased assets, editing tools, other project tools | Not supplied |
| Project-specific hardware | Actual project allocation, not automatically full purchase price | Not supplied |
| **Actual cash total** | Sum documented project-attributable payments | **Not yet calculated** |

Reconciliation rules:

- Separate development-period spending from ongoing operating costs.
- Allocate shared subscriptions fairly rather than charging all personal use
  to Godwit.
- Deduct refunds and credits; do not count credit purchases and the same usage
  again.
- Convert non-EUR payments using the actual settled amount or a consistent
  documented exchange-rate method.
- Use a consistent gross/net VAT basis. Confirm recoverability with an
  accountant.
- Stripe transaction fees are normally operating/payment costs, not the cost
  of writing the application.

## 5. Value founder time separately

Unpaid time has an economic cost, but it is not a cash payment.

| Person / activity | Estimated hours | Chosen value per hour | Economic cost |
| --- | ---: | ---: | ---: |
| Stefano: product, development, testing and operations | To enter | To enter | Hours x rate |
| Mariia: project work, if applicable | To enter | To enter | Hours x rate |
| Other unpaid contributors, if applicable | To enter | To enter | Hours x rate |

Illustration only: 200 founder hours at EUR 30/hour would equal EUR 6,000 of
opportunity cost. This is not an estimate of hours actually worked.

Use calendar sessions, notes and milestones to reconstruct time. Commit dates
can help locate activity but cannot determine its duration.

**Economic investment = actual project cash spent + unpaid time at your chosen
rate.** Do not count paid developer time again as unpaid founder time.

## 6. Ongoing costs and commercial evaluation

Keep a separate monthly operating budget:

- Hosting/database/authentication/storage.
- AI, search and translation usage.
- Email delivery and monitoring.
- Domain cost allocated monthly.
- Maintenance/support time.
- Payment processing fees.
- Marketing campaigns and content production.

There is insufficient information here to state a reliable monthly total.
Check current provider plans and actual usage; free credits and free tiers
should not be assumed to last indefinitely.

For business planning:

```text
Monthly contribution per customer
  = monthly revenue excluding VAT
    - attributable payment, usage and support costs

Operating break-even customers
  = monthly fixed operating costs / monthly contribution per customer

Customers needed to recover investment over N months
  = (monthly fixed operating costs + chosen investment amount / N)
    / monthly contribution per customer
```

Round customer counts upward. These formulas assume positive contribution and
omit churn, tax, financing and growth timing. Do not treat projected recovery
as guaranteed revenue.

Development expenditure does not establish resale value. Business value also
depends on paying customers, retention, margins, growth, intellectual-property
ownership, reliability, and the work required to maintain the product.

## 7. Evaluation checklist

- [ ] Choose the period being measured, including pre-repository work if any.
- [ ] Collect invoices and actual payments for all relevant services.
- [ ] Enter contractor payments and allocate shared tools.
- [ ] Estimate founder hours separately and choose an opportunity-cost rate.
- [ ] Calculate actual cash total and total economic investment.
- [ ] Separate recurring operating costs from initial development cost.
- [ ] Obtain two or three comparable supplier quotes if replacement cost matters.
- [ ] Review readiness and remaining work before using this estimate in negotiations.
- [ ] Compare customer contribution and retention against operating costs.

**Bottom line:** use EUR 37,800-71,400 only as an illustrative commissioned-build
scenario at EUR 70/hour. Godwit's actual historical cash cost remains unknown
until the records above are filled in.
