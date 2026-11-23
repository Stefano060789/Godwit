import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { submitEggReviewFeedback } from "../lib/goalProgress";

const STARTERS = [
  ["highlight", "What stood out?", "What stood out for me: "],
  ["improve", "What could be better?", "One thing that could be better: "],
  ["other", "Something else", "I'd like the team to know: "]
];

export default function EggReviewFeedback({ campaignId, trialSessionId, preview = false, onSubmitted }) {
  const { t } = useTranslation("translation", { keyPrefix: "eggAi" });
  const [feedback, setFeedback] = useState("");
  const [starter, setStarter] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const textarea = useRef(null);
  const locked = busy || Boolean(status);

  async function submit(event) {
    event.preventDefault();
    if (locked || preview || feedback.trim().length < 10 || feedback.trim() === starter.trim()) return;
    setBusy(true);
    setError("");
    try {
      const saved = await submitEggReviewFeedback(campaignId, trialSessionId, feedback.trim());
      setStatus(saved ? "reviewSubmitted" : "reviewAlreadySubmitted");
      setFeedback("");
      onSubmitted?.();
    } catch (failure) {
      console.error("Unable to submit private visitor feedback", failure);
      setError(t("reviewError", { defaultValue: "Your feedback could not be sent. Please try again." }));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="qr-portal-ai-review-form egg-feedback-card">
    <h3>{t("experienceTitle", { defaultValue: "Your visit can shape what happens next" })}</h3>
    <p>{t("experienceDescription", { defaultValue: "What stayed with you? What would make your next visit better? Send a short note directly to the team." })}</p>
    <p className="qr-portal-ai-privacy">{t("reviewDescription")}</p>
    <div className="egg-feedback-starters">
      {STARTERS.map(([key, label, text]) => <button type="button" key={key} disabled={locked || preview} onClick={() => {
        if (!feedback.trim() || feedback.trim() === starter.trim()) {
          const next = t(`experienceStarters.${key}.text`, { defaultValue: text });
          setFeedback(next);
          setStarter(next);
        }
        textarea.current?.focus();
      }}>{t(`experienceStarters.${key}.label`, { defaultValue: label })}</button>)}
    </div>
    <label htmlFor="egg-private-feedback">{t("reviewLabel")}</label>
    <textarea id="egg-private-feedback" ref={textarea} className="qr-portal-ai-input" rows={4}
      minLength={10} maxLength={1200} required value={feedback} disabled={locked || preview}
      onChange={(event) => setFeedback(event.target.value)} placeholder={t("reviewPlaceholder")} />
    <button type="submit" className="qr-portal-ai-submit" disabled={locked || preview || feedback.trim().length < 10 || feedback.trim() === starter.trim()}>
      {busy ? t("reviewSubmitting") : t("reviewSubmit")}
    </button>
    {preview && <p>{t("feedbackPreview", { defaultValue: "This is a preview. Visitors can send private feedback when the Egg is published." })}</p>}
    {status && <p role="status" className="qr-portal-ai-status">{t(status)}</p>}
    {error && <p role="alert" className="qr-portal-ai-error">{error}</p>}
  </form>;
}
