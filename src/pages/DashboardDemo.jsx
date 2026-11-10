import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import "./DashboardDemo.css";

const TABS = ["overview", "eggs", "results", "goalProgress"];
const WEEKLY_INTERACTIONS = [28, 36, 32, 48, 43, 61, 72];

export default function DashboardDemo() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <Layout className="max-w-none">
      <div className="dashboard-demo">
        <header className="dashboard-demo-header">
          <div>
            <p className="dashboard-demo-eyebrow">{t("dashboardDemo.eyebrow")}</p>
            <h1>{t("dashboardDemo.title")}</h1>
            <p>{t("dashboardDemo.intro")}</p>
          </div>
          <span className="dashboard-demo-sample">{t("dashboardDemo.sampleBadge")}</span>
        </header>

        <nav className="dashboard-demo-tabs" aria-label={t("dashboardDemo.tabsLabel")}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? "page" : undefined}
              onClick={() => setActiveTab(tab)}
            >
              {t(`dashboardDemo.tabs.${tab}`)}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <>
            <section className="dashboard-demo-metrics" aria-label={t("dashboardDemo.metricsLabel")}>
              {[
                ["interactions", "1,284"],
                ["feedback", "416"],
                ["responseRate", "32%"]
              ].map(([key, value]) => (
                <article className="dashboard-demo-card" key={key}>
                  <p>{t(`dashboardDemo.metrics.${key}`)}</p>
                  <strong>{value}</strong>
                  <span>{t("dashboardDemo.samplePeriod")}</span>
                </article>
              ))}
            </section>
            <section className="dashboard-demo-panel">
              <div className="dashboard-demo-panel-heading">
                <div>
                  <h2>{t("dashboardDemo.chartTitle")}</h2>
                  <p>{t("dashboardDemo.chartDescription")}</p>
                </div>
                <strong>320</strong>
              </div>
              <div className="dashboard-demo-chart" role="img" aria-label={t("dashboardDemo.chartDescription")}>
                {WEEKLY_INTERACTIONS.map((value, index) => (
                  <div className="dashboard-demo-bar-column" key={index}>
                    <span>{value}</span>
                    <div className="dashboard-demo-bar" style={{ height: `${value * 1.5}px` }} />
                    <small>{t(`dashboardDemo.days.${index}`)}</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="dashboard-demo-bottom">
              <article className="dashboard-demo-panel">
                <h2>{t("dashboardDemo.goalTitle")}</h2>
                <p>{t("dashboardDemo.goalDescription")}</p>
                <div className="dashboard-demo-progress" aria-label="68%">
                  <span />
                </div>
                <strong>{t("dashboardDemo.goalProgress")}</strong>
              </article>
              <article className="dashboard-demo-panel">
                <h2>{t("dashboardDemo.eggTitle")}</h2>
                <p>{t("dashboardDemo.eggDescription")}</p>
                <div className="dashboard-demo-egg">
                  <img src="/godwit-logo.png" alt="" width="44" height="50" />
                  <span>Visitor welcome</span>
                  <strong>QR + NFC</strong>
                </div>
              </article>
            </section>
          </>
        )}

        {activeTab !== "overview" && (
          <section className="dashboard-demo-panel dashboard-demo-placeholder">
            <p className="dashboard-demo-eyebrow">{t(`dashboardDemo.tabs.${activeTab}`)}</p>
            <h2>{t("dashboardDemo.sectionTitle")}</h2>
            <p>{t("dashboardDemo.sectionDescription")}</p>
            <ul>
              <li>{t("dashboardDemo.sampleEgg")}</li>
              <li>{t("dashboardDemo.sampleResponses")}</li>
              <li>{t("dashboardDemo.sampleTrend")}</li>
            </ul>
          </section>
        )}

        <footer className="dashboard-demo-footer">
          <p>{t("dashboardDemo.disclaimer")}</p>
          <Link to="/register">{t("dashboardDemo.cta")}</Link>
        </footer>
      </div>
    </Layout>
  );
}
