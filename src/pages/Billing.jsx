import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "../components/Layout";
import InteractionUsageNotice from "../components/InteractionUsageNotice";
import { supabase } from "../lib/supabase";
import { createInteractionCheckout, INTERACTION_PLANS, isInteractionPaidPlan, loadInteractionBilling } from "../lib/interactionBilling";

export default function Billing() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const key = "billing.interactions";
  const language = i18n.resolvedLanguage || i18n.language;
  const currency = new Intl.NumberFormat(language, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadInteractionBilling(supabase)
      .then((result) => { if (active) setBilling(result); })
      .catch((cause) => { if (active) { setBilling(null); setError(cause.message || String(cause)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const usage = billing?.usage;
  const owner = billing?.membership?.role === "owner";
  const paid = isInteractionPaidPlan(usage?.plan);
  const disabled = loading || !owner || !usage || Boolean(pending);
  const canTopup = usage?.can_topup === true && usage?.plan !== "trial" && ["active", "exhausted"].includes(usage?.state);

  async function checkout(mode, plan) {
    if (disabled) return;
    setPending(plan || mode);
    setError("");
    try {
      const url = await createInteractionCheckout(supabase, { mode, plan });
      window.location.assign(url);
    } catch (cause) {
      setError(cause.message || String(cause));
    } finally {
      setPending("");
    }
  }

  return (
    <Layout theme="workspace">
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-amber-700">{t(`${key}.eyebrow`)}</p>
        <h1 className="mt-2 text-3xl font-bold text-center text-slate-900">{t("billing.title")}</h1>
        <p className="mt-2 text-center text-sm text-slate-600">{t("billing.subtitle")}</p>
        <p className="mx-auto mt-5 max-w-3xl rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm">{t(`${key}.availability`)}</p>
        {loading && <p role="status" className="mt-4 text-center">{t(`${key}.loading`)}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">{t(`${key}.error`, { message: error })}</p>}
        {searchParams.get("checkout") === "success" && <p role="status" className="mt-4">{t(`${key}.returned`)}</p>}
        {searchParams.get("checkout") === "cancelled" && <p role="status" className="mt-4">{t("billing.checkoutCancelled")}</p>}
        <div className="mt-4"><InteractionUsageNotice usage={usage} t={t} /></div>
        {billing?.signedIn && !billing.membership && <p role="alert" className="mt-4">{t(`${key}.noWorkspace`)}</p>}
        {billing?.membership && !owner && <p className="mt-4">{t(`${key}.ownerOnly`)}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || Boolean(pending)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{t(`${key}.refresh`)}</button>
          {owner && usage && (paid || usage.state === "legacy") && <button type="button" onClick={() => checkout("interaction-portal")} disabled={disabled} className="rounded-lg border border-teal-700 px-4 py-2 text-sm text-teal-800 disabled:opacity-50">{pending === "interaction-portal" ? t(`${key}.opening`) : t(`${key}.manage`)}</button>}
        </div>

        <section aria-label={t("billing.proposed.packagesTitle")} className="mt-8">
          <h2 className="text-center text-2xl font-bold text-slate-900">{t("billing.proposed.packagesTitle")}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INTERACTION_PLANS.map((tier) => (
              <article key={tier.key} className={`relative rounded-2xl border bg-white p-6 shadow-sm ${tier.highlight ? "border-amber-500 ring-2 ring-amber-200" : "border-slate-200"}`}>
                {tier.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950">{t("billing.proposed.suggested")}</span>}
                <h3 className="text-lg font-bold text-slate-900">{t(`billing.proposed.tiers.${tier.key}`)}</h3>
                <p className="mt-3 text-3xl font-bold text-teal-800">{tier.interactions.toLocaleString(language)}</p>
                <p className="text-sm font-semibold text-slate-600">{t("billing.proposed.interactionsPerMonth")}</p>
                <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800">{t("billing.proposed.unlimitedEggs")}</p>
                <p className="mt-4 text-xl font-bold text-slate-900">{currency.format(tier.price)} <span className="text-sm font-normal">{t("billing.perMonth")}</span></p>
                <p className="mt-1 text-xs text-slate-500">{t(`${key}.vat`)}</p>
                <p className="mt-4 text-sm leading-6 text-slate-600">{t(`billing.proposed.useCases.${tier.key}`)}</p>
                {billing?.signedIn || loading || error ? (
                  <button type="button" onClick={() => checkout(paid ? "interaction-portal" : "interaction-subscription", paid ? undefined : tier.key)} disabled={disabled || usage?.plan === tier.key} className="mt-4 w-full rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {pending === tier.key ? t(`${key}.opening`) : usage?.plan === tier.key ? t("billing.currentPlanButton") : paid ? t(`${key}.changePlan`) : t(`${key}.subscribe`)}
                  </button>
                ) : <Link to="/register" className="mt-4 block font-semibold text-teal-800 underline">{t(`${key}.signIn`)}</Link>}
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">{t(`${key}.planChanges`)}</p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">{t(`${key}.countingTitle`)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(`${key}.countingBody`)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(`${key}.trialInfo`)}</p>
          </article>
          <article id="topup" className={`rounded-xl border bg-white p-5 ${searchParams.get("topup") === "1" ? "border-amber-500 ring-2 ring-amber-200" : "border-slate-200"}`}>
            <h2 className="font-bold text-slate-900">{t(`${key}.topupTitle`)}</h2>
            <p className="mt-2 font-bold">{currency.format(7)} · {t(`${key}.topupQuantity`)}</p>
            <p className="mt-1 text-xs text-slate-500">{t(`${key}.vat`)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t(`${key}.topupBody`)}</p>
            <p className="mt-2 text-sm text-slate-600">{t(`${key}.topupEligibility`)}</p>
            <button type="button" onClick={() => checkout("interaction-topup")} disabled={disabled || !canTopup} className="mt-4 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending === "interaction-topup" ? t(`${key}.opening`) : t(`${key}.buyTopup`)}</button>
          </article>
        </section>
        <p className="mt-6 text-center text-xs leading-5 text-slate-500">{t(`${key}.refunds`)} <Link to="/support" className="underline">{t("trial.supportLink")}</Link></p>
        {!billing?.signedIn && <p className="mt-5 text-center text-sm text-slate-700">{t("trial.billingPrompt")} <Link to="/register" state={{ returnTo: "/billing" }} className="font-semibold text-teal-800 underline">{t("trial.billingSignup")}</Link>{" · "}<Link to="/login" state={{ returnTo: "/billing" }} className="font-semibold text-teal-800 underline">{t(`${key}.login`)}</Link></p>}
      </div>
    </Layout>
  );
}
