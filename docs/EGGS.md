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
and customer-result steps, then opens the relevant dashboard tab. The selected
category and goal stay in the URL, including through workspace sign-in. A valid
category also becomes the workspace's saved guide choice; older saved choices
remain supported.

This is a setup guide, not an automatically configured AI goal workflow. The
manager still creates the poll or Egg, adds information, and enables the AI
assistant explicitly. Enquiries use a business-provided contact or booking link,
not a Godwit enquiry inbox. Email capture requires the relevant plan and explicit
consent. Any thank-you benefit must be independent of public reviews.

Choose **Create Egg**, enter its name and optional placement, then select QR,
NFC, or both for the setup instructions. Both is recommended so customers have
a fallback. The selection guides the setup screen; it does not disable either
method. The dashboard keeps both links available so the business can add or
switch access methods later.

## Dashboard and connections

The main dashboard navigation is **Overview**, **Eggs**, **Results**, and
**Workspace**. Existing `tab=engagement`, `tab=feedback`, and `tab=settings`
links still open those sections. **More tools** retains the legacy polls,
actions, and connection screens, including polls not attached to any Egg.

Each Egg lists its default poll and poll items, plus the Actions linked through
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
re-imported when it changes. Each Egg can have up to eight sources. The
assistant stays off until a source is added and a manager enables it. Customers
see a disclosure that they are chatting with Claude and should not share
sensitive personal information. Managers can select the feedback topics shown
to customers (such as service, quality, and speed). The assistant can use these
topics along with the Egg's actual polls, information cards, and open tasks to
suggest where the customer can go next. Suggestions are matched against the
Egg's server-loaded options; the model cannot supply a destination URL.

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
