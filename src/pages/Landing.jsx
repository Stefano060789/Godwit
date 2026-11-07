import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import godwitLockup from "../assets/godwit-logo-lockup.svg";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";

const stepKeys = [
  {
    number: "01",
    titleKey: "steps.step1Title",
    detailKey: "steps.step1Detail",
    donationsDetailKey: "steps.step1DetailWithDonations"
  },
  { number: "02", titleKey: "steps.step2Title", detailKey: "steps.step2Detail" },
  { number: "03", titleKey: "steps.step3Title", detailKey: "steps.step3Detail" }
];

const outcomeKeys = [
  { titleKey: "outcomes.conversionTitle", detailKey: "outcomes.conversionDetail" },
  { titleKey: "outcomes.growthTitle", detailKey: "outcomes.growthDetail" },
  { titleKey: "outcomes.publicTitle", detailKey: "outcomes.publicDetail" },
  ...(DONATION_FEATURE_ENABLED
    ? [{ titleKey: "outcomes.donationsTitle", detailKey: "outcomes.donationsDetail" }]
    : [])
];

const eggFeatureKeys = [
  { key: "access", titleKey: "eggFeatures.accessTitle", detailKey: "eggFeatures.accessDetail" },
  { key: "assistant", titleKey: "eggFeatures.assistantTitle", detailKey: "eggFeatures.assistantDetail" },
  { key: "guidance", titleKey: "eggFeatures.guidanceTitle", detailKey: "eggFeatures.guidanceDetail" }
];

const audienceKeys = [
  { key: "arts", titleKey: "useCases.artsTitle", detailKey: "useCases.artsDetail" },
  { key: "hospitality", titleKey: "useCases.hospitalityTitle", detailKey: "useCases.hospitalityDetail" },
  { key: "places", titleKey: "useCases.placesTitle", detailKey: "useCases.placesDetail" },
  { key: "events", titleKey: "useCases.eventsTitle", detailKey: "useCases.eventsDetail" },
  { key: "shops", titleKey: "useCases.shopsTitle", detailKey: "useCases.shopsDetail" }
];

export default function Landing() {
  const { t } = useTranslation("translation", { keyPrefix: "landing" });
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsSignedIn(Boolean(data.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setIsSignedIn(Boolean(session?.user)));
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-content">
          <p className="landing-eyebrow">{t("eyebrow")}</p>
          <h1 className="landing-hero-title">{t("title")}</h1>
          <p className="landing-lede">{t("lede")}</p>
          {isSignedIn ? (
            <div className="landing-actions">
              <Link to="/admin" className="landing-admin-action">{t("workspaceDashboard")}</Link>
            </div>
          ) : (
            <div className="landing-actions">
              <Link to="/essentials" className="landing-primary-action">{t("createWorkspace")}</Link>
              <Link to="/login" className="landing-secondary-action">{t("workspaceLogin")}</Link>
            </div>
          )}
          <p className="landing-note">{t("note")}</p>
        </div>
        <div className="landing-hero-visual" aria-hidden="true">
          <img src={godwitLockup} alt="" />
        </div>
      </section>

      <section className="landing-egg" aria-labelledby="egg-feature-title">
        <div className="landing-egg-copy">
          <p className="landing-eyebrow">{t("eggFeatures.eyebrow")}</p>
          <h2 id="egg-feature-title">{t("eggFeatures.title")}</h2>
          <p className="landing-egg-lede">{t("eggFeatures.lede")}</p>
          <div className="landing-egg-access" aria-label={t("eggFeatures.accessibilityLabel")}>
            <span>QR</span>
            <span aria-hidden="true">+</span>
            <span>NFC</span>
            <span className="landing-egg-access-caption">{t("eggFeatures.sameExperience")}</span>
          </div>
          <Link to={isSignedIn ? "/admin?tab=engagement" : "/register"} className="landing-egg-action">
            {t("eggFeatures.cta")}
          </Link>
        </div>
        <div className="landing-egg-features">
          {eggFeatureKeys.map((feature, index) => (
            <article key={feature.key} className="landing-egg-feature">
              <span className="landing-egg-feature-number">0{index + 1}</span>
              <div>
                <h3>{t(feature.titleKey)}</h3>
                <p>{t(feature.detailKey)}</p>
              </div>
            </article>
          ))}
          <p className="landing-egg-control">{t("eggFeatures.control")}</p>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="how-it-works-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">{t("howItWorksEyebrow")}</p>
          <h2 id="how-it-works-title">{t("howItWorksTitle")}</h2>
        </div>
        <div className="landing-steps">
          {stepKeys.map((step) => (
            <article key={step.number} className="landing-step">
              <span>{step.number}</span>
              <h3>{t(step.titleKey)}</h3>
              <p>{t(DONATION_FEATURE_ENABLED && step.donationsDetailKey ? step.donationsDetailKey : step.detailKey)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-outcomes" aria-labelledby="outcomes-title">
        <div>
          <p className="landing-eyebrow">{t("outcomesEyebrow")}</p>
          <h2 id="outcomes-title">{t("outcomesTitle")}</h2>
        </div>
        <ul>
          {outcomeKeys.map((outcome) => (
            <li key={outcome.titleKey}><strong>{t(outcome.titleKey)}</strong><span>{t(outcome.detailKey)}</span></li>
          ))}
        </ul>
      </section>

      <section className="landing-audiences" aria-labelledby="use-cases-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">{t("useCasesEyebrow")}</p>
          <h2 id="use-cases-title">{t("useCasesTitle")}</h2>
          <p className="landing-audience-lede">{t("useCasesLede")}</p>
        </div>
        <div className="landing-audience-grid">
          {audienceKeys.map((audience, index) => (
            <article key={audience.key} className="landing-audience-card">
              <span className="landing-audience-number">0{index + 1}</span>
              <h3>{t(audience.titleKey)}</h3>
              <p>{t(audience.detailKey)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <p className="landing-eyebrow">{t("finalEyebrow")}</p>
        <h2>{t("finalTitle")}</h2>
        <p className="landing-final-copy">{t("finalCopy")}</p>
        <div className="landing-admin-actions">
          {isSignedIn ? (
            <Link to="/admin" className="landing-admin-action">{t("openDashboard")}</Link>
          ) : (
            <Link to="/register" className="landing-primary-action">{t("createWorkspace")}</Link>
          )}
        </div>
      </section>
    </main>
  );
}