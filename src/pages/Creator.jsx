import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import { isCreatorEmail } from "../lib/creatorAccess";
import { getOutreachLanguageLabel, OUTREACH_LANGUAGES } from "../../lib/cron/outreachCopy.js";
import { RESEARCH_BUSINESS_TYPES, RESEARCH_COUNTRIES } from "../../lib/cron/researchOptions.js";
import {
  filterHiddenOutreachContacts,
  getOutreachContactIds,
  groupOutreachContactsByCountry
} from "../lib/outreachDisplay.js";

async function getCreatorSession() {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (!data.session?.access_token) {
    throw new Error("Your Creator session has expired. Sign in again and retry.");
  }
  return data.session;
}

const LANGUAGE_OPTIONS = [
  ["auto", "Automatic by country"],
  ...OUTREACH_LANGUAGES.map((language) => [language, getOutreachLanguageLabel(language)])
];

const HIDDEN_REVIEWED_OUTREACH_KEY = "godwit-hidden-reviewed-outreach";
const OUTREACH_PAGE_SIZE = 5;

function getHiddenReviewedOutreachIds() {
  const saved = window.localStorage.getItem(HIDDEN_REVIEWED_OUTREACH_KEY);
  if (!saved) return new Set();
  try {
    const ids = JSON.parse(saved);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

const METRICS = [
  ["users", "Registered people"],
  ["venues", "Venues"],
  ["members", "Workspace members"],
  ["polls", "Polls"],
  ["active_polls", "Active polls"],
  ["qr_codes", "QR codes"],
  ["active_qr_codes", "Active QR codes"],
  ["actions", "Actions"],
  ["open_actions", "Open actions"]
];

const VENUE_METRICS = [
  ["member_count", "Members"],
  ["poll_count", "Polls"],
  ["active_poll_count", "Active polls"],
  ["qr_count", "QR codes"],
  ["active_qr_count", "Active QR"],
  ["action_count", "Actions"],
  ["open_action_count", "Open actions"]
];

function formatDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB") : "Not set";
}

function isValidRecipientEmail(value) {
  const email = String(value || "").trim();
  return email.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export default function Creator() {
  const [authorized, setAuthorized] = useState(null);
  const [overview, setOverview] = useState(null);
  const [websiteVisits, setWebsiteVisits] = useState(null);
  const [websiteVisitsError, setWebsiteVisitsError] = useState("");
  const [websiteVisitsLoading, setWebsiteVisitsLoading] = useState(false);
  const [pilotEndDate, setPilotEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outreachContacts, setOutreachContacts] = useState([]);
  const [hiddenReviewedOutreachIds, setHiddenReviewedOutreachIds] = useState(getHiddenReviewedOutreachIds);
  const [outreachFeedback, setOutreachFeedback] = useState({});
  const [outreachGeneration, setOutreachGeneration] = useState({});
  const [outreachVariations, setOutreachVariations] = useState({});
  const [recipientEmails, setRecipientEmails] = useState({});
  const [subjectEdits, setSubjectEdits] = useState({});
  const [searchedEmailContactIds, setSearchedEmailContactIds] = useState(() => new Set());
  const [outreachReplies, setOutreachReplies] = useState([]);
  const [researchCountries, setResearchCountries] = useState(RESEARCH_COUNTRIES);
  const [researchBusinessTypes, setResearchBusinessTypes] = useState(() =>
    RESEARCH_BUSINESS_TYPES.map(({ id }) => id)
  );
  const [researchTargetTotal, setResearchTargetTotal] = useState(() => {
    const storedTarget = window.localStorage.getItem("godwit-outreach-research-total") || "";
    const parsedTarget = Number(storedTarget);
    return Number.isInteger(parsedTarget) && parsedTarget >= 1 && parsedTarget <= 100 ? storedTarget : "10";
  });
  const [outreachLanguage, setOutreachLanguage] = useState(() => {
    const storedLanguage = window.localStorage.getItem("godwit-outreach-language");
    return ["auto", ...OUTREACH_LANGUAGES].includes(storedLanguage) ? storedLanguage : "auto";
  });
  const [outreachActionLoading, setOutreachActionLoading] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachPage, setOutreachPage] = useState(1);

  useEffect(() => {
    window.localStorage.setItem("godwit-outreach-language", outreachLanguage);
  }, [outreachLanguage]);

  useEffect(() => {
    window.localStorage.setItem("godwit-outreach-research-total", researchTargetTotal);
  }, [researchTargetTotal]);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(outreachContacts.length / OUTREACH_PAGE_SIZE));
    setOutreachPage((current) => Math.min(current, pageCount));
  }, [outreachContacts.length]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const isAllowed = isCreatorEmail(user?.email);
      setAuthorized(isAllowed);
      if (!isAllowed) return;
      await loadWebsiteVisits();

      const { data, error: overviewError } = await supabase.rpc("creator_overview");
      if (overviewError) {
        setError(overviewError.message);
        return;
      }
      setOverview(data);
      setPilotEndDate(data?.pilot_end_date || "");
      await loadOutreach();
    }
    load();
  }, []);

  async function loadWebsiteVisits() {
    setWebsiteVisitsLoading(true);
    setWebsiteVisitsError("");
    try {
      const { data, error: visitsError } = await supabase.rpc("creator_website_visits");
      if (visitsError) throw visitsError;
      if (!data) throw new Error("Website visit totals were not returned.");
      setWebsiteVisits(data);
    } catch (visitsError) {
      setWebsiteVisitsError(visitsError.message || "Unable to load website visits.");
    } finally {
      setWebsiteVisitsLoading(false);
    }
  }

  async function loadOutreach(hiddenIds = hiddenReviewedOutreachIds) {
    setOutreachLoading(true);
    const { data, error: outreachError } = await supabase
      .from("creator_outreach_contacts")
      .select("*")
      .in("status", ["draft", "approved"])
      .neq("business_review_status", "approved")
      .neq("message_review_status", "approved")
      .neq("business_review_status", "rejected")
      .neq("message_review_status", "rejected")
      .order("created_at", { ascending: false });
    setOutreachLoading(false);
    if (outreachError) {
      setError(outreachError.message);
      return false;
    }
    setOutreachContacts(filterHiddenOutreachContacts(data || [], hiddenIds));
    setOutreachPage(1);
    const { data: replyData, error: replyError } = await supabase
    .from("creator_outreach_replies")
    .select("*, creator_outreach_contacts(company_name, contact_email)")
    .order("received_at", { ascending: false });
    if (replyError) {
    setError(replyError.message);
    return false;
    }
    setOutreachReplies(replyData || []);
    return true;
  }

  async function reviewOutreachReply(replyId) {
    setError("");
    const { data, error: reviewError } = await supabase.rpc("creator_review_outreach_reply", {
      target_reply_id: replyId
    });
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    const updated = data?.[0];
    setOutreachReplies((current) => current.map((reply) => reply.id === replyId ? { ...reply, ...updated } : reply));
    setMessage("Reply marked as reviewed.");
  }

  async function discardOutreachLocation(contactId) {
    const contact = outreachContacts.find((item) => item.id === contactId);
    if (!window.confirm(`Discard ${contact?.company_name || "this location"}? It will be excluded from future research.`)) return;
    setError("");
    setMessage("");
    const { error: reviewError } = await supabase.rpc("creator_review_outreach_contact", {
      target_contact_id: contactId,
      review_area: "business",
      decision: "rejected"
    });
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    setOutreachContacts((current) => current.filter((contact) => contact.id !== contactId));
    setMessage("Location discarded; it will be excluded from future research.");
  }

  async function saveOutreachSubject(contactId) {
    const subject = String(subjectEdits[contactId] ?? "").trim();
    if (!subject || subject.length > 120) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: { text: "Subject must contain 1 to 120 characters.", isError: true }
      }));
      return;
    }
    setOutreachActionLoading(true);
    try {
      const session = await getCreatorSession();
      const response = await fetch("/api/creator-outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `****** || ""}`
        },
        body: JSON.stringify({ action: "save-subject", contactId, subject })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the subject.");
      setOutreachContacts((current) => current.map((contact) => contact.id === contactId
        ? { ...contact, subject: result.subject }
        : contact));
      setSubjectEdits((current) => {
        const next = { ...current };
        delete next[contactId];
        return next;
      });
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: { text: "Email subject saved. Review the message before sending.", isError: false }
      }));
    } catch (saveError) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: {
          text: saveError instanceof Error ? saveError.message : "Could not save the subject.",
          isError: true
        }
      }));
    } finally {
      setOutreachActionLoading(false);
    }
  }

  function cleanDisplayedOutreachContacts() {
    const contactIds = getOutreachContactIds(outreachContacts);
    if (!contactIds.length) return;
    if (!window.confirm(`Clean ${contactIds.length} displayed prospect${contactIds.length === 1 ? "" : "s"} from this display? This only hides them in this browser; it does not delete their records.`)) return;
    setError("");
    setMessage("");
    const nextHiddenIds = new Set(hiddenReviewedOutreachIds);
    contactIds.forEach((id) => nextHiddenIds.add(id));
    try {
      window.localStorage.setItem(HIDDEN_REVIEWED_OUTREACH_KEY, JSON.stringify([...nextHiddenIds]));
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not save the display filter: ${storageError.message}` : "Could not save the display filter.");
      return;
    }
    setHiddenReviewedOutreachIds(nextHiddenIds);
    setOutreachContacts((current) => filterHiddenOutreachContacts(current, nextHiddenIds));
    setMessage(`Cleaned ${contactIds.length} prospect${contactIds.length === 1 ? "" : "s"} from this display. Their records were not deleted.`);
  }

  async function restoreHiddenReviewedOutreachContacts() {
    setError("");
    setMessage("");
    try {
      window.localStorage.removeItem(HIDDEN_REVIEWED_OUTREACH_KEY);
    } catch (storageError) {
      setError(storageError instanceof Error ? `Could not restore hidden prospects: ${storageError.message}` : "Could not restore hidden prospects.");
      return;
    }
    const noHiddenIds = new Set();
    if (!await loadOutreach(noHiddenIds)) return;
    setHiddenReviewedOutreachIds(noHiddenIds);
    setMessage("Cleaned prospects restored. Reviewed prospects remain hidden.");
  }

  async function findOutreachEmail(contactId) {
    setError("");
    setMessage("");
    setOutreachActionLoading(true);
    try {
      const session = await getCreatorSession();
      const response = await fetch("/api/creator-outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ["Bearer", session?.access_token || ""].join(" ")
        },
        body: JSON.stringify({ action: "find-email", contactId })
      });
      const result = await response.json();
      if (!response.ok) {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: result.error || "Email lookup failed.", isError: true }
        }));
        return;
      }
      if (result.email) {
        const source = result.source === "web_search" ? " in public web search results" : " on the official website";
        setRecipientEmails((current) => ({ ...current, [contactId]: result.email }));
        setOutreachContacts((current) => current.map((contact) => contact.id === contactId
          ? { ...contact, contact_email: result.email }
          : contact));
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: `Found public business email${source}: ${result.email}`, isError: false }
        }));
      } else {
        const websiteStatus = result.websiteStatus || result.status;
        const websiteDetail = websiteStatus === "no_website"
          ? "no website is listed"
          : websiteStatus === "not_found"
            ? "no email was found on the listed website"
            : `the listed website could not be checked (${websiteStatus})`;
        const text = result.searchStatus === "not_configured"
          ? `The lookup stopped because ${websiteDetail}; public web search is not configured. Add SERPAPI_API_KEY to the Vercel environment to enable it.`
          : result.status === "not_found"
            ? `No public business email appeared in web search results, and ${websiteDetail}. The agent won't guess.`
            : `No email was found; ${websiteDetail}.`;
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text, isError: true }
        }));
      }
    } catch (lookupError) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: {
          text: lookupError instanceof Error ? lookupError.message : "Email lookup failed.",
          isError: true
        }
      }));
    } finally {
      setOutreachActionLoading(false);
    }
  }

  async function findMissingOutreachEmails() {
    const contacts = outreachContacts
      .filter((contact) => !contact.contact_email && !searchedEmailContactIds.has(contact.id))
      .slice(0, 5);
    if (contacts.length === 0) {
      setMessage("All blank business emails in the current queue have been checked.");
      return;
    }
    setError("");
    setMessage("");
    setOutreachActionLoading(true);
    try {
      const session = await getCreatorSession();
      const response = await fetch("/api/creator-outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `****** || ""}`
        },
        body: JSON.stringify({
          action: "find-missing-emails",
          contactIds: contacts.map((contact) => contact.id)
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Business email search failed.");
      const results = Array.isArray(result.results) ? result.results : [];
      const found = results.filter((item) => item.email);
      const foundById = new Map(found.map((item) => [item.id, item.email]));
      setSearchedEmailContactIds((current) => new Set([
        ...current,
        ...results.map((item) => item.id)
      ]));
      setRecipientEmails((current) => ({ ...current, ...Object.fromEntries(foundById) }));
      setOutreachContacts((current) => current.map((contact) => foundById.has(contact.id)
        ? { ...contact, contact_email: foundById.get(contact.id) }
        : contact));
      if (results.some((item) => item.searchStatus === "not_configured")) {
        throw new Error("Public web search is not configured in the deployed API. Confirm SERPAPI_API_KEY is set for Production and redeploy.");
      }
      setMessage(`Checked ${results.length} blank business email${results.length === 1 ? "" : "s"}; found ${found.length}. Search another batch to continue.`);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Business email search failed.");
    } finally {
      setOutreachActionLoading(false);
    }
  }

  async function runOutreachAction(action, contactId, options = {}) {
    setError("");
    setMessage("");
    setOutreachActionLoading(true);
    try {
      const variation = action === "regenerate"
        ? (outreachVariations[contactId] || 0) + 1
        : undefined;
      if (action === "regenerate") {
        setOutreachGeneration((current) => ({ ...current, [contactId]: "generating" }));
        setOutreachFeedback((current) => {
          const next = { ...current };
          delete next[contactId];
          return next;
        });
        setOutreachContacts((current) => current.map((contact) => contact.id === contactId
          ? { ...contact, subject: "", message: "", aiProvider: null, aiGeneratedAt: null }
          : contact));
      }
      const session = await getCreatorSession();
      const response = await fetch("/api/creator-outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`
        },
        body: JSON.stringify({
          action,
          contactId,
          ...options,
          ...(variation === undefined ? {} : { variation })
        })
      });
      const result = await response.json();
      if (!response.ok) {
        if (action === "regenerate") {
          setOutreachGeneration((current) => ({ ...current, [contactId]: "failed" }));
          setOutreachFeedback((current) => ({
            ...current,
            [contactId]: {
              text: result.error || "AI draft generation failed. No draft was retained.",
              isError: true
            }
          }));
        }
        setError(result.error || "Outreach action failed.");
        return;
      }
      if (action === "research") {
        const countryTotals = Object.entries(result.countries || {})
          .map(([country, count]) => `${country}: ${count}`)
          .join(", ");
        const emailCount = Number(result.emailsFound || 0);
        setMessage(`Research complete: ${result.inserted || 0} new prospects added, ${emailCount} public contact email${emailCount === 1 ? "" : "s"} found${countryTotals ? ` (${countryTotals})` : ""}.`);
        await loadOutreach();
        return;
      }
      if (variation !== undefined) {
        setOutreachVariations((current) => ({ ...current, [contactId]: variation }));
      }
      setSubjectEdits((current) => {
        const next = { ...current };
        delete next[contactId];
        return next;
      });
      setOutreachContacts((current) => current.map((contact) => contact.id === contactId ? {
        ...contact,
        subject: result.subject,
        message: result.message,
        personalization_note: result.personalizationNote || contact.personalization_note,
        message_review_status: "pending",
        status: "draft"
      } : contact));
      if (action === "regenerate") {
        setOutreachGeneration((current) => ({ ...current, [contactId]: "ready" }));
        setOutreachContacts((current) => current.map((contact) => contact.id === contactId ? {
          ...contact,
          aiProvider: result.aiProvider || "AI",
          aiGeneratedAt: result.aiGeneratedAt || new Date().toISOString()
        } : contact));
      }
      setMessage("A fresh personalized message was generated. Review it before sending.");
    } catch (actionError) {
      if (action === "regenerate") {
        setOutreachGeneration((current) => ({ ...current, [contactId]: "failed" }));
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: {
            text: actionError instanceof Error ? actionError.message : "AI draft generation failed. No draft was retained.",
            isError: true
          }
        }));
      }
      setError(actionError instanceof Error ? actionError.message : "Outreach action failed.");
    } finally {
      setOutreachActionLoading(false);
    }
  }

  function toggleSelection(setSelection, currentSelection, value) {
    setSelection(currentSelection.includes(value)
      ? currentSelection.filter((selected) => selected !== value)
      : [...currentSelection, value]);
  }

  async function sendOutreachMessage(contactId, recipientEmail) {
    const contact = outreachContacts.find((item) => item.id === contactId);
    if (!isValidRecipientEmail(recipientEmail)) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: { text: "Enter a valid business contact email above. The message sender is hellogodwit@gmail.com.", isError: true }
      }));
      return;
    }
    if (!contact?.subject || !contact.message) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: { text: "This draft is missing a subject or message. Regenerate the draft before sending.", isError: true }
      }));
      return;
    }
    setError("");
    setMessage("");
    setOutreachFeedback((current) => ({
      ...current,
      [contactId]: { text: "Sending from hellogodwit@gmail.com…", isError: false }
    }));
    setOutreachActionLoading(true);
    try {
      const session = await getCreatorSession();
      const response = await fetch("/api/creator-outreach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`
        },
        body: JSON.stringify({ action: "send", contactIds: [contactId], recipientEmail })
      });
      const result = await response.json();
      if (!response.ok) {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: result.error || "Message sending failed.", isError: true }
        }));
        return;
      }
      if (result.disabled) {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: "Delivery is not configured. Add the Google App Password for hellogodwit@gmail.com as OUTREACH_SMTP_PASSWORD in Vercel.", isError: true }
        }));
      } else if (result.sent > 0) {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: "Message sent from hellogodwit@gmail.com.", isError: false }
        }));
      } else if (result.errors > 0) {
        const detail = result.deliveryErrors?.[0];
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: {
            text: detail
              ? `Email delivery failed: ${detail}`
              : "Email delivery failed. Check the Gmail App Password configured in Vercel.",
            isError: true
          }
        }));
      } else if (result.skipped > 0) {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: "Not sent: this contact email is invalid or suppressed.", isError: true }
        }));
      } else {
        setOutreachFeedback((current) => ({
          ...current,
          [contactId]: { text: "No email was sent. Check the delivery status and try again.", isError: true }
        }));
      }
      await loadOutreach();
    } catch (sendError) {
      setOutreachFeedback((current) => ({
        ...current,
        [contactId]: {
          text: sendError instanceof Error
            ? `Could not send the message: ${sendError.message}`
            : "Could not send the message because the request failed.",
          isError: true
        }
      }));
    } finally {
      setOutreachActionLoading(false);
    }
  }

  async function savePilotEndDate(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const { data, error: updateError } = await supabase.rpc("creator_update_pilot_end_date", {
      target_end_date: pilotEndDate
    });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOverview((current) => ({ ...current, pilot_end_date: data }));
    setMessage("Pilot end date updated.");
  }

  if (authorized === null) {
    return <Layout theme="workspace"><p className="p-6 text-center">Loading creator overview...</p></Layout>;
  }
  if (!authorized) return <Navigate to="/admin" replace />;

  const outreachPageCount = Math.max(1, Math.ceil(outreachContacts.length / OUTREACH_PAGE_SIZE));
  const outreachPageStart = (outreachPage - 1) * OUTREACH_PAGE_SIZE;
  const visibleOutreachContacts = outreachContacts.slice(
    outreachPageStart,
    outreachPageStart + OUTREACH_PAGE_SIZE
  );
  const outreachGroups = groupOutreachContactsByCountry(visibleOutreachContacts);

  return (
    <Layout theme="workspace">
      <div className="mx-auto max-w-6xl space-y-6 px-3 py-4 sm:p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-300">Creator</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Godwit overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">A quick view of platform health, website traffic, and outreach tasks. Guest answers and payment data are not shown here.</p>
        </div>
        {error && <p className="rounded border border-red-500/50 bg-red-950/30 p-3 text-red-200">{error}</p>}
        <section className="rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby="website-visits-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="website-visits-heading" className="text-lg font-bold">Public website visits</h2>
              <p className="mt-1 text-sm text-slate-400">Anonymous visits from people who accepted measurement consent.</p>
            </div>
            <button type="button" onClick={loadWebsiteVisits} disabled={websiteVisitsLoading} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">
              {websiteVisitsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {websiteVisitsError && <p role="alert" className="creator-send-feedback is-error mt-3">Website counter unavailable: {websiteVisitsError} Confirm the website-visits database migration has been applied.</p>}
          {websiteVisitsLoading && !websiteVisits && <p className="mt-4 text-sm text-slate-400">Loading visit totals...</p>}
          {!websiteVisitsLoading && !websiteVisitsError && !websiteVisits && <p className="mt-4 text-sm text-slate-400">No visit totals are available yet. Refresh after the website-visits migration is installed.</p>}
          {websiteVisits && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[["total", "Total visits"], ["today", "Today (UTC)"], ["last_30_days", "Last 30 days"]].map(([key, label]) => (
                <div key={key} className="rounded-md border border-slate-700 bg-slate-950/50 p-3">
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-teal-300">{Number(websiteVisits[key] || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
          <details className="mt-3 text-sm text-slate-400">
            <summary className="cursor-pointer text-slate-300">How this is counted</summary>
            <p className="mt-2">Visits to the homepage, Essentials, privacy, terms, and support pages are counted once per browser tab per UTC day. Signed-in users, dashboard activity, and QR or voting pages are excluded. Tracking starts after the database migration is installed; past visits cannot be recovered.</p>
            {websiteVisits?.since && <p className="mt-1">First recorded visit: {websiteVisits.since}.</p>}
          </details>
        </section>
        {overview && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map(([key, label]) => (
                <section key={key} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="mt-1 break-words text-2xl font-bold text-teal-300 sm:text-3xl">{overview[key] ?? 0}</p>
                </section>
              ))}
            </div>
            <form onSubmit={savePilotEndDate} className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4">
              <h2 className="font-bold text-amber-200">Free pilot programme</h2>
              <p className="mt-1 text-sm text-slate-300">No automatic billing or payment method is required. Postpone the date here before the pilot ends.</p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm text-slate-300">Pilot end date<input type="date" value={pilotEndDate} onChange={(event) => setPilotEndDate(event.target.value)} className="mt-1 block rounded border border-slate-600 bg-slate-950 p-2 text-white" required /></label>
                <button type="submit" className="rounded bg-amber-300 px-4 py-2 font-semibold text-slate-950">Save date</button>
                <span className="text-sm text-slate-300">Current: {formatDate(overview.pilot_end_date)}</span>
              </div>
              {message && <p className="mt-2 text-sm text-emerald-300">{message}</p>}
            </form>
            <div className="space-y-3 lg:hidden">
              {(overview.venue_rows || []).map((venue) => (
                <section key={venue.id} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-3">
                  <h2 className="break-words font-semibold">{venue.name}</h2>
                  <p className="break-all text-sm text-slate-400">{venue.owner_email || "—"}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    {VENUE_METRICS.map(([key, label]) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-xs text-slate-400">{label}</dt>
                        <dd className="break-words font-semibold">{venue[key] ?? 0}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <section className="hidden overflow-x-auto rounded-lg border border-slate-700 lg:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-slate-700 bg-slate-900"><tr>{["Venue", "Owner", ...VENUE_METRICS.map(([, label]) => label)].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr></thead>
                <tbody>{(overview.venue_rows || []).map((venue) => <tr key={venue.id} className="border-b border-slate-800 last:border-0"><td className="p-3 font-semibold">{venue.name}</td><td className="p-3 text-slate-400">{venue.owner_email || "—"}</td>{VENUE_METRICS.map(([key]) => <td key={key} className="p-3">{venue[key]}</td>)}</tr>)}</tbody>
              </table>
            </section>
            <section className="creator-outreach min-w-0 space-y-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3 sm:p-4">
              <div>
                <h2 className="text-xl font-bold">Godwit outreach</h2>
                <p className="mt-1 text-sm text-slate-400">Review each prospect and its draft. Choosing Send message sends that email immediately.</p>
                <div className="creator-research-panel mt-4 grid min-w-0 gap-4 rounded-lg border border-slate-700 bg-slate-900/70 p-3 sm:p-4 lg:grid-cols-2">
                  <fieldset>
                    <legend className="font-semibold">Countries</legend>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                      {RESEARCH_COUNTRIES.map((country) => (
                        <label key={country} className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={researchCountries.includes(country)}
                            onChange={() => toggleSelection(setResearchCountries, researchCountries, country)}
                          />
                          {country}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="text-sm font-semibold">
                    Outreach language
                    <select
                      value={outreachLanguage}
                      onChange={(event) => setOutreachLanguage(event.target.value)}
                      className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2 text-white"
                    >
                      {LANGUAGE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <span className="mt-1 block font-normal text-slate-400">Automatic uses German for Austria, Italian for Italy, and English for Malaysia. Your choice is saved in this browser and also applies when you regenerate a draft.</span>
                  </label>
                  <fieldset className="lg:col-span-2">
                    <legend className="font-semibold">Business types</legend>
                    <button
                      type="button"
                      onClick={() => setResearchBusinessTypes(RESEARCH_BUSINESS_TYPES.map(({ id }) => id))}
                      className="mt-1 text-xs font-semibold text-teal-300 underline"
                    >
                      Select all types (including real estate agencies)
                    </button>
                    <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                      {RESEARCH_BUSINESS_TYPES.map(({ id, label }) => (
                        <label key={id} className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={researchBusinessTypes.includes(id)}
                            onChange={() => toggleSelection(setResearchBusinessTypes, researchBusinessTypes, id)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs font-normal text-slate-400">
                      Research prioritizes businesses where QR feedback fits real customer touchpoints, then ranks available listings by business type, operating status, and whether an official website is available. Closed businesses are skipped; ranking signals are clues, not claims that a business has a problem.
                    </p>
                  </fieldset>
                  <div className="flex flex-wrap items-end gap-3 lg:col-span-2">
                    <label className="text-sm font-semibold">
                      Total businesses to research
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={researchTargetTotal}
                        onChange={(event) => {
                          setResearchTargetTotal(event.target.value);
                        }}
                        className="mt-1 block w-36 rounded border border-slate-600 bg-slate-950 p-2 text-white"
                        aria-describedby="research-target-help"
                      />
                      <span id="research-target-help" className="mt-1 block max-w-xs font-normal text-slate-400">This total is shared as evenly as possible across selected countries. Maximum 100 per research run.</span>
                    </label>
                    <button
                      type="button"
                      disabled={
                        outreachActionLoading ||
                        researchCountries.length === 0 ||
                        researchBusinessTypes.length === 0 ||
                        !/^\d+$/.test(researchTargetTotal) ||
                        Number(researchTargetTotal) < 1 ||
                        Number(researchTargetTotal) > 100
                      }
                      onClick={() => runOutreachAction("research", undefined, {
                        countries: researchCountries,
                        businessTypes: researchBusinessTypes,
                        targetTotal: Number(researchTargetTotal),
                        language: outreachLanguage
                      })}
                      className="rounded bg-teal-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                    >
                      Research businesses
                    </button>
                    <button
                      type="button"
                      disabled={outreachActionLoading || !outreachContacts.length}
                      onClick={cleanDisplayedOutreachContacts}
                      className="rounded border border-amber-300/60 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50"
                    >
                      Clean displayed prospects
                    </button>
                    {hiddenReviewedOutreachIds.size > 0 && (
                      <button
                        type="button"
                        disabled={outreachLoading}
                        onClick={restoreHiddenReviewedOutreachContacts}
                        className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50"
                      >
                        Restore cleaned prospects
                      </button>
                    )}
                    {outreachContacts.some((contact) => !contact.contact_email && !searchedEmailContactIds.has(contact.id)) && (
                      <button
                        type="button"
                        disabled={outreachActionLoading}
                        onClick={findMissingOutreachEmails}
                        className="rounded border border-teal-300/60 px-3 py-2 text-sm font-semibold text-teal-200 disabled:opacity-50"
                      >
                        Search next 5 blank emails
                      </button>
                    )}
                    {(researchCountries.length === 0 || researchBusinessTypes.length === 0) && (
                      <span className="text-sm text-amber-200">Select at least one country and one business type.</span>
                    )}
                  </div>
                </div>
              </div>
              {outreachLoading && <p className="text-sm text-slate-400">Loading outreach queue...</p>}
              {!outreachLoading && outreachContacts.length === 0 && <p className="text-sm text-slate-400">No prospects are waiting for review. Approved, rejected, and locally hidden prospects are excluded from this queue.</p>}
              {!outreachLoading && outreachContacts.length > 0 && (
                <div className="creator-prospect-summary flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm">
                  <p className="text-slate-100">
                    Showing {outreachPageStart + 1}–{Math.min(outreachPageStart + OUTREACH_PAGE_SIZE, outreachContacts.length)} of {outreachContacts.length} active prospect{outreachContacts.length === 1 ? "" : "s"}.
                    <span className="ml-1 text-slate-300">Reviewed and rejected items are removed automatically.</span>
                  </p>
                  {outreachPageCount > 1 && (
                    <div className="flex items-center gap-2" aria-label="Prospect pages">
                      <button
                        type="button"
                        disabled={outreachPage === 1}
                        onClick={() => setOutreachPage((current) => Math.max(1, current - 1))}
                        className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="min-w-20 text-center text-xs text-slate-400">
                        Page {outreachPage} of {outreachPageCount}
                      </span>
                      <button
                        type="button"
                        disabled={outreachPage === outreachPageCount}
                        onClick={() => setOutreachPage((current) => Math.min(outreachPageCount, current + 1))}
                        className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
              {outreachReplies.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Replies needing attention</h3>
                  {outreachReplies.map((reply) => (
                    <article key={reply.id} className="rounded-lg border border-amber-400/40 bg-amber-950/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{reply.creator_outreach_contacts?.company_name || reply.creator_outreach_contacts?.contact_email || "Unknown contact"}</p>
                          <p className="text-sm text-slate-400">{reply.from_email} · {reply.subject || "No subject"}</p>
                        </div>
                        <span className="text-xs text-amber-200">{reply.needs_action ? "Needs action" : "Reviewed"}</span>
                      </div>
                      <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-slate-300">{reply.text_body || "No plain-text content."}</p>
                      {reply.needs_action && <button type="button" onClick={() => reviewOutreachReply(reply.id)} className="mt-3 rounded bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950">Mark reviewed</button>}
                    </article>
                  ))}
                </div>
              )}
              <div className="space-y-4">
                {outreachGroups.map(({ country, contacts }) => (
                  <section key={country} aria-labelledby={`outreach-country-${country.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} className="space-y-3">
                    <h3 id={`outreach-country-${country.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} className="border-b border-slate-700 pb-2 text-lg font-semibold">{country} <span className="text-sm font-normal text-slate-400">({contacts.length})</span></h3>
                    {contacts.map((contact) => (
                    <article key={contact.id} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-lg font-semibold">{contact.company_name || "Unnamed business"}</p>
                        <p className="break-words text-sm text-slate-400">City: {contact.city || "Not available"} · {contact.country || "Country unknown"} · {contact.business_type || "Business type unknown"}</p>
                        {contact.website && <a className="break-all text-sm text-teal-300 underline" href={contact.website} target="_blank" rel="noreferrer">{contact.website}</a>}
                      </div>
                      <span className="text-xs text-slate-400">Delivery: {contact.status}</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-300"><strong>Research and tailored reason:</strong> {contact.personalization_note || "No research note provided."}</p>
                    <div className="mt-4 min-w-0 rounded border border-slate-700 p-2 sm:p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-semibold">Outreach email draft</h4>
                          <span className="text-xs text-slate-400">
                            {outreachGeneration[contact.id] === "generating"
                              ? "Generating personalized draft…"
                              : outreachGeneration[contact.id] === "failed"
                                ? "Generation failed"
                                : !contact.message
                                  ? "AI draft not generated"
                                  : contact.message_review_status === "pending"
                                    ? "Ready for your review"
                                    : contact.message_review_status}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">From: hellogodwit@gmail.com</p>
                        <label className="mt-2 block text-sm font-medium text-slate-300">
                          Business contact email
                          <input
                            type="email"
                            autoComplete="email"
                            value={recipientEmails[contact.id] ?? contact.contact_email ?? ""}
                            onChange={(event) => setRecipientEmails((current) => ({
                              ...current,
                              [contact.id]: event.target.value
                            }))}
                            placeholder="name@business.com"
                            className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2 text-white"
                          />
                          {!contact.contact_email && (
                            <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs font-normal text-slate-400">
                              <span>The agent checks the listed website and relevant public search results. It leaves this blank rather than guessing if no email is published.</span>
                              <button type="button" disabled={outreachActionLoading} onClick={() => findOutreachEmail(contact.id)} className="font-semibold text-teal-300 underline disabled:opacity-50">Search for email</button>
                            </span>
                          )}
                        </label>
                        <label className="mt-2 block text-sm font-medium text-slate-300">
                          Email subject
                          <input
                            type="text"
                            maxLength={120}
                            value={subjectEdits[contact.id] ?? contact.subject ?? ""}
                            onChange={(event) => setSubjectEdits((current) => ({
                              ...current,
                              [contact.id]: event.target.value
                            }))}
                            className="mt-1 block w-full rounded border border-slate-600 bg-slate-950 p-2 text-white"
                          />
                          {subjectEdits[contact.id] !== undefined && subjectEdits[contact.id] !== (contact.subject || "") && (
                            <span className="mt-1 block text-xs font-normal text-amber-200">Save the subject before sending.</span>
                          )}
                        </label>
                        <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-300">
                          {contact.message || (outreachGeneration[contact.id] === "generating"
                            ? "Generating a new draft from the business's published information…"
                            : "No AI draft retained. Select Generate with OpenAI to create a new personalized message.")}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={outreachActionLoading || subjectEdits[contact.id] === undefined}
                            onClick={() => saveOutreachSubject(contact.id)}
                            className="flex-1 rounded border border-teal-300/60 px-3 py-2 text-sm font-semibold text-teal-200 disabled:opacity-50"
                          >
                            Save subject
                          </button>
                          <button type="button" disabled={outreachActionLoading} onClick={() => runOutreachAction("regenerate", contact.id, { language: outreachLanguage, preferredProvider: "openai" })} className="flex-1 rounded border border-teal-300/60 px-3 py-2 text-sm font-semibold text-teal-200 disabled:opacity-50">{outreachGeneration[contact.id] === "generating" ? "Generating…" : "Generate with OpenAI"}</button>
                          <button type="button" disabled={outreachActionLoading || !contact.subject || !contact.message || (subjectEdits[contact.id] !== undefined && subjectEdits[contact.id] !== (contact.subject || ""))} onClick={() => sendOutreachMessage(contact.id, String(recipientEmails[contact.id] ?? contact.contact_email ?? "").trim())} className="flex-1 rounded bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Send message</button>
                          <button type="button" disabled={outreachActionLoading} onClick={() => discardOutreachLocation(contact.id)} className="flex-1 rounded border border-red-400/60 px-3 py-2 text-sm font-semibold text-red-200 disabled:opacity-50">Discard location</button>
                        </div>
                        <p className="mt-2 text-xs text-slate-300">AI-generated from the business's published information. Review the facts, recipient, and wording before sending.</p>
                        {contact.aiProvider && contact.aiGeneratedAt && (
                          <p className="mt-1 text-xs text-slate-300">
                            Generated by {contact.aiProvider} · {new Date(contact.aiGeneratedAt).toLocaleString()}
                          </p>
                        )}
                        {outreachFeedback[contact.id] && (
                          <p role="status" aria-live="polite" className={`creator-send-feedback mt-3 ${outreachFeedback[contact.id].isError ? "is-error" : "is-success"}`}>
                            {outreachFeedback[contact.id].text}
                          </p>
                        )}
                    </div>
                    </article>
                    ))}
                  </section>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
