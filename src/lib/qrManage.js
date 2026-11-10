import { supabase } from "./supabase";

export function extractQrToken(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  const match = value.match(/\/qr\/([^/?#]+)/);
  if (match) return decodeURIComponent(match[1]);
  if (/^https?:\/\//i.test(value)) return "";
  return value;
}

export async function resolveManagedQrToken(token) {
  if (!token) return null;

  const { data: campaign, error: campaignError } = await supabase
    .from("qr_campaigns")
    .select("id, name, poll_id, workspace_id, placement_label, variant_label")
    .eq("token", token)
    .maybeSingle();

  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) return null;

  const [{ data: polls, error: pollsError }, { data: currentPoll, error: currentPollError }] = await Promise.all([
    supabase.from("polls").select("id, question").eq("workspace_id", campaign.workspace_id).order("id", { ascending: false }),
    campaign.poll_id
      ? supabase.from("polls").select("id, question").eq("id", campaign.poll_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (pollsError || currentPollError) throw new Error((pollsError || currentPollError).message);
  return { campaign, currentPoll, polls: polls || [] };
}

export async function reassignManagedCampaignPoll(campaignId, nextPollId) {
  const { error } = await supabase
    .from("qr_campaigns")
    .update({ poll_id: Number(nextPollId) })
    .eq("id", campaignId);
  return error;
}
