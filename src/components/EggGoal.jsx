import { useState } from "react";
import { Link } from "react-router-dom";
import { START_GOALS, START_GOAL_GROUPS } from "../lib/startGuide";
import { minPlanLabelFor } from "../lib/entitlements";
import { normalizeEggEmailBenefit } from "../lib/eggBenefits";

export default function EggGoal({ businessType, initialSelection, canManage, entitlements, onCreate, onOpenReviewSettings, t }) {
  const [goalKeys, setGoalKeys] = useState(() => initialSelection.goal ? [initialSelection.goal.key] : []);
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState("");
  const [goalContext, setGoalContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [benefitType, setBenefitType] = useState("none");
  const [benefitValue, setBenefitValue] = useState("");
  const [benefitUrl, setBenefitUrl] = useState("");
  const promotionSelected = goalKeys.includes("promotion");
  const selectedGoals = START_GOALS.filter((entry) => goalKeys.includes(entry.key));
  const lockedGoals = selectedGoals.filter((entry) => entry.feature && !entitlements[entry.feature]);

  function toggleGoal(key) {
    setGoalKeys((current) => current.includes(key)
      ? current.filter((entry) => entry !== key)
      : [...current, key]);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || !canManage || !businessType || !selectedGoals.length || lockedGoals.length) return;
    setBusy(true);
    setError("");
    try {
      if (promotionSelected && !goalContext.trim()) {
        throw new Error(t("admin.goal.promotionDetailsRequired", { defaultValue: "Describe the event, product, or offer you want to promote." }));
      }
      const emailBenefit = { type: benefitType, value: benefitValue, url: benefitUrl };
      try {
        normalizeEggEmailBenefit(emailBenefit);
      } catch {
        throw new Error(t("admin.goal.benefitInvalid", { defaultValue: "Enter a voucher or discount code, or a valid HTTPS redemption link." }));
      }
      await onCreate({ name: name.trim(), placementLabel: placement.trim(), businessType, goalKeys, goalContext: goalContext.trim(), emailBenefit });
    } catch (failure) {
      console.error("Unable to create goal-led Egg", failure);
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="hub-page" aria-labelledby="egg-goal-title">
    <header className="hub-page-heading"><p className="goal-eyebrow">{t("admin.hub.goal", { defaultValue: "Goal" })}</p>
      <h2 id="egg-goal-title">{t("admin.goal.title", { defaultValue: "Create an Egg with a clear goal" })}</h2>
      <p>{t("admin.goal.intro", { defaultValue: "Choose goals, name and location for your new Egg, and optionally add a customer thank-you. Manage its content and access in Eggs after creation." })}</p>
    </header>
    <form onSubmit={submit} className="egg-goal-form">
      {!businessType && <p className="hub-notice">
        {t("admin.goal.businessRequired", { defaultValue: "Set your business type before creating an Egg." })}{" "}
        <Link to="/admin?tab=your-business">{t("admin.hub.yourBusiness", { defaultValue: "Your Business" })}</Link>
      </p>}
      <fieldset disabled={!canManage || busy || !businessType}>
        <legend>{t("quickStart.goalTitle")}</legend>
        <p className="goal-multi-hint">{t(`admin.goal.businessGuidance.${businessType}`, { defaultValue: t("admin.goal.businessGuidance.default") })}</p>
        <p className="goal-multi-hint">{t("admin.goal.multipleGoalsHint", { defaultValue: "Choose one or more outcomes that matter for this Egg." })}</p>
        {START_GOAL_GROUPS.map((group) => <section className="goal-choice-group" key={group} aria-labelledby={`goal-group-${group}`}>
          <h3 id={`goal-group-${group}`}>{t(`quickStart.goalGroups.${group}`)}</h3>
          <div className="goal-options-grid">
            {START_GOALS.filter((entry) => entry.group === group).map((entry) => <button type="button" key={entry.key} className="goal-choice" aria-pressed={goalKeys.includes(entry.key)} onClick={() => toggleGoal(entry.key)}>
              <span className="goal-choice-title">{t(`quickStart.goals.${entry.key}.title`)}</span>
              <span className="goal-choice-detail">{t(`quickStart.goals.${entry.key}.example`)}</span>
              <span className="goal-choice-check" aria-hidden="true">{goalKeys.includes(entry.key) ? "\u2713" : "+"}</span>
            </button>)}
          </div>
        </section>)}
        <label className="goal-context-field">{promotionSelected
          ? t("admin.goal.promotionDetailsLabel", { defaultValue: "What event, product, or offer do you want to promote?" })
          : t("admin.goal.contextLabel", { defaultValue: "What would success look like for this Egg? (optional)" })}
          <textarea
            required={promotionSelected}
            maxLength={500}
            rows={3}
            value={goalContext}
            onChange={(event) => setGoalContext(event.target.value)}
            placeholder={promotionSelected
              ? t("admin.goal.promotionDetailsPlaceholder", { defaultValue: "Describe the event, product, or special offer. Include key details visitors should know." })
              : t("admin.goal.contextPlaceholder", { defaultValue: "Add a specific outcome or detail to guide the AI and help you interpret progress." })}
          />
        </label>
      </fieldset>
      <fieldset disabled={!canManage || busy || !businessType}>
        <legend>{t("admin.goal.placementTitle", { defaultValue: "Name & location" })}</legend>
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
            <h4>{t("admin.goal.emailBenefitTitle", { defaultValue: "Optional email thank-you" })}</h4>
            <p>{t("admin.goal.emailBenefitBody", { defaultValue: "Choose a benefit here. Godwit adds it to the customer journey, shown only after email sharing and follow-up consent." })}</p>
            {entitlements.emailBenefits ? <fieldset disabled={!canManage || busy} className="goal-benefit-fields">
              <label>{t("admin.goal.benefitType", { defaultValue: "Customer benefit" })}
                <select value={benefitType} onChange={(event) => setBenefitType(event.target.value)}>
                  <option value="none">{t("admin.goal.benefitNone", { defaultValue: "No benefit" })}</option>
                  <option value="voucher">{t("thankYou.voucher")}</option>
                  <option value="discount_code">{t("thankYou.discountCode")}</option>
                </select>
              </label>
              {benefitType !== "none" && <>
                <label>{t("admin.pollForm.voucherOrCode")}
                  <input maxLength={200} value={benefitValue} onChange={(event) => setBenefitValue(event.target.value)} />
                </label>
                <label>{t("admin.pollForm.redemptionLink")}
                  <input type="url" maxLength={500} placeholder="https://" value={benefitUrl} onChange={(event) => setBenefitUrl(event.target.value)} />
                </label>
              </>}
            </fieldset> : <p className="hub-caption">{t("admin.overview.availableOn", { plan: minPlanLabelFor("emailBenefits") })} <Link to="/admin/billing">{t("admin.overview.upgrade")}</Link></p>}
          </article>
          <article>
            <h4>{t("admin.goal.reviewLinksTitle", { defaultValue: "Public review links" })}</h4>
            <p>{t("admin.goal.reviewLinksBody", { defaultValue: "Set up your review links once in Settings. Godwit includes them when you create an Egg with a review goal. Public reviews must stay optional and cannot be rewarded." })}</p>
            <button type="button" className="goal-text-link" onClick={onOpenReviewSettings}>
              {t("admin.goal.reviewLinksAction", { defaultValue: "Set up review links" })} &rarr;
            </button>
          </article>
        </div>
      </section>
      {lockedGoals.length > 0 && <p className="hub-notice">{t("admin.overview.availableOn", { plan: minPlanLabelFor(lockedGoals[0].feature) })} <Link to="/admin/billing">{t("admin.overview.upgrade")}</Link></p>}
      {!canManage && <p className="hub-notice">{t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." })}</p>}
      {error && <p role="alert" className="hub-error">{error}</p>}
      <button type="submit" className="goal-primary-action" disabled={busy || !canManage || !businessType || !selectedGoals.length || !name.trim() || !placement.trim() || lockedGoals.length > 0}>
        {busy ? t("admin.goal.creating", { defaultValue: "Creating..." }) : t("admin.goal.create", { defaultValue: "Create Egg" })}<span aria-hidden="true">&rarr;</span>
      </button>
      <p className="hub-caption">{t("admin.goal.next", { defaultValue: "Next: preview your Egg and set up QR or NFC access." })}</p>
    </form>
  </section>;
}
