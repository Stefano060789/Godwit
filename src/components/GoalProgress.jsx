import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getCampaignGoalKeys } from "../lib/startGuide";

const METRICS = ["interactions", "responses", "contacts", "messages"];
const DAY_COUNT = 30;

export function buildDailyGoalProgress(records, campaignId, metric, now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (DAY_COUNT - index - 1));
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const record of records) {
    if (record.metric !== metric) continue;
    if (campaignId !== "all" && String(record.campaign_id) !== String(campaignId)) continue;
    const day = byDate.get(String(record.activity_date).slice(0, 10));
    const count = Number(record.event_count);
    if (day && Number.isFinite(count) && count > 0) day.count += count;
  }

  return days;
}

export default function GoalProgress({ campaigns, t }) {
  const [records, setRecords] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [metric, setMetric] = useState("interactions");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    supabase.rpc("get_workspace_goal_progress").then(({ data, error: resultError }) => {
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
  const daily = useMemo(
    () => buildDailyGoalProgress(records, selectedCampaign, metric),
    [records, selectedCampaign, metric]
  );
  const total = daily.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...daily.map((day) => day.count));
  const chartWidth = 720;
  const chartHeight = 250;
  const left = 36;
  const right = 12;
  const top = 18;
  const baseline = 194;
  const x = (index) => left + index * ((chartWidth - left - right) / (DAY_COUNT - 1));
  const y = (count) => baseline - (count / max) * (baseline - top);
  const points = daily.map((day, index) => `${x(index)},${y(day.count)}`).join(" ");
  const goalKeys = [...new Set((selected ? getCampaignGoalKeys(selected) : campaigns.flatMap(getCampaignGoalKeys)))];

  return <section className="hub-page goal-progress" aria-labelledby="goal-progress-title">
    <header className="hub-page-heading">
      <p className="goal-eyebrow">{t("admin.hub.goalProgress", { defaultValue: "Goal Progress" })}</p>
      <h2 id="goal-progress-title">{t("admin.goalProgress.title", { defaultValue: "See how your Eggs are performing" })}</h2>
      <p>{t("admin.goalProgress.intro", { defaultValue: "Follow customer interactions and outcomes over the last 30 days." })}</p>
    </header>

    <div className="goal-progress-filters">
      <label>{t("admin.hub.eggs", { defaultValue: "Eggs" })}
        <select value={selectedCampaign} onChange={(event) => setSelectedCampaign(event.target.value)}>
          <option value="all">{t("admin.goalProgress.allEggs", { defaultValue: "All Eggs" })}</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </label>
      <label>{t("admin.goalProgress.measure", { defaultValue: "Measure" })}
        <select value={metric} onChange={(event) => setMetric(event.target.value)}>
          {METRICS.map((key) => <option key={key} value={key}>{t(`admin.goalProgress.metrics.${key}`)}</option>)}
        </select>
      </label>
    </div>

    {selected && <div className="goal-progress-context">
      <strong>{goalKeys.length
        ? goalKeys.map((key) => t(`quickStart.goals.${key}.title`)).join(" · ")
        : t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</strong>
      {selected.goal_context && <p>{selected.goal_context}</p>}
    </div>}

    {error && <p role="alert" className="hub-error">{t("admin.goalProgress.loadError", { defaultValue: "Progress data could not be loaded. Please try again later." })}</p>}
    {!campaigns.length && <p className="hub-empty">{t("admin.goalProgress.emptyEggs", { defaultValue: "Create an Egg to start tracking progress." })}</p>}
    {campaigns.length > 0 && <>
      <article className="goal-progress-chart-card">
        <div className="goal-progress-summary">
          <div>
            <p>{t(`admin.goalProgress.metrics.${metric}`)}</p>
            <strong>{loading ? "—" : total.toLocaleString()}</strong>
          </div>
          <span>{t("admin.goalProgress.period", { defaultValue: "Last 30 days" })}</span>
        </div>
        <div className="goal-progress-chart-scroll">
          <svg
            className="goal-progress-chart"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={t("admin.goalProgress.chartLabel", {
              metric: t(`admin.goalProgress.metrics.${metric}`),
              count: total,
              defaultValue: `${total} ${metric} over the last 30 days`
            })}
          >
            {[0, 1, 2, 3].map((step) => {
              const gridY = top + step * ((baseline - top) / 3);
              return <line key={step} x1={left} x2={chartWidth - right} y1={gridY} y2={gridY} className="goal-progress-gridline" />;
            })}
            <polyline points={points} className="goal-progress-line" />
            {daily.map((day, index) => index % 7 === 0 || index === daily.length - 1
              ? <text key={day.date} x={x(index)} y={chartHeight - 14} textAnchor="middle" className="goal-progress-axis-label">{day.date.slice(5)}</text>
              : null)}
          </svg>
        </div>
      </article>
      <p className="goal-progress-footnote">{t("admin.goalProgress.metricNote", { defaultValue: "Interactions are QR or NFC opens; feedback is poll responses; contacts are consented email sign-ups; messages are private customer messages." })}</p>
    </>}
  </section>;
}
