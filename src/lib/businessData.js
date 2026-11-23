import { supabase } from "./supabase";
import { safeBusinessUrl } from "./businessLinks";

export const BUSINESS_SOURCE_LIMIT = 8;

function throwStorageError(error) {
  if (!error) return;
  if (["PGRST205", "42P01"].includes(error.code)) {
    throw new Error("Business information storage is not installed. Apply the workspace business data migration.");
  }
  throw new Error(error.message || "Unable to update business information.");
}

export function normalizeInstagramUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid Instagram profile URL.");
  }
  if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())
    || !/^\/[a-z0-9._]+\/?$/i.test(url.pathname) || url.username || url.password || url.port) {
    throw new Error("Enter an HTTPS Instagram profile URL, such as https://www.instagram.com/example.");
  }
  return `https://www.instagram.com/${url.pathname.replaceAll("/", "")}`;
}

export function normalizeFacebookUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid Facebook page or profile URL.");
  }
  const invalid = () => new Error("Enter an HTTPS Facebook page or profile URL, such as https://www.facebook.com/example.");
  if (url.protocol !== "https:" || !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(url.hostname.toLowerCase())
    || url.username || url.password || url.port) throw invalid();
  if (url.pathname.toLowerCase() === "/profile.php") {
    const ids = url.searchParams.getAll("id");
    if (ids.length !== 1 || !/^\d+$/.test(ids[0])) throw invalid();
    return `https://www.facebook.com/profile.php?id=${ids[0]}`;
  }
  const match = url.pathname.match(/^\/([a-z0-9._-]+)\/?$/i);
  if (!match || /^(?:profile\.php|share|pages|groups|events|watch|reel|reels|posts|photo|photos|story\.php|login|search)$/i.test(match[1])) throw invalid();
  return `https://www.facebook.com/${match[1]}`;
}

export async function listBusinessSources(workspaceId) {
  const { data, error } = await supabase.from("workspace_ai_sources")
    .select("id, source_type, title, source_url, content, created_at")
    .eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  throwStorageError(error);
  return data;
}

export async function addBusinessNotes(workspaceId, title, content) {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  if (!trimmedTitle || trimmedTitle.length > 120 || !trimmedContent || trimmedContent.length > 8000) {
    throw new Error("Add a title and notes within the character limits.");
  }
  const { error } = await supabase.from("workspace_ai_sources").insert({
    workspace_id: workspaceId, source_type: "notes", title: trimmedTitle, content: trimmedContent
  });
  throwStorageError(error);
}

export async function addWebsiteLink(workspaceId, value) {
  const url = safeBusinessUrl(value);
  if (!url) throw new Error("Enter a public HTTPS website URL without credentials.");
  const { error } = await supabase.from("workspace_ai_sources").insert({
    workspace_id: workspaceId, source_type: "website", title: new URL(url).hostname,
    source_url: url, content: `Website link only (page content not imported): ${url}`
  });
  throwStorageError(error);
}

export async function addInstagramLink(workspaceId, value) {
  const url = normalizeInstagramUrl(value);
  const { error } = await supabase.from("workspace_ai_sources").insert({
    workspace_id: workspaceId, source_type: "instagram", title: "Instagram profile", source_url: url, content: url
  });
  throwStorageError(error);
}

export async function addFacebookLink(workspaceId, value) {
  const url = normalizeFacebookUrl(value);
  const { error } = await supabase.from("workspace_ai_sources").insert({
    workspace_id: workspaceId, source_type: "facebook", title: "Facebook page or profile", source_url: url, content: url
  });
  if (error?.code === "23514" && error.message?.includes("workspace_ai_sources_source_type_check")) {
    throw new Error("Facebook links are not enabled in the database yet. An administrator needs to apply the latest database update.");
  }
  throwStorageError(error);
}

export async function removeBusinessSource(workspaceId, sourceId) {
  const { error } = await supabase.from("workspace_ai_sources").delete().eq("workspace_id", workspaceId).eq("id", sourceId);
  throwStorageError(error);
}

async function submitBusinessWebsite(body) {
  const { data, error } = await supabase.auth.getSession();
  throwStorageError(error);
  if (!data.session?.access_token) throw new Error("Sign in to manage business information.");
  const response = await fetch("/api/egg-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to import this website.");
  return result.source;
}

export async function importBusinessWebsite(workspaceId, websiteUrl) {
  return submitBusinessWebsite({ action: "import-workspace-website", workspaceId, websiteUrl: websiteUrl.trim() });
}

export async function uploadBusinessWebsite(workspaceId, websiteUrl, file) {
  if (!file || !/\.html?$/i.test(file.name)) throw new Error("Choose a saved HTML webpage (.html or .htm).");
  if (file.size > 1_000_000) throw new Error("The saved webpage must be no larger than 1 MB.");
  const html = await file.text();
  return submitBusinessWebsite({ action: "upload-workspace-website", workspaceId, websiteUrl: websiteUrl.trim(), html });
}

export async function researchBusinessInformation(workspaceId, { location, topic, artwork, consent }) {
  const { data, error } = await supabase.auth.getSession();
  throwStorageError(error);
  if (!data.session?.access_token) throw new Error("Sign in to research business information.");
  const response = await fetch("/api/egg-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ action: "research-workspace", workspaceId, location, topic, artwork, consent })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to research this business.");
  return result;
}
