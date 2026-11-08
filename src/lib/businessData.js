import { supabase } from "./supabase";

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
    || !/^\/[a-z0-9._]+\/?$/i.test(url.pathname) || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error("Enter an HTTPS Instagram profile URL, such as https://www.instagram.com/example.");
  }
  return `https://www.instagram.com/${url.pathname.replaceAll("/", "")}`;
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

export async function addInstagramLink(workspaceId, value) {
  const url = normalizeInstagramUrl(value);
  const { error } = await supabase.from("workspace_ai_sources").insert({
    workspace_id: workspaceId, source_type: "instagram", title: "Instagram profile", source_url: url, content: url
  });
  throwStorageError(error);
}

export async function removeBusinessSource(workspaceId, sourceId) {
  const { error } = await supabase.from("workspace_ai_sources").delete().eq("workspace_id", workspaceId).eq("id", sourceId);
  throwStorageError(error);
}

export async function importBusinessWebsite(workspaceId, websiteUrl) {
  const { data, error } = await supabase.auth.getSession();
  throwStorageError(error);
  if (!data.session?.access_token) throw new Error("Sign in to manage business information.");
  const response = await fetch("/api/egg-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ action: "import-workspace-website", workspaceId, websiteUrl: websiteUrl.trim() })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to import this website.");
  return result.source;
}
