import { supabase } from "./supabase";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";

export async function loadQrCampaignItems() {
  const { data, error } = await supabase
    .from("qr_campaign_items")
    .select("*")
    .order("campaign_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Unable to load QR code items: ${error.message}`);
  return data ?? [];
}

export async function addQrCampaignPollItem(campaignId, pollId) {
  const { data, error } = await supabase
    .from("qr_campaign_items")
    .insert({ campaign_id: Number(campaignId), item_type: "poll", poll_id: Number(pollId) })
    .select()
    .single();
  if (error) throw new Error(`Unable to add that poll to the QR code: ${error.message}`);
  return data;
}

export async function addQrCampaignInfoItem(campaignId, { title, body, linkUrl, linkLabel, imageUrl, accessibilityTags }) {
  const { data, error } = await supabase
    .from("qr_campaign_items")
    .insert({
      campaign_id: Number(campaignId),
      item_type: "info",
      title: String(title || "").trim(),
      body: String(body || "").trim() || null,
      link_url: String(linkUrl || "").trim() || null,
      link_label: String(linkLabel || "").trim() || null,
      image_url: String(imageUrl || "").trim() || null,
      accessibility_tags: Array.isArray(accessibilityTags) ? accessibilityTags : []
    })
    .select()
    .single();
  if (error) throw new Error(`Unable to add that info card to the QR code: ${error.message}`);
  return data;
}

// Attaches a donation option to this QR code. The IBAN/account holder/amount
// come from the workspace's shared donation_settings row (set up once, reused
// by every QR code) - a donation item only optionally carries its own
// title/body to override the default "Support this venue" copy per QR code.
export async function addQrCampaignDonationItem(campaignId, { title, body } = {}) {
  if (!DONATION_FEATURE_ENABLED) throw new Error("Donations are not enabled yet.");
  const { data, error } = await supabase
    .from("qr_campaign_items")
    .insert({
      campaign_id: Number(campaignId),
      item_type: "donation",
      title: title ? String(title).trim() || null : null,
      body: body ? String(body).trim() || null : null
    })
    .select()
    .single();
  if (error) throw new Error(`Unable to add the donation option to the QR code: ${error.message}`);
  return data;
}

// A reward or prize card shown to every voter who scans this QR code (e.g. "Free coffee
// with any vote", "Enter to win a $50 gift card"). Display-only, like an info card - not
// tied to the existing per-poll reward_code/raffle redemption system.
export async function addQrCampaignRewardItem(campaignId, { title, body, linkUrl, linkLabel, rewardCode }) {
  const { data, error } = await supabase
    .from("qr_campaign_items")
    .insert({
      campaign_id: Number(campaignId),
      item_type: "reward",
      title: String(title || "").trim(),
      body: String(body || "").trim() || null,
      link_url: String(linkUrl || "").trim() || null,
      link_label: String(linkLabel || "").trim() || null,
      reward_code: String(rewardCode || "").trim() || null
    })
    .select()
    .single();
  if (error) throw new Error(`Unable to add that reward or prize to the QR code: ${error.message}`);
  return data;
}

export async function removeQrCampaignItem(itemId) {
  const { error } = await supabase.from("qr_campaign_items").delete().eq("id", itemId);
  if (error) throw new Error(`Unable to remove that item: ${error.message}`);
}

// Swaps the `sort_order` of two items so one moves up/down in the voter-facing menu.
export async function swapQrCampaignItemPositions(itemA, itemB) {
  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase.from("qr_campaign_items").update({ sort_order: itemB.sort_order }).eq("id", itemA.id),
    supabase.from("qr_campaign_items").update({ sort_order: itemA.sort_order }).eq("id", itemB.id)
  ]);
  if (errorA || errorB) throw new Error(`Unable to reorder items: ${(errorA || errorB).message}`);
}
