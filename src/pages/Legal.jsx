import { Link } from "react-router-dom";
import Layout from "../components/Layout";

const LAST_UPDATED = "6 October 2026";

// Fill these in for your business before sending real pilot venues to these
// pages. Nothing else on this page is a placeholder - only these facts are
// specific to you and can't be inferred from the codebase.
const OPERATOR_NAME = "Stefano Bonomi";
const OPERATOR_ADDRESS = "Hausergasse 37/3, Villach, Austria";
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "contact@hellogodwit.com";

function ContactEmail() {
  return <a className="text-blue-300 underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
}

function OperatorNotice() {
  return (
    <p className="rounded border border-slate-600 bg-slate-900 p-4 text-xs text-slate-300">
      <strong>Operator:</strong> {OPERATOR_NAME}, {OPERATOR_ADDRESS}. Replace the bracketed fields above with your
      real business name and address before sending this link to pilot venues - everything else on this page already
      reflects how Godwit actually works.
    </p>
  );
}

function PrivacyNotice() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold">Who is responsible for this data</h2>
        <p>
          Godwit is operated by {OPERATOR_NAME} ("Godwit", "we"). For your own account and workspace settings, we are
          the data controller under the GDPR. For personal data that voters choose to share through your polls
          (an opted-in email, a private message, a prize-draw entry), your workspace is the controller and Godwit
          acts only as a data processor on your instructions - see "Data controller vs. processor" in our Terms of
          Service for what that means for you.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Data we process</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Account &amp; workspace data:</strong> your login email, workspace/company name, logo, brand colors, and team member roles and invitations.</li>
          <li><strong>Poll and vote data:</strong> the questions and answers a workspace configures, and the answers voters submit. Voting itself never requires an account and is not linked to an identity unless a voter chooses to leave contact details.</li>
          <li><strong>Optional voter-provided data, only with explicit consent:</strong> an email address left for follow-up, a prize-draw entry, or return-visit recognition; a free-text message to the organizer with an optional reply email.</li>
          <li><strong>Donation payment data:</strong> if you donate through a workspace's QR code, Stripe (our payment processor) handles your card/wallet details directly - Godwit never sees or stores them. Godwit does receive the donation amount, currency, and, if you provide one at checkout, your email address, in order to record the transaction and calculate our platform fee.</li>
          <li><strong>QR placement/staff labels:</strong> labels a workspace admin assigns to a QR code or a staff member, visible only inside that workspace.</li>
          <li><strong>Billing data:</strong> handled directly by Stripe. Godwit stores only your plan and subscription status, never full card details.</li>
          <li><strong>Technical/error data:</strong> if the workspace operator has enabled it, basic crash reports (Sentry) that may include a stack trace. IP address collection is switched off by default in our error monitoring configuration.</li>
          <li><strong>Local device storage:</strong> a flag on the voter's own device recording that a given poll was already answered, and a couple of small UI preference flags. Not used for cross-site tracking and not shared with third parties.</li>
          <li><strong>Optional website visit measurement:</strong> with your consent, we count public website sessions using a random identifier held in session storage. This counter does not store IP addresses, email addresses, or browsing URLs. Signed-in users and QR voting pages are excluded. Temporary identifiers are removed from the database after 30 days when the next visit is recorded; daily aggregate totals are retained.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Why we process it (legal basis)</h2>
        <p>
          Providing your workspace account and the poll/QR features you configure is necessary to perform our contract
          with you. Capturing a voter's email, prize-draw entry, or private message always requires their explicit,
          separate consent, given through a checkbox at the point of collection - it is never bundled with voting
          itself. Security, fraud prevention, and keeping the service running rely on our legitimate interest in
          operating Godwit safely.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">How long we keep it</h2>
        <p>
          Votes are kept until a workspace configures a shorter automatic retention window (7 to 3,650 days) in
          Settings; a daily background job then permanently deletes votes older than that window. Opted-in voter
          emails and workspace data are kept until the workspace, or the voter directly, asks for deletion.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Who we share data with</h2>
        <p>We use the following processors to run Godwit. We do not sell personal data, and we do not use data collected through your polls for our own marketing.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Supabase</strong> - database, authentication, and file storage</li>
          <li><strong>Vercel</strong> - application hosting and scheduled jobs</li>
          <li><strong>Stripe</strong> - payment processing for paid plans, and for donations (as a Stripe Connect platform)</li>
          <li><strong>Resend</strong> - delivery of transactional and opted-in follow-up emails</li>
          <li><strong>Sentry</strong> - error monitoring, only if the operator enables it</li>
          <li><strong>Google Gemini</strong> - optional AI-generated Creator outreach drafts using publicly available business information, only if the operator enables it</li>
          <li><strong>OpenAI</strong> - optional sentiment tagging and, if configured instead of Gemini, AI-generated Creator outreach drafts</li>
        </ul>
        <p className="mt-2">Some of these providers may process data outside your country; each maintains its own safeguards for international transfers, such as the EU Standard Contractual Clauses.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Your rights</h2>
        <p>
          Subject to applicable law (including the GDPR), you can ask to access, correct, export, or delete your
          personal data, restrict or object to its processing, and withdraw consent at any time. Account holders can
          submit these requests directly from the <Link className="text-blue-300 underline" to="/account">Account</Link> page.
          Voters can withdraw email consent using the unsubscribe link in any email, or by contacting us. Every
          automated marketing email we send includes a working unsubscribe link.
        </p>
        <p className="mt-2">If you are a customer of one of our workspaces (for example, you voted at a venue) and want your data
          deleted, you can contact that venue directly, or reach us at <ContactEmail />
          {" "}and we will assist.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Children</h2>
        <p>Godwit is not directed at children and we do not knowingly collect personal data from anyone below the applicable local minimum age of digital consent (14 in Austria; 16 in most other EU countries unless locally lowered).</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Security</h2>
        <p>Each workspace's data is isolated at the database level, API keys are stored only as one-way hashes, and connections are encrypted in transit. No method of storage or transmission is 100% secure, and we cannot guarantee absolute security.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Changes to this notice</h2>
        <p>We will update the date below when this notice changes and, for material changes, tell workspace owners directly.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>Questions or requests about this notice: <ContactEmail /></p>
      </section>
    </>
  );
}

