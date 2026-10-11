import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import godwitLockup from "../assets/godwit-logo-lockup.svg";
import { FLOCK } from "../lib/flock";
import FlockAvatar from "../components/FlockAvatar";
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

const flockKeys = [
  { key: "robin", nameKey: "flock.robinName", roleKey: "flock.robinRole", detailKey: "flock.robinDetail" },
  { key: "tern", nameKey: "flock.ternName", roleKey: "flock.ternRole", detailKey: "flock.ternDetail" },
  { key: "flamingo", nameKey: "flock.flamingoName", roleKey: "flock.flamingoRole", detailKey: "flock.flamingoDetail" },
  {
    key: "waxwing",
    nameKey: "flock.waxwingName",
    roleKey: "flock.waxwingRole",
    detailKey: "flock.waxwingDetail",
    donationsDetailKey: "flock.waxwingDetailWithDonations"
  },
  { key: "redshank", nameKey: "flock.redshankName", roleKey: "flock.redshankRole", detailKey: "flock.redshankDetail" },
  { key: "owl", nameKey: "flock.owlName", roleKey: "flock.owlRole", detailKey: "flock.owlDetail" },
  {
    key: "magpie",
    nameKey: "flock.magpieName",
    roleKey: "flock.magpieRole",
    detailKey: "flock.magpieDetail",
    donationsDetailKey: "flock.magpieDetailWithDonations"
  }
];

export default function Landing() {
  const { t } = useTranslation("translation", { keyPrefix: "landing" });
  const [isSignedIn, setIsSignedIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setIsSignedIn(Boolean(data.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setIsSignedIn(Boolean(session?.user)));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Send a flock card to its matching Admin dashboard tab (or standalone page, for Waxwing's
  // analytics). Works whether or not the visitor is signed in yet - /admin itself handles
  // redirecting a signed-out visitor to login first.
  function goToFlockItem(birdKey) {
    const member = FLOCK.find((item) => item.key === birdKey);
    if (!member) return;
    if (member.tab) navigate(`/admin?tab=${member.tab}`);
    else if (member.route) navigate(member.route);
  }

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
              <Link to="/register" className="landing-primary-action">{t("createWorkspace")}</Link>
              <Link to="/login" className="landing-secondary-action">{t("workspaceLogin")}</Link>
            </div>
          )}
          <p className="landing-note">{t("note")}</p>
        </div>
        <div className="landing-hero-visual" aria-hidden="true">
          <img src={godwitLockup} alt="" />
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

      <section className="landing-flock" aria-labelledby="flock-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">{t("flockEyebrow")}</p>
          <h2 id="flock-title">{t("flockTitle")}</h2>
          <p className="landing-flock-lede">{t("flockLede")}</p>
        </div>
        <div className="landing-flock-grid">
          {flockKeys.map((bird) => (
            <button
              type="button"
              key={bird.key}
              className="landing-flock-card"
              onClick={() => goToFlockItem(bird.key)}
              aria-label={t("flockCardAriaLabel", { name: t(bird.nameKey) })}
            >
              <FlockAvatar bird={FLOCK.find((member) => member.key === bird.key)} size={44} className="landing-flock-badge" />
              <h3>{t(bird.nameKey)}</h3>
              <p className="landing-flock-role">{t(bird.roleKey)}</p>
              <p>{t(DONATION_FEATURE_ENABLED && bird.donationsDetailKey ? bird.donationsDetailKey : bird.detailKey)}</p>
            </button>
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