import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InlinePollVote from "./InlinePollVote";

const GOAL_PROMPTS = {
  answers: "askQuestion",
  feedback: "sharePreference",
  information: "findInformation",
  "next-step": "findNextStep",
  contacts: "stayInTouch",
  reviews: "shareFeedback"
};
const DEFAULT_PROMPTS = ["askQuestion", "findInformation", "sharePreference"];

export function buildGuidedPrompts(goalKeys, feedbackTopics, t) {
  const promptKeys = goalKeys.length
    ? goalKeys.map((goal) => GOAL_PROMPTS[goal]).filter(Boolean)
    : DEFAULT_PROMPTS;
  const goalPrompts = promptKeys.map((key) => ({
    id: key,
    label: t(`guidedPrompts.${key}.label`),
    prompt: t(`guidedPrompts.${key}.prompt`)
  }));
  const topicPrompts = feedbackTopics.map((topic) => ({
    id: `topic-${topic}`,
    label: t(`topicLabels.${topic}`, { defaultValue: t("topicLabels.other") }),
    prompt: t(`topicPrompts.${topic}`, { defaultValue: t("topicPrompts.other") })
  }));

  return [...goalPrompts, ...topicPrompts]
    .filter((entry, index, entries) => entry.label && entries.findIndex((candidate) => candidate.label === entry.label) === index)
    .slice(0, 3);
}

function createSessionId() {
  const storageKey = "godwit-egg-ai-session";
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export default function EggAiAssistant({ token, campaignId, branding, preview = false, initiallyExpanded = true }) {
  const { t } = useTranslation("translation", { keyPrefix: "eggAi" });
  const [enabled, setEnabled] = useState(preview);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [messages, setMessages] = useState([]);
  const [feedbackTopics, setFeedbackTopics] = useState([]);
  const [goalKeys, setGoalKeys] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId] = useState(createSessionId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/egg-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config", token })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load assistant settings.");
        return response.json();
      })
      .then((result) => {
        if (!cancelled) {
          setEnabled(result.enabled === true);
          setFeedbackTopics(Array.isArray(result.feedbackTopics) ? result.feedbackTopics : []);
          setGoalKeys(Array.isArray(result.goalKeys) ? result.goalKeys : []);
        }
      })
      .catch((loadError) => console.error("Unable to load Egg AI settings:", loadError));
    return () => { cancelled = true; };
  }, [token]);

  async function sendMessage(messageText) {
    const message = messageText.trim();
    if (!message || sending || message.length > 600) return;
    setSending(true);
    setError("");
    setInput("");
    try {
      const response = await fetch("/api/egg-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          token,
          sessionId,
          message,
          history: messages.slice(-4).map(({ role, content }) => ({ role, content }))
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(response.status === 429 ? t("usageLimit") : t("assistantError"));
      }
      const poll = result.poll && Number.isSafeInteger(Number(result.poll.id)) && Array.isArray(result.poll.answers)
        ? { id: Number(result.poll.id), campaignId, answers: result.poll.answers }
        : null;
      setMessages((current) => [
        ...current,
        { role: "user", content: message },
        {
          role: "assistant",
          content: result.answer,
          suggestions: result.suggestions || [],
          poll: poll && current.some((entry) => entry.poll?.id === poll.id) ? null : poll,
          pollUnavailable: result.pollUnavailable === true
        }
      ]);
    } catch (sendError) {
      setInput(message);
      setError(sendError.message || t("assistantError"));
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    void sendMessage(input);
  }

  function getSuggestionHref(suggestion) {
    return `#egg-option-${encodeURIComponent(suggestion.id)}`;
  }

  if (!enabled) return null;
  const guidedPrompts = buildGuidedPrompts(goalKeys, feedbackTopics, t);
  return (
    <section className="qr-portal-menu-item qr-portal-ai-assistant" aria-label="AI business assistant">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="w-full text-left"
      >
          <span className="qr-portal-menu-item-title">{t("title")}</span>
          <span className="qr-portal-menu-item-body">{t("description")}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          {preview && <p className="qr-portal-ai-preview-note">{t("previewHint")}</p>}
          <p className="text-xs text-slate-400">{t("privacyHint")}</p>
          <div className="space-y-2" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`}>
                <p className={`rounded p-2 text-sm ${message.role === "user" ? "ml-6 bg-slate-800" : "mr-6 bg-violet-950/50"}`}>
                  <strong className="mr-1">{message.role === "user" ? t("you") : t("assistant")}:</strong>
                  {message.content}
                </p>
                {message.poll && (
                  <div className="mt-2">
                    <InlinePollVote
                      item={{ poll_id: message.poll.id, campaign_id: message.poll.campaignId }}
                      branding={branding}
                    />
                  </div>
                )}
                {message.pollUnavailable && <p className="mt-2 text-xs text-slate-400">{t("pollUnavailable")}</p>}
                {message.suggestions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-semibold text-slate-400">{t("suggestedOptions")}</p>
                    {message.suggestions.map((suggestion) => (
                      <a
                        key={`${suggestion.type}-${suggestion.id}`}
                        href={getSuggestionHref(suggestion)}
                        className="block rounded border border-teal-700 px-3 py-2 text-sm text-teal-200 hover:bg-teal-950/40"
                      >
                        {t(`optionTypes.${suggestion.type}`)}: {suggestion.title} →
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {messages.length === 0 && guidedPrompts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">{t("guidedPromptLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {guidedPrompts.map(({ id, label, prompt }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={sending}
                    onClick={() => sendMessage(prompt)}
                    className="qr-portal-ai-prompt"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={handleFormSubmit} className="space-y-2">
            <label className="sr-only" htmlFor="egg-ai-question">{t("questionLabel")}</label>
            <textarea
              id="egg-ai-question"
              rows={2}
              maxLength={600}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("questionPlaceholder")}
              className="w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm text-white"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{input.length}/600</span>
              <button type="submit" disabled={sending || !input.trim()} className="rounded bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {sending ? t("thinking") : t("ask")}
              </button>
            </div>
          </form>
          {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        </div>
      )}
    </section>
  );
}
