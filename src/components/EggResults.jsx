import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import egg from "../assets/birds/egg.svg";
import { getCampaignGoalKeys } from "../lib/startGuide";
import EggMessageHistory from "./EggMessageHistory";

function PrivateFeedback({ campaignId, refresh, t }) {
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setFeedback(null);
    setError(false);
    supabase.from("egg_review_feedback").select("id, feedback, created_at")
      .eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(3)
      .then(({ data, error: resultError }) => {
        if (!active) return;
        if (resultError) {
          console.error("Unable to load private feedback", resultError);
          setError(true);
        } else setFeedback(data || []);
      }).catch((failure) => {
        if (!active) return;
        console.error("Unable to load private feedback", failure);
        setError(true);
      });
    return () => { active = false; };
  }, [campaignId, refresh]);
  return <div>
    <h4>{t("admin.eggResults.recentFeedback", { defaultValue: "Recent private feedback" })}</h4>
    {error ? <p role="alert">{t("admin.eggResults.feedbackUnavailable", { defaultValue: "Private feedback is unavailable. Try refreshing." })}</p>
      : !feedback ? <p>{t("admin.eggResults.feedbackLoading", { defaultValue: "Loading private feedback…" })}</p>
        : feedback.length ? <ul>{feedback.map((item) => <li key={item.id}>{item.feedback}</li>)}</ul>
          : <p>{t("admin.eggResults.noFeedback", { defaultValue: "No private feedback yet." })}</p>}
    <p>{t("admin.eggResults.feedbackPreview", { defaultValue: "Showing up to three recent submissions." })}</p>
  </div>;
}

export default function EggResults({ campaigns, canViewMessages, onOpenEgg, t }) {
  const [summaries, setSummaries] = useState(null);
  const [errors, setErrors] = useState([]);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [selected, setSelected] = useState("all");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!canViewMessages) return undefined;
    let cancelled = false;
    setSummaries(null);
    setErrors([]);
    setActivity(null);
    setActivityError(false);
    supabase.rpc("get_workspace_primary_goal_progress").then((result) => {
      if (cancelled) return;
      if (result.error) {
        console.error("Unable to load Egg activity", result.error);
        setActivityError(true);
      } else {
        setActivity(result.data || []);
      }
    }).catch((failure) => {
      if (cancelled) return;
      console.error("Unable to load Egg activity", failure);
      setActivityError(true);
    });
    supabase.rpc("get_workspace_egg_message_summaries").then((result) => {
      if (cancelled) return;
      if (result.error) {
        console.error("Unable to load Egg message summaries", result.error);
        setErrors([result.error.message]);
      } else {
        setSummaries(Object.fromEntries((result.data || []).map((row) => [String(row.campaign_id), row])));
      }
    }).catch((failure) => {
      if (cancelled) return;
      console.error("Unable to load Egg message summaries", failure);
      setErrors([failure.message]);
    });
    return () => { cancelled = true; };
  }, [canViewMessages, refresh]);

  const visible = campaigns.filter((campaign) => selected === "all" || String(campaign.id) === selected);
  const visibleMessageCount = visible.reduce((count, campaign) => count + Number(summaries?.[String(campaign.id)]?.message_count || 0), 0);
  return <section className="hub-page" aria-labelledby="egg-results-title">
    <header className="hub-page-heading">
      <p className="goal-eyebrow">{t("admin.hub.results", { defaultValue: "Results" })}</p>
      <h2 id="egg-results-title">{t("admin.eggResults.title", { defaultValue: "What customers are telling you" })}</h2>
      <p>{t("admin.eggResults.intro", { defaultValue: "Read private messages customers have sent through your Eggs." })}</p>
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
    {campaigns.length > 0 && canViewMessages && summaries && <p className="egg-message-total">
      {t("admin.eggResults.messageTotal", { count: visibleMessageCount, defaultValue: `Customer messages: ${visibleMessageCount}` })}
    </p>}
    <div className="egg-results-grid">
      {visible.map((campaign) => {
        const summary = summaries?.[String(campaign.id)];
        const goalKeys = getCampaignGoalKeys(campaign);
        const messages = Array.isArray(summary?.latest_messages) ? summary.latest_messages : [];
        const totals = (activity || []).filter((row) => String(row.campaign_id) === String(campaign.id))
          .reduce((counts, row) => {
            const count = Number(row.event_count);
            if (Number.isFinite(count) && count >= 0) counts[row.metric] = (counts[row.metric] || 0) + count;
            return counts;
          }, {});
        return <article key={campaign.id} className="egg-result-card">
          <div className="egg-result-heading"><img src={egg} alt="" width="40" height="40" /><div><h3>{campaign.name}</h3><p>{campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}</p></div></div>
          <p className="egg-target">{goalKeys.length
            ? goalKeys.map((key) => t(`quickStart.goals.${key}.title`)).join(" · ")
            : t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</p>
          {canViewMessages && <div>
            <h4>{t("admin.eggResults.activityTitle", { defaultValue: "Recorded activity · last 30 days" })}</h4>
            {activityError ? <p role="alert">{t("admin.eggResults.activityUnavailable", { defaultValue: "Activity is unavailable. Try refreshing." })}</p>
              : !activity ? <p>{t("admin.eggResults.activityLoading", { defaultValue: "Loading activity…" })}</p>
                : <ul>
                  <li>{t("admin.eggResults.pollSelections", { defaultValue: "Poll answer selections" })}: {totals.responses || 0}</li>
                  <li>{t("admin.eggResults.promotionClicks", { defaultValue: "Promotion link clicks" })}: {totals.promotion_clicks || 0}</li>
                  <li>{t("admin.eggResults.issueReports", { defaultValue: "Issue reports" })}: {totals.issues || 0}</li>
                  <li>{t("admin.eggResults.privateFeedback", { defaultValue: "Private feedback submissions" })}: {totals.private_reviews || 0}</li>
                </ul>}
            <p>{t("admin.eggResults.activityLimits", { defaultValue: "Multi-select votes can count more than once. Promotion clicks are recorded only for eligible promotion Eggs, not all menu links, and do not confirm bookings or sales. Small numbers may not represent all visitors." })}</p>
          </div>}
          {canViewMessages && <PrivateFeedback campaignId={campaign.id} refresh={refresh} t={t} />}
          <div className="egg-result-messages">
            <h4>{t("admin.eggResults.customerMessages", { defaultValue: "Customer messages" })} <span>{summary?.message_count ?? "—"}</span></h4>
            {!canViewMessages
              ? <p className="hub-caption">{t("admin.eggResults.managerOnly", { defaultValue: "Only workspace owners and editors can view private customer messages." })}</p>
              : errors.length
                ? <p className="hub-caption">{t("admin.eggResults.unavailable", { defaultValue: "Message summary is unavailable. Try refreshing." })}</p>
                : !summary
              ? <p className="hub-caption">{t("admin.eggResults.loading", { defaultValue: "Loading messages…" })}</p>
              : messages.length === 0
                ? <p className="hub-caption">{t("admin.eggResults.noMessages", { defaultValue: "No customer messages yet." })}</p>
                : <EggMessageHistory key={`${campaign.id}-${refresh}`} campaignId={campaign.id} preview={messages} total={Number(summary.message_count)} t={t} />}
          </div>
          <button type="button" className="goal-text-link" onClick={() => onOpenEgg(campaign.id)}>{t("admin.eggResults.openEgg", { defaultValue: "Open Egg" })} &rarr;</button>
        </article>;
      })}
    </div>
  </section>;
}
