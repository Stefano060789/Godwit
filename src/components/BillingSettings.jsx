import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useInteractionBilling from "../lib/useInteractionBilling";
import InteractionUsageNotice from "./InteractionUsageNotice";

export default function BillingSettings({ onUsageChange }) {
  const { t } = useTranslation();
  const key = "billing.interactions";
  const { billing, usage, owner, disabled, canTopup, canManage, loading, error, pending, checkout, refresh } = useInteractionBilling();
  useEffect(() => {
    if (usage) onUsageChange?.(usage);
  }, [usage, onUsageChange]);

  return <section className="billing-settings mb-6 rounded-xl border p-5" aria-labelledby="billing-settings-title">
    <h3 id="billing-settings-title" className="text-xl font-bold">{t("billing.title")}</h3>
    <p className="mt-2 text-sm">{t(`${key}.settingsIntro`)}</p>
    {loading && <p role="status" className="mt-3">{t(`${key}.loading`)}</p>}
    {error && <p role="alert" className="mt-3">{t(`${key}.error`, { message: error })}</p>}
    {billing?.membership && !owner && <p className="mt-3">{t(`${key}.ownerOnly`)}</p>}
    <div className="mt-4"><InteractionUsageNotice usage={usage} t={t} /></div>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={refresh} disabled={loading || Boolean(pending)} className="billing-settings-secondary rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{t(`${key}.refresh`)}</button>
      {canManage && <button type="button" onClick={() => checkout("interaction-portal")} disabled={disabled} className="billing-settings-secondary rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{pending === "interaction-portal" ? t(`${key}.opening`) : t(`${key}.manage`)}</button>}
      <button type="button" onClick={() => checkout("interaction-topup")} disabled={disabled || !canTopup} className="billing-purchase-action rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">{pending === "interaction-topup" ? t(`${key}.opening`) : t(`${key}.buyTopup`)}</button>
      <Link to="/billing" className="inline-flex min-h-11 items-center underline">{t(`${key}.viewPlans`)}</Link>
    </div>
    <p className="mt-3 text-sm">{t(`${key}.topupBody`)}</p>
    {!canTopup && usage?.state !== "complimentary" && <p className="mt-2 text-sm">{t(`${key}.topupEligibility`)}</p>}
  </section>;
}
