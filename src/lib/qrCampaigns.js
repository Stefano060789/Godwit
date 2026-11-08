import { supabase } from "./supabase";
import { START_GOALS } from "./startGuide";
import { PERSONAS } from "./personas";

// Unique token generator for a QR code's public URL (/qr/<token>). Originally lived in
// qrLocations.js (the now-removed legacy single-poll QR tool) - moved here since qr_campaigns
// is the only remaining consumer.
export function buildQrToken() {
  return `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadQrCampaigns() {
  const { data, error } = await supabase
    .from("qr_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load QR campaigns: ${error.message}`);
  return data ?? [];
}

export async function createQrCampaign({ name, pollId, token, placementLabel, variantLabel, portalTitle, portalMessage, portalButtonLabel, goalKey, businessType, workspaceId, aiEnabled }) {
  if (goalKey && !START_GOALS.some((goal) => goal.key === goalKey)) throw new Error("Choose a valid Egg goal.");
  if (businessType && !PERSONAS.some((business) => business.audienceKey === businessType)) throw new Error("Choose a valid business type.");
  const goalFields = {
    ...(goalKey ? { goal_key: goalKey } : {}),
    ...(businessType ? { business_type: businessType } : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    ...(typeof aiEnabled === "boolean" ? { ai_enabled: aiEnabled } : {})
  };
  const { data, error } = await supabase
    .from("qr_campaigns")
    .insert({ ...goalFields, name: String(name).trim(), poll_id: pollId ? Number(pollId) : null, token: token || buildQrToken(), placement_label: String(placementLabel || "").trim() || null, variant_label: String(variantLabel || "").trim() || null, portal_title: String(portalTitle || "").trim() || null, portal_message: String(portalMessage || "").trim() || null, portal_button_label: String(portalButtonLabel || "").trim() || null })
    .select()
    .single();
  if (error) throw new Error(`Unable to create QR campaign: ${error.message}`);
  return data;
}