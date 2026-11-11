import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getCampaignGoalKeys } from "../lib/startGuide";

const DAY_COUNT = 30;
const GOAL_MEASURES = [
  { metric: "responses", goals: ["feedback", "preferences", "satisfaction", "event-interest"] },
  { metric: "contacts", goals: ["contacts"] },
  { metric: "issues", goals: ["issue-reporting"] }
];

function createTimeline(now) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (DAY_COUNT - index - 1));
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
}

function buildDailyProgress(records, campaignIds, metric, now) {
  const days = createTimeline(now);
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const record of records) {
    if (record.metric !== metric || !campaignIds.has(String(record.campaign_id))) continue;
    const day = byDate.get(String(record.activity_date).slice(0, 10));
    const count = Number(record.event_count);
    if (day && Number.isFinite(count) && count > 0) day.count += count;
  }

  return days;
}

export function buildDailyGoalProgress(records, campaignId, metric, now = new Date()) {
  const campaignIds = campaignId === "all" ? new Set(records.map((record) => String(record.campaign_id))) : new Set([String(campaignId)]);
  return buildDailyProgress(records, campaignIds, metric, now);
}

export function buildGoalProgressSeries(records, campaigns, selectedCampaignId, now = new Date()) {
  const scopedCampaigns = campaigns.filter((campaign) => selectedCampaignId === "all" || String(campaign.id) === String(selectedCampaignId));
  const goalKeys = [...new Set(scopedCampaigns.flatMap(getCampaignGoalKeys))];
  const series = GOAL_MEASURES.flatMap(({ metric, goals }) => {
    const campaignIds = new Set(scopedCampaigns
      .filter((campaign) => getCampaignGoalKeys(campaign).some((key) => goals.includes(key)))
      .map((campaign) => String(campaign.id)));
    if (!campaignIds.size) return [];

    const daily = buildDailyProgress(records, campaignIds, metric, now);
    return [{
      metric,
      goals: goalKeys.filter((key) => goals.includes(key)),
      daily,
      total: daily.reduce((sum, day) => sum + day.count, 0)
    }];
  });
  const trackedGoals = new Set(series.flatMap((item) => item.goals));

  return {
    series,
    untrackedGoals: goalKeys.filter((key) => !trackedGoals.has(key))
  };
}

