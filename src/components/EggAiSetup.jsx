import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { listBusinessSources } from "../lib/businessData";
import { Link } from "react-router-dom";

const FEEDBACK_TOPICS = ["service", "quality", "speed", "cleanliness", "atmosphere", "value", "other"];
const DEFAULT_FEEDBACK_TOPICS = ["service", "quality", "speed", "cleanliness", "other"];

export default function EggAiSetup({ campaign, t, canManage = true, onSettingsChange }) {
  const [expanded, setExpanded] = useState(false);
  const [sources, setSources] = useState([]);
  const [sharedSourceCount, setSharedSourceCount] = useState(0);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [enabled, setEnabled] = useState(Boolean(campaign.ai_enabled));
  const [feedbackTopics, setFeedbackTopics] = useState(campaign.ai_feedback_topics || DEFAULT_FEEDBACK_TOPICS);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [faqTitle, setFaqTitle] = useState("");
  const [faqContent, setFaqContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const sourceLimitReached = sources.length >= 8;

  async function loadSources() {
    setSourcesLoaded(false);
    const { data, error } = await supabase
      .from("egg_ai_sources")
      .select("id, source_type, title, source_url, content, created_at")
      .eq("campaign_id", campaign.id)
      .order("created_at", { ascending: false });
    if (error) {
      setIsError(true);
      setMessage(error.message);
      return;
    }
    try {
      const shared = await listBusinessSources(campaign.workspace_id);
      setSharedSourceCount(shared.length);
      setSources(data || []);
      setSourcesLoaded(true);
    } catch (loadError) {
      console.error("Unable to load shared Egg information", loadError);
      setIsError(true);
      setMessage(loadError.message);
    }
  }

  useEffect(() => {
    if (expanded && canManage) loadSources();
  }, [campaign.id, expanded, canManage]);

  async function toggleAiAssistant(event) {
    const nextEnabled = event.target.checked;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("qr_campaigns")
      .update({ ai_enabled: nextEnabled })
      .eq("id", campaign.id);
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setEnabled(nextEnabled);
      onSettingsChange?.({ ai_enabled: nextEnabled });
    }
    setBusy(false);
  }

  async function toggleFeedbackTopic(topic) {
    const nextTopics = feedbackTopics.includes(topic)
      ? feedbackTopics.filter((current) => current !== topic)
      : [...feedbackTopics, topic];
    if (nextTopics.length === 0) {
      setIsError(true);
      setMessage(t("admin.engagement.ai.keepTopic"));
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("qr_campaigns")
      .update({ ai_feedback_topics: nextTopics })
      .eq("id", campaign.id);
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setFeedbackTopics(nextTopics);
      onSettingsChange?.({ ai_feedback_topics: nextTopics });
      setIsError(false);
    }
    setBusy(false);
  }

  async function importWebsite(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error(t("admin.engagement.ai.signInRequired"));
      const response = await fetch("/api/egg-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ action: "import-website", campaignId: campaign.id, websiteUrl })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("admin.engagement.ai.websiteImportFailed"));
      setWebsiteUrl("");
      setIsError(false);
      setMessage(t("admin.engagement.ai.websiteImported"));
      await loadSources();
    } catch (error) {
      setIsError(true);
      setMessage(error.message || t("admin.engagement.ai.websiteImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function addFaq(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("egg_ai_sources").insert({
      campaign_id: campaign.id,
      workspace_id: campaign.workspace_id,
      source_type: "faq",
      title: faqTitle.trim(),
      content: faqContent.trim()
    });
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setFaqTitle("");
      setFaqContent("");
      setIsError(false);
      setMessage(t("admin.engagement.ai.faqAdded"));
      await loadSources();
    }
    setBusy(false);
  }

  async function deleteSource(sourceId) {
    setBusy(true);
    setMessage("");
    if (enabled && sources.length === 1 && sharedSourceCount === 0) {
      const { error: disableError } = await supabase
        .from("qr_campaigns")
        .update({ ai_enabled: false })
        .eq("id", campaign.id);
      if (disableError) {
        setIsError(true);
        setMessage(disableError.message);
        setBusy(false);
        return;
      }
      setEnabled(false);
      onSettingsChange?.({ ai_enabled: false });
    }
    const { error } = await supabase.from("egg_ai_sources").delete().eq("id", sourceId);
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setSources((current) => current.filter((source) => source.id !== sourceId));
      setIsError(false);
      setMessage(t("admin.engagement.ai.sourceDeleted"));
    }
    setBusy(false);
  }

  return (
    <section className="mt-3 rounded border border-violet-900 bg-violet-950/20 p-3">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
        <span>
          <span className="block font-semibold text-violet-200">{t("admin.engagement.ai.title")}</span>
          <span className="mt-1 block text-xs font-normal leading-relaxed text-slate-400">{t("admin.engagement.ai.description")}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 rounded border border-violet-800 px-2 py-0.5 text-violet-200">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && !canManage && <p className="hub-notice">{t("admin.goal.managerRequired", { defaultValue: "An owner or editor can manage Eggs." })}</p>}
      {expanded && canManage && <>
      <p className="hub-notice">{t("admin.engagement.ai.sharedData", { defaultValue: "Uses your shared Business Data, plus any information added here." })} <Link className="goal-text-link" to="/admin?tab=business">{t("admin.hub.business", { defaultValue: "Business Data" })}</Link></p>
      <fieldset className="mt-3" disabled={!sourcesLoaded}>
        <legend className="text-xs font-semibold text-slate-300">{t("admin.engagement.ai.feedbackTopicsTitle")}</legend>
        <p className="mb-2 text-xs text-slate-400">{t("admin.engagement.ai.feedbackTopicsHint")}</p>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_TOPICS.map((topic) => (
            <label key={topic} className="flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={feedbackTopics.includes(topic)}
                disabled={busy}
                onChange={() => toggleFeedbackTopic(topic)}
              />
              {t(`admin.engagement.ai.topics.${topic}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
        <input type="checkbox" checked={enabled} disabled={busy || !sourcesLoaded || (sources.length + sharedSourceCount === 0 && !enabled)} onChange={toggleAiAssistant} className="mt-1" />
        <span>
          {t("admin.engagement.ai.enable")}
          <span className="mt-1 block text-xs text-slate-400">{t("admin.engagement.ai.usageLimits")}</span>
          {sourcesLoaded && sources.length + sharedSourceCount === 0 && <span className="mt-1 block text-xs text-amber-300">{t("admin.engagement.ai.addMaterialFirst")}</span>}
        </span>
      </label>

      <form onSubmit={importWebsite} className="mt-4 space-y-2">
        <label className="block text-xs font-semibold text-slate-300">
          {t("admin.engagement.ai.websiteLabel")}
          <input
            type="url"
            required
            maxLength={500}
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="https://example.com"
            className="mt-1 w-full rounded border p-2 text-sm text-black"
          />
        </label>
        <p className="text-xs text-slate-400">{t("admin.engagement.ai.websiteHint")}</p>
        <button type="submit" disabled={busy || !sourcesLoaded || sourceLimitReached} className="rounded bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? t("admin.engagement.ai.working") : t("admin.engagement.ai.importWebsite")}
        </button>
      </form>

      <form onSubmit={addFaq} className="mt-4 space-y-2 border-t border-slate-700 pt-3">
        <label className="block text-xs font-semibold text-slate-300">
          {t("admin.engagement.ai.faqTitleLabel")}
          <input required maxLength={120} value={faqTitle} onChange={(event) => setFaqTitle(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm text-black" placeholder={t("admin.engagement.ai.faqTitlePlaceholder")} />
        </label>
        <label className="block text-xs font-semibold text-slate-300">
          {t("admin.engagement.ai.faqContentLabel")}
          <textarea required maxLength={8000} rows={4} value={faqContent} onChange={(event) => setFaqContent(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm text-black" placeholder={t("admin.engagement.ai.faqContentPlaceholder")} />
        </label>
        <button type="submit" disabled={busy || !sourcesLoaded || sourceLimitReached} className="rounded bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {t("admin.engagement.ai.addFaq")}
        </button>
      </form>
      {sourceLimitReached && <p className="mt-2 text-xs text-amber-300">{t("admin.engagement.ai.sourceLimit")}</p>}

      {sources.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-slate-700 pt-3">
          <h4 className="text-sm font-semibold text-slate-200">{t("admin.engagement.ai.materials", { count: sources.length })}</h4>
          {sources.map((source) => (
            <div key={source.id} className="flex items-start justify-between gap-3 rounded border border-slate-700 bg-slate-950/50 p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{source.title}</p>
                <p className="text-xs uppercase text-slate-500">{t(`admin.engagement.ai.sourceTypes.${source.source_type}`)}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{source.content}</p>
              </div>
              <button type="button" disabled={busy || !sourcesLoaded} onClick={() => deleteSource(source.id)} className="shrink-0 rounded border border-red-900 px-2 py-1 text-xs text-red-300 disabled:opacity-50">
                {t("admin.engagement.ai.removeSource")}
              </button>
            </div>
          ))}
        </div>
      )}

      {message && <p role={isError ? "alert" : "status"} className={`mt-3 text-xs ${isError ? "text-red-300" : "text-emerald-300"}`}>{message}</p>}
      </>}
    </section>
  );
}
