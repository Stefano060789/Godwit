import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import egg from "../assets/birds/egg.svg";
import { getCampaignGoalKeys } from "../lib/startGuide";
import EggMessageHistory from "./EggMessageHistory";

export default function EggResults({ campaigns, canViewMessages, onOpenEgg, t }) {
  const [summaries, setSummaries] = useState(null);
  const [errors, setErrors] = useState([]);
  const [selected, setSelected] = useState("all");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!canViewMessages) return undefined;
    let cancelled = false;
    setSummaries(null);
    setErrors([]);
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
        return <article key={campaign.id} className="egg-result-card">
          <div className="egg-result-heading"><img src={egg} alt="" width="40" height="40" /><div><h3>{campaign.name}</h3><p>{campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}</p></div></div>
          <p className="egg-target">{goalKeys.length
            ? goalKeys.map((key) => t(`quickStart.goals.${key}.title`)).join(" · ")
            : t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</p>
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
