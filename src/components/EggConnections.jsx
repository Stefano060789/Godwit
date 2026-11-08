import { useState } from "react";
import { Link } from "react-router-dom";

export default function EggConnections({
  campaign, polls, items, tasks, tasksError, canManage, isAiManaged = false, t,
  onOpenPoll, onAddPoll, onRemoveItem, onAttachAction, onCreateAction, onOpenActions
}) {
  const [pollId, setPollId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pollItems = items.filter((item) => item.item_type === "poll");
  const linkedPollIds = new Set(pollItems.map((item) => String(item.poll_id)));
  if (campaign.poll_id) linkedPollIds.add(String(campaign.poll_id));
  const availablePolls = polls.filter((poll) => !pollItems.some((item) => String(item.poll_id) === String(poll.id)));
  const linkedTasks = tasks.filter((task) => (task.woodpecker_task_campaigns || [])
    .some((link) => String(link.campaign_id) === String(campaign.id)));
  const availableTasks = tasks.filter((task) => !linkedTasks.includes(task));
  const infoCount = items.filter((item) => item.item_type === "info").length;
  const rewardCount = items.filter((item) => item.item_type === "reward").length;
  const defaultIsItem = pollItems.some((item) => String(item.poll_id) === String(campaign.poll_id));

  async function run(operation, clear) {
    setError("");
    setBusy(true);
    try {
      await operation();
      clear();
    } catch (failure) {
      console.error("Unable to update Egg connections", failure);
      setError(failure.message || t("admin.eggConnections.updateFailed", { defaultValue: "Unable to update this Egg." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="egg-connections" aria-label={t("admin.eggConnections.label", { defaultValue: "Egg connections" })}>
      <div className="egg-connections-heading">
        <div>
          <p className="egg-connections-eyebrow">{t("admin.eggConnections.eyebrow", { defaultValue: "One Egg, connected" })}</p>
          <h3>{t("admin.eggConnections.title", { defaultValue: "What this Egg connects" })}</h3>
        </div>
        <span className="egg-connections-mark" aria-hidden="true">🥚</span>
      </div>
      <div className="egg-connections-grid">
        <div className="egg-connections-panel">
          {isAiManaged ? <>
            <h4>{t("admin.goal.aiManagedTitle", { defaultValue: "AI-managed feedback" })}</h4>
            <p>{t("admin.goal.aiManagedBody", { defaultValue: "Godwit handles the poll questions for this Egg. See what customers tell you in Results." })}</p>
          </> : <>
          <h4>{t("admin.engagement.items.sectionPolls")}</h4>
          {linkedPollIds.size === 0 && <p>{t("admin.eggConnections.noPolls", { defaultValue: "No polls connected yet." })}</p>}
          {campaign.poll_id && !defaultIsItem && (
            <div className="egg-connection-row">
              <button type="button" className="egg-connection-link" onClick={() => onOpenPoll(campaign.poll_id)}>
                {polls.find((poll) => String(poll.id) === String(campaign.poll_id))?.question || t("admin.polls.card.pollNumber", { id: campaign.poll_id })}
              </button>
              <span>{t("admin.eggConnections.defaultPoll", { defaultValue: "Default" })}</span>
            </div>
          )}
          {campaign.poll_id && !defaultIsItem && (items.length > 0 || linkedTasks.length > 0) && (
            <p className="egg-connections-warning">{t("admin.eggConnections.defaultFallback", { defaultValue: "The default poll is a fallback and may not appear when this Egg has items or actions. Add it as an item to include it in the Egg menu." })}</p>
          )}
          {pollItems.map((item) => (
            <div className="egg-connection-row" key={item.id}>
              <button type="button" className="egg-connection-link" onClick={() => onOpenPoll(item.poll_id)}>
                {polls.find((poll) => String(poll.id) === String(item.poll_id))?.question || t("admin.polls.card.pollNumber", { id: item.poll_id })}
              </button>
              {String(campaign.poll_id) === String(item.poll_id) && <span>{t("admin.eggConnections.defaultPoll", { defaultValue: "Default" })}</span>}
              {canManage && <button type="button" onClick={() => onRemoveItem(item.id)}>{t("admin.engagement.items.remove")}</button>}
            </div>
          ))}
          {canManage && (
            <>
              <div className="egg-connection-form">
                <select aria-label={t("admin.engagement.items.addPollOption")} value={pollId} onChange={(event) => setPollId(event.target.value)}>
                  <option value="">{t("admin.engagement.items.addPollOption")}</option>
                  {availablePolls.map((poll) => <option key={poll.id} value={poll.id}>{poll.question}</option>)}
                </select>
                <button type="button" disabled={!pollId || busy} onClick={() => run(() => onAddPoll(campaign.id, pollId), () => setPollId(""))}>{t("admin.engagement.items.addPoll")}</button>
              </div>
              <p>{t("admin.eggConnections.createPollHint", { defaultValue: "Create a poll, then add it here." })}</p>
              <Link className="egg-connection-link" to="/create">{t("admin.engagement.scanner.createNewPoll")}</Link>
            </>
          )}
          </>}
        </div>
        <div className="egg-connections-panel">
          <h4>{t("admin.eggConnections.actions", { defaultValue: "Actions" })}</h4>
          {tasksError ? <p role="alert">{t("admin.eggConnections.actionsUnavailable", { defaultValue: "Actions could not be loaded:" })} {tasksError}</p> : (
            <>
              {linkedTasks.length === 0 && <p>{t("admin.eggConnections.noActions", { defaultValue: "No actions connected yet." })}</p>}
              {linkedTasks.map((task) => <div className="egg-connection-row" key={task.id}><span>{task.title}</span><span>{task.status}</span></div>)}
              {linkedTasks.length > 0 && (
                <>
                  <Link className="egg-connection-link" to={`/qr/${campaign.token}/tasks`}>{t("woodpecker.openPortal")}</Link>
                  {items.length === 1 && pollItems.length === 1 && <p className="egg-connections-warning">{t("admin.eggConnections.actionVisibility", { defaultValue: "A single-poll Egg may open the poll directly. Share the Action portal link separately if needed." })}</p>}
                </>
              )}
              {canManage && (
                <>
                  <div className="egg-connection-form">
                    <select aria-label={t("admin.eggConnections.chooseAction", { defaultValue: "Choose an action" })} value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                      <option value="">{t("admin.eggConnections.chooseAction", { defaultValue: "Choose an action" })}</option>
                      {availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                    </select>
                    <button type="button" disabled={!taskId || busy} onClick={() => run(() => onAttachAction(campaign, taskId), () => setTaskId(""))}>{t("admin.engagement.wizard.addTask")}</button>
                  </div>
                  <div className="egg-connection-form">
                    <input aria-label={t("admin.engagement.wizard.taskTitle")} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder={t("admin.engagement.wizard.taskTitle")} />
                    <button type="button" disabled={!title.trim() || busy} onClick={() => run(() => onCreateAction(campaign, title), () => setTitle(""))}>{t("woodpecker.create")}</button>
                  </div>
                </>
              )}
              <button type="button" className="egg-connection-link" onClick={onOpenActions}>{t("admin.eggConnections.manageActions", { defaultValue: "Action results and settings" })}</button>
            </>
          )}
        </div>
      </div>
      <p className="egg-connections-footnote">
        {t("admin.eggConnections.otherItems", { defaultValue: "Information cards: {{info}} · Rewards: {{rewards}}", info: infoCount, rewards: rewardCount })}
      </p>
      {error && <p role="alert" className="egg-connections-error">{error}</p>}
    </section>
  );
}
