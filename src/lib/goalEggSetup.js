import { supabase } from "./supabase";
import { addQrCampaignPollItem } from "./qrCampaignItems";

export async function createGoalEggSetup({ campaign, workspaceId, userId, pollDraft, actionDraft }) {
  let poll = null;
  try {
    const { data: createdPoll, error: pollError } = await supabase
      .from("polls")
      .insert({
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

    return {
      poll,
      pollItem,
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
