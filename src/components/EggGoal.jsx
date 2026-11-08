import { useState } from "react";
import { Link } from "react-router-dom";
import { PERSONAS } from "../lib/personas";
import { START_GOALS } from "../lib/startGuide";
import { minPlanLabelFor } from "../lib/entitlements";

export default function EggGoal({ initialSelection, canManage, entitlements, onCreate, t }) {
  const [business, setBusiness] = useState(initialSelection.business?.audienceKey || "");
  const [goalKey, setGoalKey] = useState(initialSelection.goal?.key || "");
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const goal = START_GOALS.find((entry) => entry.key === goalKey);
  const locked = goal?.feature && !entitlements[goal.feature];

  async function submit(event) {
    event.preventDefault();
    if (busy || !canManage || !business || !goal || locked) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), placementLabel: placement.trim(), businessType: business, goalKey });
    } catch (failure) {
      console.error("Unable to create goal-led Egg", failure);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="hub-page" aria-labelledby="egg-goal-title">
    <header className="hub-page-heading"><p className="goal-eyebrow">{t("admin.hub.goal", { defaultValue: "Goal" })}</p>
      <h2 id="egg-goal-title">{t("admin.goal.title", { defaultValue: "Give your Egg a purpose" })}</h2>
      <p>{t("admin.goal.intro", { defaultValue: "Choose a target and where people will find it." })}</p>
    </header>
    <form onSubmit={submit} className="egg-goal-form">
      <fieldset disabled={!canManage || busy}>
        <legend><span className="hub-step">01</span>{t("quickStart.businessTitle")}</legend>
        <div className="goal-business-grid">
          {PERSONAS.map((entry) => <button type="button" key={entry.audienceKey} className="goal-choice" aria-pressed={business === entry.audienceKey} onClick={() => setBusiness(entry.audienceKey)}>
            <span className="goal-choice-title">{t(`landing.useCases.${entry.audienceKey}Title`)}</span>
            <span className="goal-choice-check" aria-hidden="true">{business === entry.audienceKey ? "\u2713" : "+"}</span>
          </button>)}
        </div>
      </fieldset>
      <fieldset disabled={!canManage || busy}>
        <legend><span className="hub-step">02</span>{t("quickStart.goalTitle")}</legend>
        <div className="goal-options-grid">
          {START_GOALS.map((entry) => <button type="button" key={entry.key} className="goal-choice" aria-pressed={goalKey === entry.key} onClick={() => setGoalKey(entry.key)}>
            <span className="goal-choice-title">{t(`quickStart.goals.${entry.key}.title`)}</span>
            <span className="goal-choice-detail">{t(`quickStart.goals.${entry.key}.example`)}</span>
            <span className="goal-choice-check" aria-hidden="true">{goalKey === entry.key ? "\u2713" : "+"}</span>
          </button>)}
        </div>
      </fieldset>
      <fieldset disabled={!canManage || busy}>
        <legend><span className="hub-step">03</span>{t("admin.goal.placementTitle", { defaultValue: "Name & location" })}</legend>
        <div className="hub-form-grid">
          <label>{t("admin.engagement.campaigns.nameLabel")}<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("admin.goal.nameExample", { defaultValue: "Gallery welcome" })} /></label>
          <label>{t("admin.engagement.campaigns.placementLabel")}<input required maxLength={80} value={placement} onChange={(event) => setPlacement(event.target.value)} placeholder={t("admin.goal.locationExample", { defaultValue: "Main entrance" })} /></label>
        </div>
      </fieldset>
      {locked && <p className="hub-notice">{t("admin.overview.availableOn", { plan: minPlanLabelFor(goal.feature) })} <Link to="/admin/billing">{t("admin.overview.upgrade")}</Link></p>}
      {!canManage && <p className="hub-notice">{t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." })}</p>}
      {error && <p role="alert" className="hub-error">{error}</p>}
      <button type="submit" className="goal-primary-action" disabled={busy || !canManage || !business || !goal || !name.trim() || !placement.trim() || locked}>
        {busy ? t("admin.goal.creating", { defaultValue: "Creating..." }) : t("admin.goal.create", { defaultValue: "Create Egg" })}<span aria-hidden="true">&rarr;</span>
      </button>
      <p className="hub-caption">{t("admin.goal.next", { defaultValue: "Next: preview your Egg and set up QR or NFC access." })}</p>
    </form>
  </section>;
}
