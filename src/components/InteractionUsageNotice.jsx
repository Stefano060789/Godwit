import { Link } from "react-router-dom";
import { interactionUsageProgress } from "../lib/interactionBilling";

export default function InteractionUsageNotice({ usage, t }) {
  if (!usage) return null;
  const key = "billing.interactions";
  if (usage.error || !["active", "exhausted", "expired", "inactive", "legacy", "complimentary"].includes(usage.state)) {
    return <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">{t(`${key}.usageUnavailable`)} {usage.error ? usage.error.message || String(usage.error) : ""}</p>;
  }
  if (usage.state === "complimentary") return null;
  if (usage.state === "legacy") {
    return <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">{t(`${key}.legacy`)}</p>;
  }
  const paused = ["exhausted", "expired", "inactive"].includes(usage.state);
  const alert = usage.warning || paused;
  const trial = usage.plan === "trial";
  const date = (value) => {
    if (!value || Number.isNaN(new Date(value).getTime())) return "—";
    return new Date(value).toLocaleDateString();
  };
  return (
    <section
      role={alert ? "alert" : "status"}
      aria-label={t(`${key}.usageTitle`)}
      className={`rounded-xl border p-4 text-sm ${alert ? "border-amber-400 bg-amber-50 text-amber-950" : "border-teal-300 bg-teal-50 text-teal-950"}`}
    >
      <h2 className="font-bold">{t(`${key}.usageTitle`)}</h2>
      <p className="mt-1">{t(`${key}.${trial ? "trialUsage" : "baseUsage"}`, { used: usage.base_used, limit: usage.base_limit })}</p>
      <progress className="mt-2 h-2 w-full" aria-label={t(`${key}.baseProgress`)} max="100" value={interactionUsageProgress(usage)} />
      <p>{t(`${key}.remaining`, { count: Number(usage.interactions_remaining) || 0 })}</p>
      {usage.period_end && <p>{t(`${key}.${trial ? "trialEnds" : "periodEnds"}`, { date: date(usage.period_end) })}</p>}
      {Number(usage.topup_remaining) > 0 && (
        <p>{t(`${key}.topupRemaining`, { count: Number(usage.topup_remaining), date: date(usage.topup_expires_at) })}</p>
      )}
      {usage.next_plan && <p>{t(`${key}.nextPlan`, { plan: t(`billing.proposed.tiers.${usage.next_plan}`, { defaultValue: usage.next_plan }), date: date(usage.period_end) })}</p>}
      {paused && <p className="mt-2 font-semibold">{t(trial ? `${key}.trialPaused` : `${key}.states.${usage.state}`)}</p>}
      {usage.warning && <p className="mt-2 font-semibold">{t(`${key}.${trial ? "trialWarning" : "warning"}`)}</p>}
      {alert && (
        <div className="mt-2 flex flex-wrap gap-4 font-semibold underline">
          <Link to="/billing">{t(`${key}.viewPlans`)}</Link>
          {!trial && usage.can_topup && <Link to="/billing?topup=1">{t(`${key}.topupLink`)}</Link>}
        </div>
      )}
    </section>
  );
}