function TermsOfService() {
  return (
    <>
      <section>
        <h2 className="text-xl font-semibold">Using Godwit</h2>
        <p>By creating a workspace or using a poll link, you agree to these terms. Workspace owners are responsible for their polls, notices, and the lawful use of the responses they collect.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Acceptable use</h2>
        <p>Poll questions, answers, and custom voter answers may not contain political, religious, or sexual content; Godwit screens for this automatically and any voter can report content they believe is inappropriate for manual review.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Data controller vs. processor</h2>
        <p>
          Your workspace is the <strong>data controller</strong> for the personal data your own customers (voters)
          choose to share through your polls - opted-in emails, prize-draw entries, private messages. Godwit is only
          a <strong>data processor</strong>: we store and process that data on your instructions and do not use it
          for our own purposes. You are responsible for having a lawful basis to collect it (the explicit consent
          checkboxes already built into voting exist for this reason) and for responding to your own customers'
          rights requests regarding that data, using the tools provided or by contacting us for help. The one
          exception is donations: because Godwit retains a fee from each donation, we act as an independent party to
          that transaction rather than purely your processor - see "Donations" below.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Prize draws and rewards</h2>
        <p>
          If you enable a prize draw, Godwit automatically shows entrants the official rules (no purchase necessary,
          18+ and locally eligible only, one entry per person, random winner, void where prohibited). You are the
          sponsor of any prize draw or reward you configure and are responsible for complying with the sweepstakes,
          gambling, and consumer-protection laws that apply to you, including any registration or bonding
          requirement for higher-value prizes in your jurisdiction.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Reviews</h2>
        <p>
          Godwit's public review links are shown to every voter regardless of their answer, and no reward may be
          tied to leaving a review, in line with major review platforms' policies. Do not use the reward, message,
          or redemption fields to recreate a gated or incentivized review flow outside the product.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Donations</h2>
        <p>
          If you enable donations, Godwit acts as a payment facilitator using Stripe Connect: a voter's card or
          wallet payment is processed by Stripe, 91% transfers directly to your own connected Stripe account, and
          Godwit retains the remaining 9% as a platform fee. This fee is disclosed to the voter before they pay.
          Unlike other data collected through your polls, Godwit is a party to each donation transaction (not merely
          a processor acting on your instructions), because Godwit itself receives a fee from it. You are responsible
          for completing Stripe's account verification (KYC), for the accuracy of your own account details, and for
          any tax, accounting, or reporting obligations that apply to donations you receive. Godwit is not a bank and
          does not guarantee the timing of Stripe payouts to your account.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Billing</h2>
        <p>Paid plans renew monthly through Stripe until cancelled. Current prices and plan limits are shown in Billing and may change with notice.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Suspension and termination</h2>
        <p>We may suspend or terminate a workspace that violates these terms, including the acceptable-use and prize-draw/review rules above, or that has a seriously overdue balance.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Disclaimers</h2>
        <p>Godwit is provided "as is" during this pilot phase, without warranties of any kind, to the maximum extent permitted by law. Nothing here limits liability that cannot be limited under mandatory law, including statutory consumer rights.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Governing law</h2>
        <p>These terms are governed by Austrian law, and the competent courts at our registered seat have jurisdiction, without prejudice to any mandatory consumer-protection rights you have in your own country of residence.</p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>Questions about these terms: <ContactEmail /></p>
      </section>
    </>
  );
}

export default function Legal({ kind }) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "Privacy notice" : "Terms of service";

  return (
    <Layout>
      <article className="mx-auto max-w-3xl space-y-5 p-2 sm:p-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-xs text-slate-400">Last updated: {LAST_UPDATED}</p>
        <p className="rounded border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400">
          This page is only available in English. If you use Godwit's interface in another language, note that
          this English version is the sole official text and governs in the event of any conflict, ambiguity, or
          translation discrepancy.
        </p>
        <OperatorNotice />
        {isPrivacy ? <PrivacyNotice /> : <TermsOfService />}
        <Link className="text-blue-300 underline" to="/support">Contact support</Link>
      </article>
    </Layout>
  );
}