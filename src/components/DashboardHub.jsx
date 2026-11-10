export function HubIcon({ type }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {type === "qr" ? <>
        <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h3v3h3v3h-6z" />
        <path d="M12 3v9H3M12 15v6M18 12h3" />
      </> : type === "nfc" ? <>
        <path d="M8 8a6 6 0 0 1 0 8M12 5a10 10 0 0 1 0 14M16 2a14 14 0 0 1 0 20" />
        <circle cx="4" cy="12" r="1" />
      </> : type === "yourBusiness" ? <>
        <path d="M3 10h18v11H3zM2 10l2-7h16l2 7M7 14h4v7M15 14h3M7 7h.01M12 7h.01M17 7h.01" />
      </> : type === "business" ? <>
        <path d="M4 21V5h10v16M14 10h6v11M2 21h20M7 8h4M7 12h4M7 16h4M17 13v2M17 17v2" />
      </> : type === "goal" ? <>
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />
      </> : type === "results" ? <>
        <path d="M4 3v18h17M8 17v-6M13 17V7M18 17v-3" />
      </> : <>
        <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="var(--hub-surface)" /><circle cx="16" cy="12" r="2" fill="var(--hub-surface)" /><circle cx="10" cy="18" r="2" fill="var(--hub-surface)" />
      </>}
    </svg>
  );
}

export default function DashboardHub({ activeTab, onSelect, t }) {
  const labels = {
    "your-business": t("admin.hub.yourBusiness", { defaultValue: "Your Business" }),
    business: t("admin.hub.business", { defaultValue: "Business Data" }),
    goal: t("admin.hub.goal", { defaultValue: "Goal" }),
    engagement: t("admin.hub.eggs", { defaultValue: "Eggs" }),
    results: t("admin.hub.results", { defaultValue: "Results" }),
    "goal-progress": t("admin.hub.goalProgress", { defaultValue: "Goal Progress" }),
    settings: t("admin.hub.settings", { defaultValue: "Settings" })
  };
  function node(tab, icon) {
    return <button type="button" className={`dashboard-hub-node dashboard-hub-${tab}`}
      aria-current={activeTab === tab ? "page" : undefined} onClick={() => onSelect(tab)}>
      <HubIcon type={icon} /><span>{labels[tab]}</span>
    </button>;
  }
  return (
    <nav className="dashboard-hub" aria-label={t("admin.hub.label", { defaultValue: "Your business, connected by Eggs" })}>
      <svg className="dashboard-hub-lines" viewBox="0 0 1000 310" preserveAspectRatio="none" aria-hidden="true">
        <path d="M220 35C350 35 350 110 500 110M220 110H500M220 185C350 185 350 110 500 110M500 110H780M780 110V215M500 110V215" />
      </svg>
      <div className="dashboard-hub-inputs">{node("your-business", "yourBusiness")}{node("business", "business")}{node("goal", "goal")}</div>
      <button type="button" className="dashboard-hub-egg" aria-current={activeTab === "engagement" ? "page" : undefined} onClick={() => onSelect("engagement")}>
        <img src="/godwit-logo.png" alt="" width="88" height="99" />
        <strong>{labels.engagement}</strong>
        <span className="dashboard-hub-access"><span><HubIcon type="qr" />QR</span><span><HubIcon type="nfc" />NFC</span></span>
      </button>
      {node("results", "results")}
      {node("goal-progress", "results")}
      {node("settings", "settings")}
    </nav>
  );
}
