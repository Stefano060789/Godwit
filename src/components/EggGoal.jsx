import { useState } from "react";
import { Link } from "react-router-dom";
import { PERSONAS } from "../lib/personas";
import { START_GOALS } from "../lib/startGuide";
import { minPlanLabelFor } from "../lib/entitlements";

export default function EggGoal({ initialSelection, canManage, entitlements, onCreate, onOpenPolls, onOpenReviewSettings, t }) {
  const [business, setBusiness] = useState(initialSelection.business?.audienceKey || "");
  const [goalKeys, setGoalKeys] = useState(() => initialSelection.goal ? [initialSelection.goal.key] : []);
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedGoals = START_GOALS.filter((entry) => goalKeys.includes(entry.key));
  const lockedGoals = selectedGoals.filter((entry) => entry.feature && !entitlements[entry.feature]);

  function toggleGoal(key) {
    setGoalKeys((current) => current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key]);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !canManage || !business || !selectedGoals.length || lockedGoals.length) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), placementLabel: placement.trim(), businessType: business, goalKeys });
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
      <p className="goal-multi-hint">{t("admin.goal.creationDetails", { defaultValue: "Godwit will create one poll and one text-response action for this Egg, based on your goals." })}</p>
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
        <p className="goal-multi-hint">{t("admin.goal.multipleGoalsHint", { defaultValue: "Choose all that matter. One Egg can support several goals." })}</p>
        <div className="goal-options-grid">
          {START_GOALS.map((entry) => <button type="button" key={entry.key} className="goal-choice" aria-pressed={goalKeys.includes(entry.key)} onClick={() => toggleGoal(entry.key)}>
            <span className="goal-choice-title">{t(`quickStart.goals.${entry.key}.title`)}</span>
            <span className="goal-choice-detail">{t(`quickStart.goals.${entry.key}.example`)}</span>
            <span className="goal-choice-check" aria-hidden="true">{goalKeys.includes(entry.key) ? "\u2713" : "+"}</span>
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
      <section className="goal-benefits" aria-labelledby="goal-benefits-title">
        <div>
          <p className="goal-benefits-eyebrow">{t("admin.goal.benefitsEyebrow", { defaultValue: "A thank-you for customers" })}</p>
          <h3 id="goal-benefits-title">{t("admin.goal.benefitsTitle", { defaultValue: "Customer benefits" })}</h3>
        </div>
        <div className="goal-benefits-grid">
          <article>
            <h4>{t("admin.goal.emailBenefitTitle", { defaultValue: "Reward an email opt-in" })}</h4>
            <p>{t("admin.goal.emailBenefitBody", { defaultValue: "Offer a voucher or discount after a customer chooses to share their email and consent to follow-up. Configure it in a poll’s After voting settings, then add that poll to this Egg." })}</p>
            <button type="button" className="goal-text-link" onClick={onOpenPolls}>
              {t("admin.goal.emailBenefitAction", { defaultValue: "Open polls" })} &rarr;
            </button>
          </article>
          <article>
            <h4>{t("admin.goal.reviewLinksTitle", { defaultValue: "Public review links" })}</h4>
            <p>{t("admin.goal.reviewLinksBody", { defaultValue: "Set up Google, Tripadvisor, or other review links in Settings, then add them to an Egg in Advanced setup. Public reviews must stay optional and cannot be rewarded." })}</p>
            <button type="button" className="goal-text-link" onClick={onOpenReviewSettings}>
              {t("admin.goal.reviewLinksAction", { defaultValue: "Set up review links" })} &rarr;
            </button>
          </article>
        </div>
      </section>
      {lockedGoals.length > 0 && <p className="hub-notice">{t("admin.overview.availableOn", { plan: minPlanLabelFor(lockedGoals[0].feature) })} <Link to="/admin/billing">{t("admin.overview.upgrade")}</Link></p>}
      {!canManage && <p className="hub-notice">{t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." })}</p>}
      {error && <p role="alert" className="hub-error">{error}</p>}
      <button type="submit" className="goal-primary-action" disabled={busy || !canManage || !business || !selectedGoals.length || !name.trim() || !placement.trim() || lockedGoals.length > 0}>
        {busy ? t("admin.goal.creating", { defaultValue: "Creating..." }) : t("admin.goal.create", { defaultValue: "Create Egg" })}<span aria-hidden="true">&rarr;</span>
      </button>
      <p className="hub-caption">{t("admin.goal.next", { defaultValue: "Next: preview your Egg and set up QR or NFC access." })}</p>
    </form>
  </section>;
}
