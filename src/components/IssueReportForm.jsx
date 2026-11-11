import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEggTrialSessionId } from "../lib/eggTrial";
import { submitEggIssue } from "../lib/issueReports";
import { getReadableBrandColor } from "../lib/pollBranding";

const CATEGORIES = ["service", "cleanliness", "accessibility", "safety", "other"];

export default function IssueReportForm({ campaignId, preview = false, branding, onSubmitted }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState("service");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy || preview || !campaignId) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const sessionId = getEggTrialSessionId();
      const result = await submitEggIssue({ campaignId, category, description, sessionId });
      if ((result.email?.enabled && !result.email.sent) || (result.sms?.enabled && !result.sms.sent)) {
        setError(t("issueReport.savedAlertFailed", {
          defaultValue: "Your report was saved, but at least one configured alert could not be delivered. Please contact the business directly if this is urgent."
        }));
      } else if (result.notified) {
        setStatus(t("issueReport.thanks", { defaultValue: "Thank you. Your report has been sent to the business." }));
      } else {
        setError(t("issueReport.savedNoAlerts", {
          defaultValue: "Your report was saved, but the business has no alert channel enabled. Please contact them directly if this needs attention."
        }));
      }
      setDescription("");
      onSubmitted?.();
    } catch (failure) {
      console.error("Unable to submit on-site issue report", failure);
      setError(failure.message || t("issueReport.submitError", { defaultValue: "Your report could not be sent. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  return <section className="qr-portal-menu-item issue-report-card" aria-labelledby="issue-report-title">
    <h2 id="issue-report-title" className="qr-portal-menu-item-title">
      {t("issueReport.title", { defaultValue: "Report an issue" })}
    </h2>
    <p className="qr-portal-menu-item-body">
      {t("issueReport.description", { defaultValue: "Let the business know if something on site needs attention." })}
    </p>
    {preview
      ? <p className="issue-report-preview-note">{t("issueReport.previewNote", { defaultValue: "Issue reporting is available to visitors when this Egg is published." })}</p>
      : <form className="issue-report-form" onSubmit={handleSubmit}>
        <label>
          {t("issueReport.categoryLabel", { defaultValue: "What needs attention?" })}
          <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={busy}>
            {CATEGORIES.map((item) => <option key={item} value={item}>
              {t(`issueReport.categories.${item}`, { defaultValue: item[0].toUpperCase() + item.slice(1) })}
            </option>)}
          </select>
        </label>
        <label>
          {t("issueReport.detailsLabel", { defaultValue: "Describe the issue" })}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minLength={8}
            maxLength={1000}
            rows={3}
            required
            disabled={busy}
            placeholder={t("issueReport.detailsPlaceholder", { defaultValue: "Please share enough detail for the business to respond." })}
          />
        </label>
        <button type="submit" disabled={busy || description.trim().length < 8} style={{ backgroundColor: getReadableBrandColor(branding?.primaryColor), color: "#fff" }}>
          {busy ? t("issueReport.sending", { defaultValue: "Sending…" }) : t("issueReport.submit", { defaultValue: "Send issue report" })}
        </button>
      </form>}
    {status && <p className="issue-report-success" role="status">{status}</p>}
    {error && <p className="issue-report-error" role="alert">{error}</p>}
  </section>;
}