export default function GoalProgress({ campaigns, t }) {
  const [records, setRecords] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    supabase.rpc("get_workspace_primary_goal_progress").then(({ data, error: resultError }) => {
      if (!active) return;
      if (resultError) {
        console.error("Unable to load goal progress", resultError);
        setError(resultError.message);
      } else {
        setRecords(data || []);
      }
    }).catch((failure) => {
      if (!active) return;
      console.error("Unable to load goal progress", failure);
      setError(failure.message || "Unable to load goal progress.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selected = campaigns.find((campaign) => String(campaign.id) === selectedCampaign);
  const progress = useMemo(
    () => buildGoalProgressSeries(records, campaigns, selectedCampaign),
    [records, campaigns, selectedCampaign]
  );
  const max = Math.max(1, ...progress.series.flatMap((item) => item.daily.map((day) => day.count)));
  const chartWidth = 720;
  const chartHeight = 250;
  const left = 36;
  const right = 12;
  const top = 18;
  const baseline = 194;
  const x = (index) => left + index * ((chartWidth - left - right) / (DAY_COUNT - 1));
  const y = (count) => baseline - (count / max) * (baseline - top);
  const allGoalKeys = [...new Set((selected ? getCampaignGoalKeys(selected) : campaigns.flatMap(getCampaignGoalKeys)))];

  return <section className="hub-page goal-progress" aria-labelledby="goal-progress-title">
    <header className="hub-page-heading">
      <p className="goal-eyebrow">{t("admin.hub.goalProgress", { defaultValue: "Goal Progress" })}</p>
      <h2 id="goal-progress-title">{t("admin.goalProgress.title", { defaultValue: "See how your Eggs are performing" })}</h2>
      <p>{t("admin.goalProgress.intro", { defaultValue: "See measurable outcomes related to your Egg goals over the last 30 days." })}</p>
    </header>

    <div className="goal-progress-filters">
      <label>{t("admin.hub.eggs", { defaultValue: "Eggs" })}
        <select value={selectedCampaign} onChange={(event) => setSelectedCampaign(event.target.value)}>
          <option value="all">{t("admin.goalProgress.allEggs", { defaultValue: "All Eggs" })}</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </label>
    </div>

    {selected && <div className="goal-progress-context">
      <strong>{allGoalKeys.length
        ? allGoalKeys.map((key) => t(`quickStart.goals.${key}.title`)).join(" · ")
        : t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</strong>
      {selected.goal_context && <p>{selected.goal_context}</p>}
    </div>}

    {error && <p role="alert" className="hub-error">{t("admin.goalProgress.loadError", { defaultValue: "Progress data could not be loaded. Please try again later." })}</p>}
    {!campaigns.length && <p className="hub-empty">{t("admin.goalProgress.emptyEggs", { defaultValue: "Create an Egg to start tracking progress." })}</p>}
    {campaigns.length > 0 && !loading && !error && !progress.series.length && <p className="hub-empty">{t("admin.goalProgress.noTrackedOutcomes", { defaultValue: "There are no tracked outcomes for these Egg goals yet." })}</p>}
    {campaigns.length > 0 && <>
      {progress.series.length > 0 && <article className="goal-progress-chart-card">
        <div className="goal-progress-chart-heading">
          <div>
            <h3>{t("admin.goalProgress.outcomesTitle", { defaultValue: "Goal outcomes" })}</h3>
            <p>{t("admin.goalProgress.period", { defaultValue: "Last 30 days" })}</p>
          </div>
          <div className="goal-progress-legend" aria-label={t("admin.goalProgress.legend", { defaultValue: "Chart legend" })}>
            {progress.series.map((item) => <span key={item.metric} className={`goal-progress-legend-item goal-progress-color-${item.metric}`}>
              <i aria-hidden="true" />{t(`admin.goalProgress.series.${item.metric}`)}
            </span>)}
          </div>
        </div>
        <div className="goal-progress-outcome-cards">
          {progress.series.map((item) => <div key={item.metric} className={`goal-progress-outcome goal-progress-color-${item.metric}`}>
            <p>{t(`admin.goalProgress.series.${item.metric}`)}</p>
            <small>{item.goals.map((key) => t(`quickStart.goals.${key}.title`)).join(" · ")}</small>
            <strong>{loading ? "—" : item.total.toLocaleString()}</strong>
          </div>)}
        </div>
        <div className="goal-progress-chart-scroll">
          <svg
            className="goal-progress-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={t("admin.goalProgress.chartLabel", {
              defaultValue: "Tracked goal outcomes over the last 30 days"
            })}
          >
            {[0, 1, 2, 3].map((step) => {
              const gridY = top + step * ((baseline - top) / 3);
              const tick = Math.round(max * (1 - step / 3));
              return <g key={step}>
                <line x1={left} x2={chartWidth - right} y1={gridY} y2={gridY} className="goal-progress-gridline" />
                <text x={left - 8} y={gridY + 3} textAnchor="end" className="goal-progress-axis-label">{tick}</text>
              </g>;
            })}
            {progress.series.map((item) => <polyline
              key={item.metric}
              points={item.daily.map((day, index) => `${x(index)},${y(day.count)}`).join(" ")}
              className={`goal-progress-line goal-progress-color-${item.metric}`}
            />)}
            {progress.series[0].daily.map((day, index) => index % 7 === 0 || index === progress.series[0].daily.length - 1
              ? <text key={day.date} x={x(index)} y={chartHeight - 14} textAnchor="middle" className="goal-progress-axis-label">{day.date.slice(5)}</text>
              : null)}
          </svg>
        </div>
      </article>}
      {progress.untrackedGoals.length > 0 && <aside className="goal-progress-untracked">
        <strong>{t("admin.goalProgress.untrackedTitle", { defaultValue: "Other goals are not measured here yet" })}</strong>
        <p>{t("admin.goalProgress.untrackedNote", { defaultValue: "Godwit does not yet track the outcome for these goals, so no estimated value is shown." })}</p>
        <ul>{progress.untrackedGoals.map((key) => <li key={key}>{t(`quickStart.goals.${key}.title`)}</li>)}</ul>
      </aside>}
      <p className="goal-progress-footnote">{t("admin.goalProgress.metricNote", { defaultValue: "Poll responses, consented email sign-ups, and issue reports are counted from recorded activity. Goals without that data are shown separately." })}</p>
    </>}
  </section>;
}
