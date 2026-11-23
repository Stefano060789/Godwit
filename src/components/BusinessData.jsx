import { useEffect, useRef, useState } from "react";
import {
  BUSINESS_SOURCE_LIMIT, addBusinessNotes, addFacebookLink, addInstagramLink, addWebsiteLink, importBusinessWebsite, uploadBusinessWebsite,
  listBusinessSources, removeBusinessSource
} from "../lib/businessData";
import BusinessResearch from "./BusinessResearch";
import { safeBusinessUrl } from "../lib/businessLinks";

export default function BusinessData({ workspaceId, canManage, t }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ key: "", message: "", isError: false });
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteFile, setWebsiteFile] = useState(null);
  const websiteFileInput = useRef(null);
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const scope = useRef({ workspaceId, canManage, generation: 0 });
  if (scope.current.workspaceId !== workspaceId || scope.current.canManage !== canManage) {
    scope.current = { workspaceId, canManage, generation: scope.current.generation + 1 };
  }
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setSources([]);
    setStatus({ key: "", message: "", isError: false });
    setLoadFailed(false);
    setBusy(false);
    setTitle("");
    setNotes("");
    setWebsite("");
    setWebsiteFile(null);
    if (websiteFileInput.current) websiteFileInput.current.value = "";
    setInstagram("");
    setFacebook("");
    if (!workspaceId || !canManage) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    listBusinessSources(workspaceId).then((data) => {
      if (active) setSources(data);
    }).catch((error) => {
      if (active) {
        setLoadFailed(true);
        setStatus({ key: "sources", message: error.message, isError: true });
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [workspaceId, canManage, reload]);

  async function perform(operation, clear, key, progress = "") {
    const generation = scope.current.generation;
    const isCurrent = () => scope.current.generation === generation && scope.current.canManage;
    let operationCompleted = false;
    setBusy(true);
    setStatus({ key, message: progress, isError: false });
    try {
      await operation();
      if (!isCurrent()) return;
      operationCompleted = true;
      clear();
      setLoadFailed(true);
      const nextSources = await listBusinessSources(workspaceId);
      if (!isCurrent()) return;
      setSources(nextSources);
      setLoadFailed(false);
      setStatus({ key, message: t("admin.businessData.saved", { defaultValue: "Business information updated." }), isError: false });
    } catch (error) {
      if (!isCurrent()) return;
      setStatus({
        key,
        message: operationCompleted
          ? t("admin.businessData.savedRefreshFailed", { defaultValue: "The change was saved, but the source list could not be refreshed. Try again below." })
          : error.message || t("admin.businessData.error", { defaultValue: "Could not update business information." }),
        isError: true
      });
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  const disabled = busy || loading || loadFailed || sources.length >= BUSINESS_SOURCE_LIMIT;
  return (
    <section className="business-data hub-page">
      <header className="hub-page-heading">
        <p className="goal-eyebrow">{t("admin.hub.business", { defaultValue: "Business Data" })}</p>
        <h2 className="business-data-title">{t("admin.businessData.title", { defaultValue: "Your business, in one place" })}</h2>
        <p className="business-data-description">{t("admin.businessData.description", { defaultValue: "Add information once. Every Egg can use it." })}</p>
      </header>
      {!workspaceId ? <p>{t("admin.businessData.selectWorkspace", { defaultValue: "Select a workspace first." })}</p>
        : !canManage ? <p>{t("admin.businessData.managerOnly", { defaultValue: "A workspace manager can manage business information." })}</p>
          : <>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => addBusinessNotes(workspaceId, title, notes), () => { setTitle(""); setNotes(""); }, "notes");
            }}>
              <p>{t("admin.businessData.reviewReminder", { defaultValue: "Review these details regularly and whenever your hours, menu or booking arrangements change. Replace outdated notes so visitors do not receive conflicting information." })}</p>
              <button type="button" className="goal-button" disabled={disabled || Boolean(title.trim() || notes.trim())} onClick={() => {
                setTitle(t("admin.businessData.templateTitle", { defaultValue: "Visitor information" }));
                setNotes(t("admin.businessData.templateText", { defaultValue: "Address:\nOpening hours and exceptions:\nMenu or services:\nBooking or contact details:\nLast reviewed:" }));
              }}>{t("admin.businessData.useTemplate", { defaultValue: "Start with a visitor information template" })}</button>
              <p>{t("admin.businessData.templateHint", { defaultValue: "Fill in only verified facts; remove empty fields. For clickable menu or booking links, add the HTTPS link below. Replace outdated notes with corrected ones; if the source limit is full, copy the old note before removing it to make room." })}</p>
              <label>{t("admin.businessData.notesTitle", { defaultValue: "Notes title" })}
                <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>{t("admin.businessData.notes", { defaultValue: "Business notes" })}
                <textarea required maxLength={8000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <p>{t("admin.businessData.notesHint", { defaultValue: "Add the facts visitors need: address, regular hours and exceptions, menu details and links. For art, include the artwork title, artist, medium, style and your own explanation. Keep this information current; the AI cannot infer missing facts from a social link." })}</p>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.addNotes", { defaultValue: "Add notes" })}</button>
              {status.key === "notes" && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
            </form>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => importBusinessWebsite(workspaceId, website), () => setWebsite(""), "website-import");
            }}>
              <label>{t("admin.businessData.website", { defaultValue: "Website" })}
                <input type="url" required maxLength={500} placeholder="https://example.com" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.importWebsite", { defaultValue: "Import website" })}</button>
              <button className="goal-button" type="button" disabled={disabled} onClick={(event) => {
                if (!event.currentTarget.form.reportValidity()) return;
                perform(() => addWebsiteLink(workspaceId, website), () => setWebsite(""), "website-import");
              }}>{t("admin.businessData.saveWebsiteLink", { defaultValue: "Save link without importing" })}</button>
              <p>{t("admin.businessData.websiteLinkHint", { defaultValue: "You can save a clickable website link even if import fails. A link alone does not tell the AI your hours, address or menu — add those details in business notes." })}</p>
              {status.key === "website-import" && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
              <p>{t("admin.businessData.uploadWebsiteHint", { defaultValue: "If import is blocked, ask the website owner to allow Godwit's importer. Meanwhile, open the public page in your browser, save it as HTML (Webpage, HTML only), and upload it below. Only upload material you have permission to share; check that it contains no private information." })}</p>
              <label>{t("admin.businessData.websiteFile", { defaultValue: "Saved webpage (.html or .htm, maximum 1 MB)" })}
                <input ref={websiteFileInput} type="file" accept=".html,.htm,text/html" onChange={(event) => setWebsiteFile(event.target.files?.[0] || null)} />
              </label>
              <button className="goal-button" type="button" disabled={disabled || !websiteFile} onClick={(event) => {
                if (!event.currentTarget.form.reportValidity()) return;
                perform(() => uploadBusinessWebsite(workspaceId, website, websiteFile), () => {
                  setWebsite("");
                  setWebsiteFile(null);
                  if (websiteFileInput.current) websiteFileInput.current.value = "";
                }, "website-upload", t("admin.businessData.uploadingWebsite", { defaultValue: "Uploading the saved webpage..." }));
              }}>{t("admin.businessData.uploadWebsite", { defaultValue: "Upload saved webpage" })}</button>
              {status.key === "website-upload" && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
              <p>{t("admin.businessData.uploadWebsiteSnapshot", { defaultValue: "Website imports are saved as snapshots and will not update automatically. Uploading saves readable text from the selected page only." })}</p>
            </form>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => addInstagramLink(workspaceId, instagram), () => setInstagram(""), "instagram");
            }}>
              <label>{t("admin.businessData.instagram", { defaultValue: "Instagram profile link" })}
                <input type="url" required maxLength={500} placeholder="https://www.instagram.com/example" value={instagram} onChange={(event) => setInstagram(event.target.value)} />
              </label>
              <p>{t("admin.businessData.instagramHint", { defaultValue: "Only the link is saved. Instagram content is not imported." })}</p>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.saveInstagram", { defaultValue: "Save link" })}</button>
              {status.key === "instagram" && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
            </form>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => addFacebookLink(workspaceId, facebook), () => setFacebook(""), "facebook");
            }}>
              <label>{t("admin.businessData.facebook", { defaultValue: "Facebook page or profile link" })}
                <input type="url" required maxLength={500} placeholder="https://www.facebook.com/example" value={facebook} onChange={(event) => setFacebook(event.target.value)} />
              </label>
              <p>{t("admin.businessData.facebookHint", { defaultValue: "Only the link is saved. Facebook content is not imported." })}</p>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.saveFacebook", { defaultValue: "Save link" })}</button>
              {status.key === "facebook" && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
            </form>
            <BusinessResearch key={workspaceId} workspaceId={workspaceId} t={t} />
            {loading && <p role="status">{t("admin.businessData.loading", { defaultValue: "Loading business information..." })}</p>}
            {status.key === "sources" && sources.length === 0 && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
            {loadFailed && <button className="goal-button" type="button" onClick={() => setReload((value) => value + 1)}>{t("admin.businessData.retry", { defaultValue: "Try again" })}</button>}
            {!loading && sources.length >= BUSINESS_SOURCE_LIMIT && <p>{t("admin.businessData.limit", { defaultValue: "Maximum 8 shared sources. Remove one to add another." })}</p>}
            {sources.length > 0 && <div className="business-data-sources">
              <h3>{t("admin.businessData.sources", { defaultValue: "Shared sources" })}</h3>
              {sources.map((source) => <div className="business-data-source" key={source.id}>
                <strong>{source.title}</strong>
                {safeBusinessUrl(source.source_url) && <a href={safeBusinessUrl(source.source_url)} target="_blank" rel="noopener noreferrer">
                  {t("admin.businessData.openSource", { defaultValue: "Open source" })}
                </a>}
                <p>{source.content}</p>
                <button type="button" className="goal-button" disabled={busy || loading || loadFailed} onClick={() => perform(() => removeBusinessSource(workspaceId, source.id), () => {}, "sources")}>
                  {t("admin.businessData.remove", { defaultValue: "Remove" })}
                </button>
              </div>)}
              {status.key === "sources" && status.message && <p className="business-data-message" role={status.isError ? "alert" : "status"}>{status.message}</p>}
            </div>}
          </>}
    </section>
  );
}
