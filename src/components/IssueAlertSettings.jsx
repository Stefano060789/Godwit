import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadEggIssueNotifications,
  loadIssueAlertSettings,
  markEggIssueNotificationRead,
  saveIssueAlertSettings
} from "../lib/issueReports";

const DEFAULT_SETTINGS = {
  email_enabled: false,
  sms_enabled: false,
  in_app_enabled: true,
  recipient_email: "",
  recipient_phone: ""
};

export default function IssueAlertSettings({ workspaceId, canManage }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refreshNotifications = useCallback(async () => {
    if (!workspaceId) return;
    const records = await loadEggIssueNotifications(workspaceId);
    setNotifications(records);
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [loadedSettings, records] = await Promise.all([
          loadIssueAlertSettings(workspaceId),
          loadEggIssueNotifications(workspaceId)
        ]);
        if (active) {
          setSettings({ ...DEFAULT_SETTINGS, ...loadedSettings });
          setNotifications(records);
        }
      } catch (failure) {
        console.error("Unable to load issue alert settings", failure);
        if (active) setError(t("issueAlerts.loadError", {
          defaultValue: "Issue alerts are unavailable. Apply the issue-alerts database migration, then try again."
        }));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const refreshId = window.setInterval(() => {
      refreshNotifications().catch((failure) => console.error("Unable to refresh issue notifications", failure));
    }, 30000);
    return () => {
      active = false;
      window.clearInterval(refreshId);
    };
  }, [workspaceId, refreshNotifications, t]);

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setStatus("");
    try {
      await saveIssueAlertSettings({ ...settings, workspace_id: workspaceId });
      setStatus(t("issueAlerts.saved", { defaultValue: "Issue alert settings saved." }));
    } catch (failure) {
      console.error("Unable to save issue alert settings", failure);
      setError(failure.message || t("issueAlerts.saveError", { defaultValue: "Unable to save issue alert settings." }));
    } finally {
      setSaving(false);
    }
  }

  async function markRead(id) {
    try {
      await markEggIssueNotificationRead(id);
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (failure) {
      console.error("Unable to mark issue notification as read", failure);
      setError(t("issueAlerts.readError", { defaultValue: "Could not update this notification. Please try again." }));
    }
  }

  return <details className="mb-6 rounded border border-slate-700 bg-gray-900" open>
    <summary className="cursor-pointer p-4 text-xl font-bold">{t("issueAlerts.title", { defaultValue: "On-site issue alerts" })}</summary>
    <div className="space-y-5 px-4 pb-4">
      <p className="text-sm text-slate-300">{t("issueAlerts.intro", { defaultValue: "Choose how your team is alerted when a visitor reports an on-site issue." })}</p>
      {loading && <p role="status">{t("issueAlerts.loading", { defaultValue: "Loading issue alert settings…" })}</p>}
      {!loading && <>
        <form onSubmit={handleSave} className="space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={settings.in_app_enabled} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, in_app_enabled: event.target.checked }))} />
            <span><strong>{t("issueAlerts.inApp", { defaultValue: "In-app notification" })}</strong><span className="block text-sm text-slate-400">{t("issueAlerts.inAppHelp", { defaultValue: "Show new reports in this Settings inbox." })}</span></span>
          </label>
          <div className="rounded border border-slate-700 p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={settings.email_enabled} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, email_enabled: event.target.checked }))} />
              <strong>{t("issueAlerts.email", { defaultValue: "Email alert" })}</strong>
            </label>
            <input type="email" value={settings.recipient_email || ""} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, recipient_email: event.target.value }))} className="mt-3 w-full rounded border p-2 text-black" placeholder={t("issueAlerts.emailPlaceholder", { defaultValue: "alerts@example.com" })} />
          </div>
          <div className="rounded border border-slate-700 p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={settings.sms_enabled} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, sms_enabled: event.target.checked }))} />
              <strong>{t("issueAlerts.sms", { defaultValue: "SMS alert" })}</strong>
            </label>
            <input type="tel" value={settings.recipient_phone || ""} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, recipient_phone: event.target.value }))} className="mt-3 w-full rounded border p-2 text-black" placeholder="+436641234567" />
            <p className="mt-2 text-xs text-slate-400">{t("issueAlerts.smsHelp", { defaultValue: "Use international format. SMS delivery requires the Godwit SMS provider to be configured and may incur provider charges." })}</p>
          </div>
          {canManage && <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
            {saving ? t("issueAlerts.saving", { defaultValue: "Saving…" }) : t("issueAlerts.save", { defaultValue: "Save alert settings" })}
          </button>}
        </form>

        <section aria-labelledby="issue-alert-inbox-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="issue-alert-inbox-title" className="text-lg font-bold">{t("issueAlerts.inbox", { defaultValue: "Recent issue reports" })}</h3>
            <button type="button" className="text-sm underline" onClick={() => refreshNotifications().catch((failure) => {
              console.error("Unable to refresh issue notifications", failure);
              setError(t("issueAlerts.loadError", { defaultValue: "Could not refresh issue alerts." }));
            })}>{t("issueAlerts.refresh", { defaultValue: "Refresh" })}</button>
          </div>
          {notifications.length === 0
            ? <p className="mt-2 text-sm text-slate-400">{t("issueAlerts.empty", { defaultValue: "No issue reports yet." })}</p>
            : <ul className="mt-3 space-y-3">
              {notifications.map((item) => <li key={item.id} className={`rounded border p-3 ${item.read_at ? "border-slate-700 opacity-75" : "border-amber-500 bg-amber-950/20"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <strong>{item.title}</strong>
                  <time className="text-xs text-slate-400" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{item.message}</p>
                {!item.read_at && canManage && <button type="button" className="mt-3 text-sm underline" onClick={() => markRead(item.id)}>
                  {t("issueAlerts.markRead", { defaultValue: "Mark as read" })}
                </button>}
              </li>)}
            </ul>}
        </section>
      </>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {status && <p role="status" className="text-sm text-emerald-300">{status}</p>}
      {!canManage && <p className="text-xs text-slate-400">{t("issueAlerts.managerOnly", { defaultValue: "Only workspace owners and editors can change alert settings." })}</p>}
    </div>
  </details>;
}
