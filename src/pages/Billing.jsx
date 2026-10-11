import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import { loadWorkspaceProfile } from "../lib/workspaceProfile";
import { PLAN_FEATURES, planLabel } from "../lib/entitlements";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";

const PLANS = [
  { key: "free", amount: "EUR 0", recurring: false },
  { key: "starter", amount: "EUR 29", recurring: true },
  { key: "growth", amount: "EUR 79", recurring: true, highlight: true }
];

const COMPARISON_ROWS = [
  { rowKey: "pollLimit", format: (value) => value },
  { rowKey: "campaignLimit", format: (value) => value },
  { rowKey: "seatLimit", format: (value) => value },
  ...(DONATION_FEATURE_ENABLED ? [{ rowKey: "donations" }] : []),
  { rowKey: "csvExport" },
  { rowKey: "auditLog" },
  { rowKey: "weeklyReport" },
  { rowKey: "rewardMessage" },
  { rowKey: "emailBenefits" },
  { rowKey: "publicReviewLinks" },
  { rowKey: "leadCapture" },
  { rowKey: "redemptionTracking" },
  { rowKey: "prizeDraws" },
  { rowKey: "automatedNurture" },
  { rowKey: "reputationMonitoring" },
  { rowKey: "webhooks" },
  { rowKey: "apiAccess" }
];

function FeatureCell({ value }) {
  if (typeof value === "boolean") {
    return value ? <span className="text-emerald-400">✓</span> : <span className="text-slate-600">—</span>;
  }
  return <span>{value}</span>;
}

export default function Billing() {
  const { t } = useTranslation();
  const [currentPlan, setCurrentPlan] = useState("");
  const [pilotEndDate, setPilotEndDate] = useState("");

  useEffect(() => {
    async function loadCurrentPlan() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      try {
        const profile = await loadWorkspaceProfile();
        setCurrentPlan(profile.plan || "free");
        const { data: endDate, error: endDateError } = await supabase.rpc("pilot_end_date");
        if (endDateError) throw endDateError;
        setPilotEndDate(endDate || "2026-10-01");
      } catch (profileError) {
        console.error(profileError);
      }
    }
    loadCurrentPlan();
  }, []);

  return (
    <Layout theme="workspace">
      <div className="max-w-5xl mx-auto p-6">
        <h1 className="text-3xl font-bold text-center">{t("billing.title")}</h1>
        <p className="mt-2 text-center text-sm text-slate-400">{t("billing.subtitle")}</p>
        <p className="mx-auto mt-3 max-w-xl rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-center text-sm font-semibold text-amber-200">{t("billing.pilotNotice", { date: pilotEndDate ? new Date(`${pilotEndDate}T00:00:00`).toLocaleDateString("en-GB") : "1 October 2026" })}</p>
        {currentPlan && <p className="mt-2 text-center text-sm text-teal-300">{t("billing.currentPlanNotice", { plan: planLabel(currentPlan) })}</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const planName = t(`billing.plans.${plan.key}.name`);
            return (
              <section
                key={plan.key}
                className={`relative border p-5 rounded-lg bg-slate-900 ${plan.highlight ? "border-teal-400 ring-1 ring-teal-400" : "border-slate-700"}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-400 px-3 py-1 text-xs font-bold text-slate-950">{t("billing.mostPopular")}</span>
                )}
                <h2 className="text-xl font-bold">{planName}</h2>
                <p className="mt-2 text-lg font-semibold text-emerald-300">{plan.amount}{plan.recurring ? ` ${t("billing.perMonth")}` : ""}</p>
                <p className="mt-2 min-h-12 text-sm text-slate-300">{t(`billing.plans.${plan.key}.description`)}</p>
                <button
                 disabled
                  className="mt-4 w-full rounded bg-blue-600 p-3 font-semibold text-white disabled:opacity-60"
                >
                  {isCurrent
                    ? t("billing.currentPlanButton")
                    : plan.key === "free"
                    ? t("billing.includedByDefault")
                    : t("billing.pilotOnly")}
                </button>
              </section>
            );
          })}
        </div>

        <h2 className="mt-12 text-xl font-bold text-center">{t("billing.compareTitle")}</h2>
        <p className="mt-1 text-center text-sm text-slate-400">{t("billing.compareSubtitle")}</p>

        {/* Below sm: a table with 4 columns and long feature names doesn't fit a phone screen even
            with horizontal scroll enabled (it's easy to not notice there's more to scroll to), so
            stack one card per plan instead - each lists every feature vertically, no side-scrolling
            needed. From sm and up, there's enough width for the side-by-side table. */}
        <div className="mt-4 grid gap-3 sm:hidden">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-lg border p-4 ${plan.highlight ? "border-amber-400 bg-amber-400/5" : "border-slate-700"}`}
            >
              <p className={`font-semibold ${plan.highlight ? "text-teal-300" : "text-slate-100"}`}>
                {t(`billing.plans.${plan.key}.name`)}
                {currentPlan === plan.key && <span className="ml-1.5 text-xs font-normal text-slate-400">{t("billing.currentTag")}</span>}
              </p>
              <dl className="mt-2 divide-y divide-slate-800">
                {COMPARISON_ROWS.map((row) => {
                  const value = PLAN_FEATURES[plan.key][row.rowKey];
                  return (
                    <div key={row.rowKey} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <dt className="text-slate-400">{t(`billing.rows.${row.rowKey}`)}</dt>
                      <dd className="shrink-0 font-semibold text-slate-100">
                        <FeatureCell value={row.format ? row.format(value) : value} />
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-700 sm:block">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900 text-left">
                <th className="p-3 font-semibold text-slate-300">{t("billing.featureHeader")}</th>
                {PLANS.map((plan) => (
                  <th
                    key={plan.key}
                    className={`p-3 text-center font-semibold ${plan.highlight ? "text-teal-300" : "text-slate-300"}`}
                  >
                    {t(`billing.plans.${plan.key}.name`)}
                    {currentPlan === plan.key && <span className="ml-1.5 font-normal text-xs text-slate-400">{t("billing.currentTag")}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.rowKey} className="border-b border-slate-800 last:border-b-0">
                  <td className="p-3 text-slate-300">{t(`billing.rows.${row.rowKey}`)}</td>
                  {PLANS.map((plan) => {
                    const value = PLAN_FEATURES[plan.key][row.rowKey];
                    return (
                      <td key={plan.key} className={`p-3 text-center text-slate-100 ${plan.highlight ? "bg-teal-400/5" : ""}`}>
                        <FeatureCell value={row.format ? row.format(value) : value} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">{t("billing.paymentsNote")}</p>
      </div>
    </Layout>
  );
}