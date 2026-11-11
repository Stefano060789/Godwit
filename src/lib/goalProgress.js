import { supabase } from "./supabase";

export async function submitEggReviewFeedback(campaignId, sessionId, feedback) {
  const { data, error } = await supabase.rpc("submit_egg_review_feedback", {
    target_campaign_id: Number(campaignId),
    target_session_id: sessionId,
    review_feedback: feedback
  });
  if (error) throw new Error(`Unable to submit review feedback: ${error.message}`);
  return data === true;
}

export async function recordEggPromotionLinkClick(campaignId, itemId, sessionId) {
  const { error } = await supabase.rpc("record_egg_promotion_link_click", {
    target_campaign_id: Number(campaignId),
    target_item_id: Number(itemId),
    target_session_id: sessionId
  });
  if (error) throw new Error(`Unable to record promotion link click: ${error.message}`);
}
