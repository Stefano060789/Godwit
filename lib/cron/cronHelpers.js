// Shared helpers for the cron job implementations in this folder. This file lives under
// lib/cron/ (outside the api/ directory entirely) specifically so Vercel does NOT count
// it as a Serverless Function - only api/cron.js itself is a routable function, and it
// bundles this file in as a plain dependency. See api/cron.js for why this exists.
import { timingSafeEqual } from "node:crypto";
import { isAllowedResendPurpose, sendResendEmail } from "../resendEmail.js";
import { stripeSandboxRequest } from "../stripeSandbox.js";

export function secureEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function supabaseGet(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not configured.");
  const result = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!result.ok) throw new Error(`Supabase query failed (${result.status}).`);
  return result.json();
}

export async function supabaseCount(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" } });
  if (!result.ok) throw new Error(`Supabase count failed (${result.status}).`);
  return Number(result.headers.get("content-range")?.split("/")[1] || 0);
}

export async function supabasePost(path, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/rest/v1/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
  if (!result.ok) throw new Error(`Supabase insert failed (${result.status}).`);
}

export async function supabasePatch(path, body) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body)
  });
  if (!result.ok) throw new Error(`Supabase update failed (${result.status}).`);
}

export async function supabaseDelete(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" }
  });
  if (!result.ok) throw new Error(`Supabase delete failed (${result.status}).`);
}

export async function sendEmail({ purpose, to, subject, text, attachments }) {
  if (!isAllowedResendPurpose(purpose)) {
    throw new Error("Resend delivery blocked: email purpose is not approved.");
  }
  const result = await sendResendEmail("https://api.resend.com/emails", {
    purpose,
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL, to: [to], subject, text, ...(attachments ? { attachments } : {}) })
  });
  if (!result.ok) throw new Error(`Email delivery failed (${result.status}).`);
  return result;
}

export async function supabaseRequest(path, { method = "GET", body, prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not configured.");
  const result = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: ["Bearer", key].join(" "),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!result.ok) throw new Error(`Supabase request failed (${result.status}).`);
  // PostgREST returns an empty body for 204 No Content, but also for other success
  // statuses (e.g. 201 Created on POST) when Prefer: return=minimal is requested.
  // Parse defensively instead of assuming only 204 can have an empty body, otherwise
  // result.json() throws an opaque "Unexpected end of JSON input".
  const rawBody = await result.text();
  return rawBody ? JSON.parse(rawBody) : null;
}

export async function stripeRequest(path) {
  return stripeSandboxRequest(path);
}
