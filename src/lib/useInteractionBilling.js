import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { createInteractionCheckout, isInteractionPaidPlan, loadInteractionBilling } from "./interactionBilling";

export default function useInteractionBilling() {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadInteractionBilling(supabase)
      .then(result => { if (active) setBilling(result); })
      .catch(cause => { if (active) { setBilling(null); setError(cause.message || String(cause)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const usage = billing?.usage;
  const owner = billing?.membership?.role === "owner";
  const paid = isInteractionPaidPlan(usage?.plan);
  const complimentary = usage?.state === "complimentary";
  const disabled = loading || !owner || !usage || Boolean(pending);
  const canTopup = !complimentary && usage?.can_topup === true
    && usage?.plan !== "trial" && ["active", "exhausted"].includes(usage?.state);
  const canManage = owner && usage && (paid || usage.state === "legacy" || usage.has_subscription === true);

  async function checkout(mode, plan) {
    if (disabled || (complimentary && mode !== "interaction-portal")) return;
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

  return { billing, usage, owner, paid, complimentary, disabled, canTopup, canManage,
    loading, error, pending, checkout, refresh: () => setRevision(value => value + 1) };
}
