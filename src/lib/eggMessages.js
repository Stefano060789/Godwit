import { supabase } from "./supabase";

export async function loadEggMessagePage(campaignId, cursor = null) {
  const { data, error } = await supabase.rpc("get_workspace_egg_messages", {
    target_campaign_id: campaignId,
    before_created_at: cursor?.created_at ?? null,
    before_message_id: cursor?.id ?? null
  });
  if (error) throw new Error(error.message);
  const rows = data || [];
  return { messages: rows.slice(0, 20), hasMore: rows.length > 20 };
}
