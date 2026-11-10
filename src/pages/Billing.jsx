import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import { planLabel } from "../lib/entitlements";

const INTERACTION_PACKAGES = [
  { key: "small", interactions: 100 },
  { key: "standard", interactions: 500, highlight: true },
  { key: "scale", interactions: 2000 }
];

export default function Billing() {
  const { t } = useTranslation();
  const [currentPlan, setCurrentPlan] = useState("");
  const [trial, setTrial] = useState(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    async function loadCurrentPlan() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      setSignedIn(true);
      const { data: membership, error: membershipError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (membershipError) {
        console.error("Unable to load billing workspace", membershipError);
        return;
      }
      if (!membership?.workspace_id) return;

      const [planResult, trialResult] = await Promise.all([
        supabase.rpc("workspace_plan", { target_workspace_id: membership.workspace_id }),
        supabase.rpc("workspace_trial_status", { target_workspace_id: membership.workspace_id })
      ]);
      if (planResult.error) console.error("Unable to load billing plan", planResult.error);
      if (trialResult.error) console.error("Unable to load billing trial status", trialResult.error);
      setCurrentPlan(planResult.data || "free");
      setTrial(trialResult.error ? { state: "unavailable" } : trialResult.data || null);
    }
    loadCurrentPlan();
  }, []);

  return (
    <Layout theme="workspace">
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-amber-700">{t("billing.proposed.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold text-center text-slate-900">{t("billing.title")}</h1>
        <p className="mt-2 text-center text-sm text-slate-600">{t("billing.subtitle")}</p>
        <p className="mx-auto mt-5 max-w-3xl rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950">
          {t("billing.proposed.notice")}
        </p>
        {currentPlan && !["active", "unavailable"].includes(trial?.state) && <p className="mt-3 text-center text-sm text-teal-800">{t("billing.currentPlanNotice", { plan: planLabel(currentPlan) })}</p>}
        {trial?.state === "active" && (
          <p className="mx-auto mt-4 max-w-3xl rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-center text-sm text-teal-950">
            {t("trial.dashboardActive", {
              used: trial.interactions_used,
              limit: trial.interaction_limit,
              date: new Date(trial.ends_at).toLocaleDateString()
            })}
          </p>
        )}
        {["expired", "used_up", "inactive"].includes(trial?.state) && (
          <p className="mx-auto mt-4 max-w-3xl rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-center text-sm text-rose-950">
            <strong>{t("trial.dashboardPaused")}</strong> {t("trial.dashboardPausedDetail")}{" "}
            <Link to="/support" className="font-semibold underline">{t("trial.supportLink")}</Link>
          </p>
        )}
        {trial?.state === "unavailable" && (
          <p className="mx-auto mt-4 max-w-3xl rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-center text-sm text-rose-950" role="alert">
            {t("trial.statusUnavailable")}
          </p>
        )}

        <section aria-label={t("billing.proposed.packagesTitle")} className="mt-8">
          <h2 className="text-center text-2xl font-bold text-slate-900">{t("billing.proposed.packagesTitle")}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {INTERACTION_PACKAGES.map((tier) => (
              <article
                key={tier.key}
                className={`relative rounded-2xl border bg-white p-6 shadow-sm ${tier.highlight ? "border-amber-500 ring-2 ring-amber-200" : "border-slate-200"}`}
              >
                {tier.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950">{t("billing.proposed.suggested")}</span>}
                <h3 className="text-lg font-bold text-slate-900">{t(`billing.proposed.tiers.${tier.key}`)}</h3>
                <p className="mt-3 text-3xl font-bold text-teal-800">{tier.interactions.toLocaleString()}</p>
                <p className="text-sm font-semibold text-slate-600">{t("billing.proposed.interactionsPerMonth")}</p>
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">{t("billing.proposed.unlimitedEggs")}</p>
                <p className="mt-4 text-sm text-slate-600">{t("billing.proposed.priceToBeConfirmed")}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">{t("billing.proposed.countingTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("billing.proposed.countingBody")}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">{t("billing.proposed.topUpsTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("billing.proposed.topUpsBody")}</p>
          </article>
        </section>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">{t("billing.proposed.statusNote")}</p>
        {!signedIn && (
          <p className="mt-5 text-center text-sm text-slate-700">
            {t("trial.billingPrompt")} <Link to="/register" className="font-semibold text-teal-800 underline">{t("trial.billingSignup")}</Link>
          </p>
        )}
      </div>
    </Layout>
  );
}