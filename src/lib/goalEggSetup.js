import { supabase } from "./supabase";
import { addQrCampaignInfoItem, addQrCampaignPollItem } from "./qrCampaignItems";
import { normalizeEggEmailBenefit } from "./eggBenefits";

export async function createGoalEggSetup({ campaign, workspaceId, userId, pollDraft, actionDraft, emailBenefit, reviewCards = [] }) {
  const benefitFields = normalizeEggEmailBenefit(emailBenefit);
  for (const card of reviewCards) {
    let url;
    try {
      url = new URL(card.linkUrl);
    } catch {
      throw new Error("Fix the review links in Settings before creating this Egg.");
    }
    if (url.protocol !== "https:" || url.username || url.password || !card.title?.trim()) {
      throw new Error("Fix the review links in Settings before creating this Egg.");
    }
  }
  let poll = null;
  try {
    const { data: createdPoll, error: pollError } = await supabase
      .from("polls")
      .insert({
        ...benefitFields,
        workspace_id: workspaceId,
        question: pollDraft.question,
        answers: pollDraft.answers,
        multiple_choice: false,
        allow_user_answers: false,
        allow_organizer_messages: true,
        creator_id: userId
      })
      .select()
      .single();
    if (pollError) throw new Error(`Unable to create the generated poll: ${pollError.message}`);
    poll = createdPoll;

    const pollItem = await addQrCampaignPollItem(campaign.id, poll.id);
    const { data: task, error: taskError } = await supabase
      .from("woodpecker_tasks")
      .insert({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        title: actionDraft.title,
        description: actionDraft.description,
        completion_mode: "manual",
        response_mode: "text"
      })
      .select()
      .single();
    if (taskError) throw new Error(`Unable to create the generated action: ${taskError.message}`);
    const reviewItems = [];
    for (const card of reviewCards) {
      reviewItems.push(await addQrCampaignInfoItem(campaign.id, card));
    }

    return {
      poll,
      pollItem,
      reviewItems,
      task: { ...task, woodpecker_task_campaigns: [{ campaign_id: campaign.id }] }
    };
  } catch (error) {
    const cleanupErrors = [];
    if (poll?.id) {
      const { error: pollCleanupError } = await supabase.from("polls").delete().eq("id", poll.id);
      if (pollCleanupError) cleanupErrors.push(`poll cleanup failed: ${pollCleanupError.message}`);
    }

    if (cleanupErrors.length) {
      throw new Error(`${error.message} Partial setup cleanup failed (${cleanupErrors.join("; ")}).`);
    }
    throw error;
  }
}
