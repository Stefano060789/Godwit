import { useEffect, useRef, useState } from "react";
import { researchBusinessInformation } from "../lib/businessData";
import { safeBusinessUrl } from "../lib/businessLinks";

export default function BusinessResearch({ workspaceId, t }) {
  const [location, setLocation] = useState("");
  const [topic, setTopic] = useState("practical");
  const [artwork, setArtwork] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function research(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const next = await researchBusinessInformation(workspaceId, { location, topic, artwork, consent });
      if (mounted.current) setResult(next);
    } catch (failure) {
      if (mounted.current) setError(failure.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return <section className="business-data-form">
    <h3>{t("admin.businessData.researchTitle", { defaultValue: "Research this business with Google" })}</h3>
    <p>{t("admin.businessData.researchHint", { defaultValue: "Manager-only, on-demand research with weekly request limits. Results are shown only here: they are not saved, imported, or reused in customer answers. Use your own business records for the shared information above." })}</p>
    <form onSubmit={research}>
      <label>{t("admin.businessData.researchLocation", { defaultValue: "Public town or business location" })}
        <input required maxLength={120} value={location} disabled={busy} onChange={(event) => setLocation(event.target.value)} />
      </label>
      <label>{t("admin.businessData.researchTopic", { defaultValue: "What to research" })}
        <select value={topic} disabled={busy} onChange={(event) => { setTopic(event.target.value); setArtwork(""); }}>
          <option value="practical">{t("admin.businessData.researchPractical", { defaultValue: "Location and opening hours" })}</option>
          <option value="menu">{t("admin.businessData.researchMenu", { defaultValue: "Menu information" })}</option>
          <option value="artwork">{t("admin.businessData.researchArtwork", { defaultValue: "Artwork and artist context" })}</option>
        </select>
      </label>
      {topic === "artwork" && <label>{t("admin.businessData.artworkIdentity", { defaultValue: "Public artwork title and artist" })}
        <input required maxLength={120} value={artwork} disabled={busy} onChange={(event) => setArtwork(event.target.value)} />
      </label>}
      <label className="business-research-consent">
        <input type="checkbox" required checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
        {t("admin.businessData.researchConsent", { defaultValue: "I am 18 or older and authorize sending this public business identity, location and selected topic to Google. I will not include visitor data or private details. Google may retain grounding data for 30 days. Requests may incur search and model charges; one request can run multiple searches." })}
      </label>
      <button className="goal-button" disabled={busy || !consent} type="submit">
        {busy ? t("admin.businessData.researching", { defaultValue: "Researching..." }) : t("admin.businessData.researchButton", { defaultValue: "Research with Google" })}
      </button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <section className="business-research-result" aria-label={t("admin.businessData.researchResult", { defaultValue: "Google research result" })}>
      <p>{t("admin.businessData.researchNotVerified", { defaultValue: "Research is not a guarantee of accuracy. Check the business identity, sources and current opening hours." })}</p>
      <p>{t("admin.businessData.researchedAt", { defaultValue: "Researched at" })}: {result.researchedAt}</p>
      <div className="business-research-text">{result.text}</div>
      <ul>{result.citations.map((citation, index) => <li key={index}>
        {safeBusinessUrl(citation.url)
          ? <a href={safeBusinessUrl(citation.url)} target="_blank" rel="noopener noreferrer">{citation.title || citation.url}</a>
          : <span>{citation.title || citation.url}</span>}
      </li>)}</ul>
      {result.searchSuggestions.map((html, index) => <iframe key={index}
        title={`${t("admin.businessData.searchSuggestions", { defaultValue: "Google Search suggestions" })} ${index + 1}`}
        srcDoc={html} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"
        className="business-research-suggestions" />)}
      <button type="button" className="goal-button" onClick={() => setResult(null)}>
        {t("admin.businessData.clearResearch", { defaultValue: "Clear research result" })}
      </button>
    </section>}
  </section>;
}
