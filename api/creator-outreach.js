import { runResearchGodwitProspects } from "../lib/cron/researchGodwitProspectsJob.js";
import { OUTREACH_LANGUAGES } from "../lib/cron/outreachCopy.js";
import { generatePersonalizedOutreach, OUTREACH_AI_REQUIRED_ERROR } from "../lib/cron/personalizedOutreach.js";
import { createOutreachCopy } from "../lib/cron/outreachCopy.js";
import { findPublicBusinessEmail } from "../lib/cron/publicBusinessEmail.js";
import { RESEARCH_BUSINESS_TYPES, RESEARCH_COUNTRIES } from "../lib/cron/researchOptions.js";
import { isValidOutreachEmail, runSendOutreachEmails } from "../lib/cron/sendOutreachEmailsJob.js";
import { supabaseGet, supabasePatch, supabaseRequest } from "../lib/cron/cronHelpers.js";

function getBearer(request) {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
}

async function requireCreator(request) {
  const token = getBearer(request);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!token || !url || !key) {
    throw new Error("Creator authentication requires SUPABASE_URL and SUPABASE_ANON_KEY for the same project as the Creator app.");
  }
  const result = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` }
  });
  if (!result.ok) {
    const authError = await result.json();
    const reason = authError.msg || authError.message || authError.error_description || authError.error;
    throw new Error(`Creator authentication failed (Supabase ${result.status}${reason ? `: ${reason}` : ""}).`);
  }
  const user = await result.json();
  const allowed = [
    "bonomistefano@outlook.it",
    "afelix470@gmail.com",
    process.env.CREATOR_EMAILS,
    process.env.VITE_CREATOR_EMAILS
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(String(user.email || "").toLowerCase())) throw new Error("Creator access is required.");
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  try {
    await requireCreator(request);
    const action = String(request.body?.action || "");
    if (action === "research") {
      const language = String(request.body?.language || "auto");
      const countries = request.body?.countries;
      const businessTypes = request.body?.businessTypes;
      const targetTotal = request.body?.targetTotal;
      if (language !== "auto" && !OUTREACH_LANGUAGES.includes(language)) {
        return response.status(400).json({ error: "Select a supported outreach language." });
      }
      if (
        (countries !== undefined && (!Array.isArray(countries) || countries.length === 0 ||
          countries.some((country) => !RESEARCH_COUNTRIES.includes(String(country))))) ||
        (businessTypes !== undefined && (!Array.isArray(businessTypes) || businessTypes.length === 0 ||
          businessTypes.some((type) => !RESEARCH_BUSINESS_TYPES.some(({ id }) => id === String(type))))) ||
        (targetTotal !== undefined && (!Number.isInteger(targetTotal) || targetTotal < 1 || targetTotal > 100))
      ) {
        return response.status(400).json({ error: "Select supported countries, business types, and a total from 1 to 100 businesses." });
      }
      return response.status(200).json(await runResearchGodwitProspects({
        countries,
        businessTypes,
        targetTotal,
        language
      }));
    }
    if (action === "regenerate") {
      const contactId = String(request.body?.contactId || "");
      const language = String(request.body?.language || "auto");
      if (!contactId) return response.status(400).json({ error: "contactId is required." });
      if (language !== "auto" && !OUTREACH_LANGUAGES.includes(language)) {
        return response.status(400).json({ error: "Select a supported outreach language." });
      }
      if (!process.env.GEMINI_API_KEY?.trim() && !process.env.OPENAI_API_KEY?.trim()) {
        return response.status(503).json({ error: OUTREACH_AI_REQUIRED_ERROR });
      }
      const contacts = await supabaseGet(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}&select=id,company_name,business_type,country,city,website,contact_email,message`);
      const contact = contacts[0];
      if (!contact) return response.status(404).json({ error: "Outreach draft not found." });
      const generated = await generatePersonalizedOutreach({
        companyName: contact.company_name,
        businessType: contact.business_type,
        country: contact.country,
        city: contact.city,
        website: contact.website,
        previousMessage: contact.message,
        language,
        variation: request.body?.variation,
        preferredProvider: request.body?.preferredProvider
      });
      const fallback = generated.languageValid === false
        ? {
            ...createOutreachCopy({
              companyName: contact.company_name,
              businessType: contact.business_type,
              country: contact.country,
              city: contact.city,
              language,
              variation: request.body?.variation
            }),
            generationSource: "template"
          }
        : null;
      const { subject, message, personalizationReason, generationSource } = fallback || generated;
      const type = String(contact.business_type || "customer-facing business").replaceAll("_", " ");
      const personalizationNote = `Google Places category: ${type}${contact.city ? ` in ${contact.city}` : ""}. Tailored outreach angle: ${personalizationReason}${contact.contact_email ? ` Public contact email on file: ${contact.contact_email}.` : ""}`;
      await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}`, {
        subject,
        message,
        personalization_note: personalizationNote,
        message_review_status: "pending",
        status: "draft",
        last_error: null
      });
      return response.status(200).json({
        subject,
        message,
        personalizationNote,
        aiProvider: generationSource === "template"
          ? "Template fallback"
          : request.body?.preferredProvider === "openai"
            ? "OpenAI"
            : process.env.GEMINI_API_KEY?.trim() ? "Gemini" : "OpenAI",
        aiGeneratedAt: new Date().toISOString()
      });
    }
    if (action === "save-subject") {
      const contactId = String(request.body?.contactId || "");
      const subject = String(request.body?.subject || "").trim();
      if (!contactId) return response.status(400).json({ error: "contactId is required." });
      if (!subject || subject.length > 120) {
        return response.status(400).json({ error: "Subject must contain 1 to 120 characters." });
      }
      const contacts = await supabaseGet(
        `creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}&status=in.(draft,approved)&select=id,business_review_status`
      );
      const contact = contacts[0];
      if (!contact || contact.business_review_status === "rejected") {
        return response.status(404).json({ error: "Outreach draft not found." });
      }
      await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}`, {
        subject,
        message_review_status: "pending"
      });
      return response.status(200).json({ subject });
    }
    if (action === "clear-research") {
      const deletedRows = await supabaseRequest(
        "creator_outreach_contacts?status=in.(draft,approved)&or=(business_review_status.neq.rejected,business_review_status.is.null)&select=id",
        { method: "DELETE", prefer: "return=representation" }
      );
      return response.status(200).json({ cleared: Array.isArray(deletedRows) ? deletedRows.length : 0 });
    }
    if (action === "find-email") {
      const contactId = String(request.body?.contactId || "");
      if (!contactId) return response.status(400).json({ error: "contactId is required." });
      const contacts = await supabaseGet(
        `creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}&select=id,company_name,country,city,website,contact_email`
      );
      const contact = contacts[0];
      if (!contact) return response.status(404).json({ error: "Outreach location not found." });
      if (contact.contact_email) {
        return response.status(200).json({ email: contact.contact_email, status: "found" });
      }
      const result = await findPublicBusinessEmail(contact.website, {
        companyName: contact.company_name,
        country: contact.country,
        city: contact.city
      });
      if (result.email) {
        await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}`, {
          contact_email: result.email
        });
      }
      return response.status(200).json(result);
    }
    if (action === "find-missing-emails") {
      const contactIds = Array.isArray(request.body?.contactIds)
        ? [...new Set(request.body.contactIds.map(String).filter(Boolean))].slice(0, 5)
        : [];
      if (contactIds.length === 0) {
        return response.status(400).json({ error: "Select at least one blank contact email." });
      }
      const contacts = await supabaseGet(
        `creator_outreach_contacts?id=in.(${contactIds.map(encodeURIComponent).join(",")})&status=in.(draft,approved)&select=id,company_name,country,city,website,contact_email,business_review_status`
      );
      const results = await Promise.all(contacts.map(async (contact) => {
        if (contact.contact_email) {
          return { id: contact.id, email: contact.contact_email, status: "already_found" };
        }
        if (contact.business_review_status === "rejected") {
          return { id: contact.id, email: null, status: "rejected" };
        }
        const result = await findPublicBusinessEmail(contact.website, {
          companyName: contact.company_name,
          country: contact.country,
          city: contact.city
        });
        if (result.email) {
          await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contact.id)}`, {
            contact_email: result.email
          });
        }
        return { id: contact.id, ...result };
      }));
      return response.status(200).json({ results });
    }
    if (action === "send") {
      const contactIds = Array.isArray(request.body?.contactIds)
        ? [...new Set(request.body.contactIds.map(String).filter(Boolean))]
        : [];
      const recipientEmail = String(request.body?.recipientEmail || "").trim();
      if (contactIds.length === 0) return response.status(400).json({ error: "At least one contact must be selected." });
      if (recipientEmail && (!isValidOutreachEmail(recipientEmail) || contactIds.length !== 1)) {
        return response.status(400).json({ error: "Enter one valid business email address to send this message." });
      }
      const contacts = await supabaseGet(
        `creator_outreach_contacts?id=in.(${contactIds.map(encodeURIComponent).join(",")})&status=in.(draft,approved)&select=id,business_review_status,message_review_status,subject,message`
      );
      if (contacts.length !== contactIds.length) {
        return response.status(400).json({ error: "One or more drafts are no longer available to send." });
      }
      if (contacts.some((contact) => !String(contact.subject || "").trim() || !String(contact.message || "").trim())) {
        return response.status(400).json({ error: "Generate and review an AI draft before sending." });
      }
      if (contacts.some((contact) => contact.business_review_status === "rejected" || contact.message_review_status === "rejected")) {
        return response.status(400).json({ error: "A discarded or rejected draft cannot be sent." });
      }
      if (recipientEmail) {
        await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactIds[0])}`, {
          contact_email: recipientEmail.toLowerCase()
        });
      }
      for (const contactId of contactIds) {
        await supabasePatch(`creator_outreach_contacts?id=eq.${encodeURIComponent(contactId)}&status=in.(draft,approved)`, {
          status: "approved",
          business_review_status: "approved",
          message_review_status: "approved",
          approved_at: new Date().toISOString(),
          last_error: null
        });
      }
      return response.status(200).json(await runSendOutreachEmails({ contactIds }));
    }
    return response.status(400).json({ error: "Unknown outreach action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Creator outreach action failed.";
    const status = message.includes("required") || message.includes("authentication") ? 401 : 500;
    return response.status(status).json({ error: message });
  }
}
