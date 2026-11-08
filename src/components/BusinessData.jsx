import { useEffect, useRef, useState } from "react";
import {
  BUSINESS_SOURCE_LIMIT, addBusinessNotes, addInstagramLink, importBusinessWebsite,
  listBusinessSources, removeBusinessSource
} from "../lib/businessData";

export default function BusinessData({ workspaceId, canManage, t }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const scope = useRef({ workspaceId, canManage, generation: 0 });
  if (scope.current.workspaceId !== workspaceId || scope.current.canManage !== canManage) {
    scope.current = { workspaceId, canManage, generation: scope.current.generation + 1 };
  }
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setSources([]);
    setMessage("");
    setLoadFailed(false);
    setBusy(false);
    setTitle("");
    setNotes("");
    setWebsite("");
    setInstagram("");
    if (!workspaceId || !canManage) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    listBusinessSources(workspaceId).then((data) => {
      if (active) setSources(data);
    }).catch((error) => {
      if (active) {
        setIsError(true);
        setLoadFailed(true);
        setMessage(error.message);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [workspaceId, canManage, reload]);

  async function perform(operation, clear) {
    const generation = scope.current.generation;
    const isCurrent = () => scope.current.generation === generation && scope.current.canManage;
    setBusy(true);
    setMessage("");
    try {
      await operation();
      if (!isCurrent()) return;
      clear();
      setLoadFailed(true);
      const nextSources = await listBusinessSources(workspaceId);
      if (!isCurrent()) return;
      setSources(nextSources);
      setLoadFailed(false);
      setIsError(false);
      setMessage(t("admin.businessData.saved", { defaultValue: "Business information updated." }));
    } catch (error) {
      if (!isCurrent()) return;
      setIsError(true);
      setMessage(error.message || t("admin.businessData.error", { defaultValue: "Could not update business information." }));
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
              perform(() => addBusinessNotes(workspaceId, title, notes), () => { setTitle(""); setNotes(""); });
            }}>
              <label>{t("admin.businessData.notesTitle", { defaultValue: "Notes title" })}
                <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label>{t("admin.businessData.notes", { defaultValue: "Business notes" })}
                <textarea required maxLength={8000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.addNotes", { defaultValue: "Add notes" })}</button>
            </form>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => importBusinessWebsite(workspaceId, website), () => setWebsite(""));
            }}>
              <label>{t("admin.businessData.website", { defaultValue: "Website" })}
                <input type="url" required maxLength={500} placeholder="https://example.com" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.importWebsite", { defaultValue: "Import website" })}</button>
            </form>
            <form className="business-data-form" onSubmit={(event) => {
              event.preventDefault();
              perform(() => addInstagramLink(workspaceId, instagram), () => setInstagram(""));
            }}>
              <label>{t("admin.businessData.instagram", { defaultValue: "Instagram profile link" })}
                <input type="url" required maxLength={500} placeholder="https://www.instagram.com/example" value={instagram} onChange={(event) => setInstagram(event.target.value)} />
              </label>
              <p>{t("admin.businessData.instagramHint", { defaultValue: "Only the link is saved. Instagram content is not imported." })}</p>
              <button className="goal-button" type="submit" disabled={disabled}>{t("admin.businessData.saveInstagram", { defaultValue: "Save link" })}</button>
            </form>
            {loading && <p role="status">{t("admin.businessData.loading", { defaultValue: "Loading business information..." })}</p>}
            {loadFailed && <button className="goal-button" type="button" onClick={() => setReload((value) => value + 1)}>{t("admin.businessData.retry", { defaultValue: "Try again" })}</button>}
            {!loading && sources.length >= BUSINESS_SOURCE_LIMIT && <p>{t("admin.businessData.limit", { defaultValue: "Maximum 8 shared sources. Remove one to add another." })}</p>}
            {sources.length > 0 && <div className="business-data-sources">
              <h3>{t("admin.businessData.sources", { defaultValue: "Shared sources" })}</h3>
              {sources.map((source) => <div className="business-data-source" key={source.id}>
                <strong>{source.title}</strong>
                <p>{source.content}</p>
                <button type="button" className="goal-button" disabled={busy || loading || loadFailed} onClick={() => perform(() => removeBusinessSource(workspaceId, source.id), () => {})}>
                  {t("admin.businessData.remove", { defaultValue: "Remove" })}
                </button>
              </div>)}
            </div>}
            {message && <p className="business-data-message" role={isError ? "alert" : "status"}>{message}</p>}
          </>}
    </section>
  );
}
