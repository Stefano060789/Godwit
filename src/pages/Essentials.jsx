import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "../components/Layout";
import { PERSONAS } from "../lib/personas";
import { START_GOALS, START_GOAL_GROUPS, buildStartLink, getStartSelection } from "../lib/startGuide";

export default function Essentials() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { goal, business } = getStartSelection(searchParams);

  function select(key, value) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(key, value);
      return next;
    }, { replace: true });
  }

  return (
    <Layout theme="workspace" className="goal-shell">
      <div className="goal-start">
        <header className="goal-start-header">
          <p className="goal-eyebrow">{t("quickStart.eyebrow")}</p>
          <h1>{t("quickStart.title")}</h1>
          <p>{t("quickStart.intro")}</p>
          <div className="goal-start-loop" aria-label={t("quickStart.loopLabel")}>
            <span>{t("quickStart.loopGoal")}</span>
            <span aria-hidden="true">&rarr;</span>
            <span>{t("quickStart.loopEgg")}</span>
            <span aria-hidden="true">&rarr;</span>
            <span>{t("quickStart.loopResults")}</span>
          </div>
        </header>

        <section aria-labelledby="business-type-title">
          <div className="goal-section-heading">
            <span className="goal-step-number" aria-hidden="true">01</span>
            <h2 id="business-type-title">{t("quickStart.businessTitle")}</h2>
            <span className="goal-optional">{t("quickStart.optional")}</span>
          </div>
          <div className="goal-business-grid">
            {PERSONAS.map((type) => (
              <button
                key={type.key}
                type="button"
                aria-pressed={business?.key === type.key}
                onClick={() => select("business", type.audienceKey)}
                className="goal-choice"
              >
                <span className="goal-choice-title">{t(`landing.useCases.${type.audienceKey}Title`)}</span>
                <span className="goal-choice-detail">{t(`quickStart.businesses.${type.audienceKey}`)}</span>
                <span className="goal-choice-check" aria-hidden="true">{business?.key === type.key ? "\u2713" : "+"}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="goal-title">
          <div className="goal-section-heading">
            <span className="goal-step-number" aria-hidden="true">02</span>
            <h2 id="goal-title">{t("quickStart.goalTitle")}</h2>
          </div>
          {START_GOAL_GROUPS.map((group) => <section className="goal-choice-group" key={group} aria-labelledby={`quick-start-goal-group-${group}`}>
            <h3 id={`quick-start-goal-group-${group}`}>{t(`quickStart.goalGroups.${group}`)}</h3>
            <div className="goal-options-grid">
              {START_GOALS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={goal?.key === item.key}
                  onClick={() => select("goal", item.key)}
                  className="goal-choice"
                >
                  <span className="goal-choice-title">{t(`quickStart.goals.${item.key}.title`)}</span>
                  <span className="goal-choice-detail">{t(`quickStart.goals.${item.key}.example`)}</span>
                  <span className="goal-choice-check" aria-hidden="true">{goal?.key === item.key ? "\u2713" : "+"}</span>
                </button>
              ))}
            </div>
          </section>)}
        </section>

        {goal ? (
          <section className="goal-plan" aria-labelledby="start-plan-title" aria-live="polite">
            <p className="goal-eyebrow">{t("quickStart.planEyebrow")}</p>
            <h2 id="start-plan-title">{t(`quickStart.goals.${goal.key}.title`)}</h2>
            {business && <p className="goal-plan-business">{t(`landing.useCases.${business.audienceKey}Title`)}</p>}
            <ol className="goal-plan-steps">
              <li>{t(`quickStart.goals.${goal.key}.setup`)}</li>
              <li>{t("quickStart.shareStep")}</li>
              <li>{t(`quickStart.goals.${goal.key}.result`)}</li>
            </ol>
            {(goal.key === "feedback" || goal.key === "contacts") && (
              <p className="goal-plan-note">{t("quickStart.benefitNote")}</p>
            )}
            {goal.feature && <p className="goal-plan-note">{t("quickStart.planAvailability")}</p>}
            <Link to={buildStartLink(goal.key, business?.audienceKey)} className="goal-primary-action">
              {t("quickStart.continue")}
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <p className="goal-plan-caption">{t("quickStart.continueHint")}</p>
          </section>
        ) : (
          <p className="goal-start-hint">{t("quickStart.chooseHint")}</p>
        )}
      </div>
    </Layout>
  );
}
