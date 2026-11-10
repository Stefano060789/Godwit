import { supabase } from "./supabase";
import { START_GOALS } from "./startGuide";
import { isBusinessType, PERSONAS } from "./personas";

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

export async function createQrCampaign({ name, pollId, token, placementLabel, variantLabel, portalTitle, portalMessage, portalButtonLabel, goalKey, goalKeys, goalContext, businessType, workspaceId, aiEnabled }) {
  if (goalKeys !== undefined && !Array.isArray(goalKeys)) throw new Error("Choose valid Egg goals.");
  if (goalContext !== undefined && (typeof goalContext !== "string" || goalContext.length > 500)) throw new Error("Egg goal details must be 500 characters or fewer.");
  const selectedGoalKeys = goalKeys === undefined ? (goalKey ? [goalKey] : []) : [...new Set(goalKeys)];
  if (selectedGoalKeys.some((key) => !START_GOALS.some((goal) => goal.key === key))) throw new Error("Choose a valid Egg goal.");
  if (goalKeys !== undefined && selectedGoalKeys.length === 0) throw new Error("Choose at least one Egg goal.");
  if (businessType && !isBusinessType(businessType) && !PERSONAS.some((business) => business.audienceKey === businessType)) {
    throw new Error("Choose a valid business type.");
  }
  const goalFields = {
    ...(goalKeys !== undefined
      ? { goal_keys: selectedGoalKeys, goal_key: selectedGoalKeys[0] }
      : goalKey ? { goal_key: goalKey } : {}),
    ...(businessType ? { business_type: businessType } : {}),
    ...(goalContext !== undefined ? { goal_context: String(goalContext).trim() || null } : {}),
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