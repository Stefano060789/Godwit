# Godwit Eggs

An Egg is a reusable physical-to-digital touchpoint backed by a QR campaign.
Its stable `/qr/<token>` destination can continue to show the same customer
experience while the business changes the polls, information, and other items
attached to it.

## Access methods

- **QR:** print or display the QR code from the dashboard. QR links include
  `?via=qr` so visits can be attributed to QR.
- **NFC:** program a compatible NFC tag with the Egg's NFC link (`?via=nfc`).
  Put a QR code or short instruction beside the tag as a fallback for phones
  that cannot read NFC.
- **Image recognition:** not included. An ordinary image cannot open a link
  through a standard camera without a QR pattern, NFC tag, or recognition
  technology.

Both access links point to the same stable Egg token. Changing its customer
experience does not require replacing the printed QR code or rewriting the NFC
tag. Scan/tap counts are stored separately from submitted feedback.

## Creating an Egg

The public **Quick start** guide offers five business groups and a choice of
starting goals. Category selection is optional. Each goal shows setup, sharing,
and customer-result steps, then opens **Goal** in the dashboard. The selected
category and goal stay in the URL, including through sign-in.

In **Goal**, choose a business type and one or more targets, then enter the Egg's
name and location. **Create Egg** saves those details and opens the new Egg. Business
information is shared across the workspace, while each Egg has its own goal
and location. If shared information exists, this flow enables the assistant on
creation; otherwise add Business Data and enable it in the Egg's assistant
settings. The assistant combines the selected goals to guide relevant next steps.
Godwit also generates and attaches one goal-based poll and one text-response
customer action when the Egg is created. If generation or saving fails, the
creation reports the error and removes any partial setup.
Enquiries use a business-provided contact or booking link,
not a Godwit enquiry inbox. Email capture requires the relevant plan and explicit
consent. Any thank-you benefit must be independent of public reviews.
The **Customer benefits** area links to the existing poll-level email benefit
settings. A voucher or discount is offered only after a customer chooses to
share an email and consents to follow-up. Review links for Google, Tripadvisor,
or other platforms are configured in **Settings**; public reviews are optional
and cannot be exchanged for a reward.

The existing multi-step wizard remains under **Advanced setup**. Both QR and
NFC remain available for every Egg. **Configure NFC** provides a copyable URL
and phone-app instructions. Browsers supporting Web NFC can write a URL record
directly after the operator presses **Write tag**. This replaces existing tag
content; unsupported browsers use an NFC writer app instead.

## Dashboard and connections

The dashboard is a visual hub: **Business Data** and **Goal** on the left,
a central **Eggs** circle with QR/NFC symbols, **Results** on the right, and
**Settings** below. The chosen page opens underneath. `/admin` opens Eggs;
legacy Overview links open Goal. Existing polls, actions, feedback, and
connection URLs remain supported. **More tools** lives inside Settings.

**Business Data** holds notes, imported website snapshots, and Instagram
profile links shared with every Egg. Instagram content is not scraped or
imported: add relevant information as notes. Managers can add or remove up to
eight shared sources. Data is stored in Supabase, not just browser storage.

**Results** summarizes private organizer messages by Egg, including the total
message count and the three most recent messages. Messages may include a
reply email only when the customer chose to provide one. Use the customer
messages view for the full inbox. Poll counts, visit counts, and shared action
status are left to their detailed tools because they do not summarize what
customers are telling the business. AI conversation transcripts and
public-review conversion are not recorded in these results.

Each Egg prominently shows its name, location, target, and access tools.
Its expandable content settings list the default poll and poll items, plus the Actions linked through
the task-to-Egg relationship. Managers can add existing polls and Actions,
create a simple scan Action, or remove a poll item from that Egg. Removing an
item does not delete the poll or change an Egg's legacy default poll. To create
a poll without replacing that default, create it first and then add it to the
Egg. Open a poll for its existing edit and results controls; Action results,
response requirements and notification settings remain in the Action tool.
Information and reward counts reflect existing Egg items. The Egg setup wizard
continues to provide the existing information, review and reward setup.

The legacy default poll is a fallback: an Egg with item entries shows those
items instead, and an Egg with only Actions opens the Action portal first.
Add the default poll as an item if it should appear with other Egg items.
An Egg with one poll item can open the poll directly, so its Actions may not
be visible from that screen; the Action portal link is available separately.

## AI business assistant

Workspace managers can open an Egg's **AI business assistant** setup, import a
public HTTPS website, or add FAQ/business information manually. Review and
remove sources there; website content is imported as a snapshot and should be
re-imported when it changes. Each Egg can have up to eight additional sources, alongside the workspace's
eight shared sources. A goal-created Egg with shared sources enables AI at
creation; legacy Eggs retain their saved settings. Without any sources the
public assistant remains unavailable. Customers
see a disclosure that they are chatting with Claude and should not share
sensitive personal information. Managers can select the feedback topics shown
to customers (such as service, quality, and speed). The assistant can use these
topics along with the Egg's actual polls, information cards, and open tasks to
suggest where the customer can go next. Suggestions are matched against the
Egg's server-loaded options; the model cannot supply a destination URL.

An AI-only Egg can open directly into the assistant without requiring a poll
or information card. Dashboard previews show a non-interactive assistant
placeholder; they do not send chat messages or count customer visits.

Apply `supabase/20261109_multiple_egg_goals.sql` after the workspace business
data migration to store multiple goals per Egg. Existing single goals are
backfilled, and the legacy `goal_key` column remains synchronized for older
readers.

Claude is called only from `api/egg-ai.js`; add `CLAUDE_API_KEY` to the server
environment (never a `VITE_` variable). `CLAUDE_HAIKU_MODEL` can override the
default model `claude-haiku-4-5`. Each request includes a capped amount of
business context and at most four prior messages, and outputs are limited to
280 tokens. Database-enforced limits are five requests per Egg/session/day,
100 requests per Egg/day, 1,000 requests per workspace/month, and 5,000
requests across Godwit/day. Exhausting an allowance stops AI replies while
leaving the rest of the Egg and its contact options available. Failed provider
requests count against the allowance as a conservative spend safeguard.

Importing websites uses Godwit's public-site fetch safeguards and stores a
text snapshot in Supabase. The business is responsible for having permission
to provide its material. AI answers are generated from those sources and
instructed to admit uncertainty; they are not guaranteed correct. For real
customer use, disclose AI processing in the product's privacy information and
confirm the applicable provider/data-processing terms.

## Database migration

Apply `supabase/20261019_eggs_nfc_attribution.sql` and
`supabase/20261019_eggs_ai_assistant.sql` in the Supabase SQL Editor before
deploying these changes. Existing scan events are classified as `qr`; the
migration does not rewrite or remove them. Configure the server-side
`CLAUDE_API_KEY` first. Without the AI migration and key, AI will remain
unavailable; QR/NFC and non-AI Egg features continue to work.

For the visual dashboard and shared data, also apply
`supabase/20261108_workspace_business_data.sql` **before** deploying the
updated API. It adds `qr_campaigns.goal_key`, `business_type`, and the
manager-protected `workspace_ai_sources` table, and extends the existing
AI turn reservation to accept shared sources without changing usage limits.
The migration is additive; existing Eggs and their sources are preserved.
The public campaign function keeps its existing five-column return type,
including the portal title, message, and button label. If an earlier copy of
this migration failed with `42P13`, rerun the corrected full migration; do not
drop the public function separately.
