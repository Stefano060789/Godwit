import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import egg from "../assets/birds/egg.svg";

export function eggPollIds(campaign, items) {
  return [...new Set([
    ...(campaign.poll_id ? [String(campaign.poll_id)] : []),
    ...items.filter((item) => String(item.campaign_id) === String(campaign.id) && item.item_type === "poll").map((item) => String(item.poll_id))
  ])];
}

export default function EggResults({ campaigns, items, polls, tasks, tasksError, onOpenEgg, onOpenFeedback, onOpenActions, onOpenContacts, t }) {
  const [metrics, setMetrics] = useState(null);
  const [access, setAccess] = useState(null);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState("all");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setMetrics(null);
    setAccess(null);
    setErrors([]);
    Promise.all([
      supabase.rpc("get_workspace_campaign_metrics"),
      supabase.rpc("get_workspace_egg_access_metrics")
    ]).then(([outcomes, visits]) => {
      if (cancelled) return;
      const failures = [outcomes.error, visits.error].filter(Boolean);
      failures.forEach((failure) => console.error("Unable to load Egg results", failure));
      setErrors(failures.map((failure) => failure.message));
      if (!outcomes.error) setMetrics(Object.fromEntries((outcomes.data || []).map((row) => [String(row.campaign_id), row])));
      if (!visits.error) setAccess(Object.fromEntries((visits.data || []).map((row) => [String(row.campaign_id), row])));
    }).catch((failure) => {
      if (cancelled) return;
      console.error("Unable to load Egg results", failure);
      setErrors([failure.message]);
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const visible = campaigns.filter((campaign) => selected === "all" || String(campaign.id) === selected);
  return <section className="hub-page" aria-labelledby="egg-results-title">
    <header className="hub-page-heading">
      <p className="goal-eyebrow">{t("admin.hub.results", { defaultValue: "Results" })}</p>
      <h2 id="egg-results-title">{t("admin.eggResults.title", { defaultValue: "See what your Eggs bring back" })}</h2>
      <p>{t("admin.eggResults.intro", { defaultValue: "Visits, responses and contacts, by location." })}</p>
    </header>
    <div className="egg-results-toolbar">
      <label>{t("admin.hub.eggs", { defaultValue: "Eggs" })}<select value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="all">{t("admin.eggResults.all", { defaultValue: "All Eggs" })}</option>
        {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
      </select></label>
      <button type="button" className="hub-secondary-action" onClick={() => setRefresh((value) => value + 1)}>{t("admin.eggResults.refresh", { defaultValue: "Refresh" })}</button>
    </div>
    {errors.map((error, index) => <p key={index} role="alert" className="hub-error">{error}</p>)}
    {!campaigns.length && <p className="hub-empty">{t("admin.eggResults.empty", { defaultValue: "Create your first Egg to start collecting results." })}</p>}
    <div className="egg-results-grid">
      {visible.map((campaign) => {
        const outcomes = metrics?.[String(campaign.id)];
        const visits = access?.[String(campaign.id)];
        const ids = eggPollIds(campaign, items);
        const linkedTasks = tasks.filter((task) => (task.woodpecker_task_campaigns || []).some((link) => String(link.campaign_id) === String(campaign.id)));
        const stats = [
          [t("admin.eggResults.qr", { defaultValue: "QR visits" }), visits ? Number(visits.qr_access_count) : null],
          [t("admin.eggResults.nfc", { defaultValue: "NFC visits" }), visits ? Number(visits.nfc_access_count) : null],
          [t("admin.eggResults.responses", { defaultValue: "Poll responses" }), outcomes ? Number(outcomes.response_count) : null],
          [t("admin.eggResults.contacts", { defaultValue: "Contacts" }), outcomes ? Number(outcomes.lead_count) : null]
        ];
        return <article key={campaign.id} className="egg-result-card">
          <div className="egg-result-heading"><img src={egg} alt="" width="40" height="40" /><div><h3>{campaign.name}</h3><p>{campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}</p></div></div>
          <p className="egg-target">{campaign.goal_key ? t(`quickStart.goals.${campaign.goal_key}.title`) : t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</p>
          <dl className="egg-result-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? "\u2014" : value}</dd></div>)}</dl>
          {ids.length > 0 && <details className="egg-result-details"><summary>{t("admin.eggResults.answers", { defaultValue: "View poll answers" })}</summary>
            <p className="hub-caption">{t("admin.eggResults.sharedPoll", { defaultValue: "Poll reports include all responses to that poll. Counts above are attributed to this Egg." })}</p>
            {ids.map((id) => <Link key={id} to={`/results/${encodeURIComponent(id)}`}>{polls.find((poll) => String(poll.id) === id)?.question || t("admin.polls.card.pollNumber", { id })}</Link>)}
          </details>}
          {tasksError ? <p role="alert" className="hub-error">{tasksError}</p> : linkedTasks.length > 0 && <details className="egg-result-details">
            <summary>{t("admin.eggResults.actions", { defaultValue: "Connected actions" })}</summary>
            <p className="hub-caption">{t("admin.eggResults.sharedActions", { defaultValue: "Action status is shared wherever that action is connected." })}</p>
            {linkedTasks.map((task) => <p key={task.id}>{task.title} · {t(`woodpecker.status.${task.status}`, { defaultValue: task.status })}</p>)}
            <button type="button" className="goal-text-link" onClick={onOpenActions}>{t("admin.eggResults.actionDetails", { defaultValue: "Action responses & history" })}</button>
          </details>}
          <button type="button" className="goal-text-link" onClick={() => onOpenEgg(campaign.id)}>{t("admin.eggResults.openEgg", { defaultValue: "Open Egg" })} &rarr;</button>
        </article>;
      })}
    </div>
    <div className="egg-results-links">
      <Link className="goal-text-link" to="/admin/analytics">{t("admin.eggResults.analytics", { defaultValue: "Detailed analytics" })}</Link>
      <button type="button" className="goal-text-link" onClick={onOpenFeedback}>{t("admin.eggResults.feedback", { defaultValue: "Feedback & follow-up" })}</button>
      <button type="button" className="goal-text-link" onClick={onOpenContacts}>{t("admin.eggResults.contactDetails", { defaultValue: "Contacts & exports" })}</button>
    </div>
  </section>;
}
