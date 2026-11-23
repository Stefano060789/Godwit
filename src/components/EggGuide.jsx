import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DonationCard from "./DonationCard";
import EggAiAssistant from "./EggAiAssistant";
import EggReviewFeedback from "./EggReviewFeedback";
import InlinePollVote from "./InlinePollVote";
import IssueReportForm from "./IssueReportForm";
import { accessibilityTagIcon, accessibilityTagLabel } from "../lib/accessibilityTags";
import { INTENT_ICONS, buildGuideIntents, pickNextIntent } from "../lib/eggGuide";
import { getContrastingTextColor, getReadableBrandColor } from "../lib/pollBranding";

const DEFAULT_COPY = {
  ask: ["Ask me anything", "Get quick answers about this place."],
  poll: ["Share your view", "Answer a quick question — it takes seconds."],
  info: ["See useful information", "Menus, details and practical tips."],
  offer: ["See what's on offer", "Events, offers and special deals."],
  report: ["Report an issue", "Tell the team if something needs attention."],
  review: ["Leave private feedback", "Tell the business about your visit."],
  donate: ["Support this place", "Contribute to the venue."]
};

function GuideLink({ item, branding, onClick, label }) {
  if (!item.link_url) return null;
  return <a
    href={item.link_url}
    target="_blank"
    rel="noreferrer"
    onClick={onClick}
    className="egg-guide-link"
    style={{ color: getReadableBrandColor(branding.primaryColor) }}
  >
    {item.link_label || label} →
  </a>;
}

export default function EggGuide({ token, menu, goalKeys = [], preview = false, onLinkClick }) {
  const { t } = useTranslation();
  const { portalTitle, portalMessage, items, branding, aiEnabled, trialSessionId, campaignId } = menu;
  const aiAvailable = Boolean(aiEnabled || menu.aiPreview);
  const intents = useMemo(
    () => buildGuideIntents({ goalKeys, items, aiEnabled: aiAvailable, canReport: Boolean(campaignId) }),
    [goalKeys, items, aiAvailable, campaignId]
  );
  const [currentId, setCurrentId] = useState(intents.length === 1 ? intents[0].id : null);
  const [doneIds, setDoneIds] = useState([]);
  const [skippedIds, setSkippedIds] = useState([]);
  const [assistantOpened, setAssistantOpened] = useState(currentId === "ask");
  const [pendingPollResponse, setPendingPollResponse] = useState(null);
  const [continuationRequest, setContinuationRequest] = useState(null);
  const brand = getReadableBrandColor(branding.primaryColor);
  const brandInk = getContrastingTextColor(brand);
  const current = intents.find((intent) => intent.id === currentId) || null;
  const next = pickNextIntent(intents, [...doneIds, ...skippedIds]) || pickNextIntent(intents, doneIds);
  const label = (kind, part) => t(`eggGuide.intents.${kind}.${part}`, { defaultValue: DEFAULT_COPY[kind][part === "title" ? 0 : 1] });

  function markDone(id) {
    setDoneIds((existing) => existing.includes(id) ? existing : [...existing, id]);
  }

  function renderPanel(intent) {
    if (intent.kind === "review") {
      return <EggReviewFeedback campaignId={campaignId} trialSessionId={trialSessionId} preview={preview}
        onSubmitted={() => markDone(intent.id)} />;
    }
    if (intent.kind === "ask") {
      return <EggAiAssistant
        token={token}
        campaignId={campaignId}
        trialSessionId={trialSessionId}
        branding={branding}
        preview={menu.aiPreview}
        onFinished={() => { markDone(intent.id); setCurrentId(null); }}
        initialPollResponse={continuationRequest}
        onContinuationStarted={() => { setContinuationRequest(null); setPendingPollResponse(null); }}
        showPrivateFeedback={false}
        onSelectOption={(id) => {
          const target = intents.find((entry) => entry.items.some((item) => String(item.item_id) === id)
            || (id === `default-${campaignId}` && entry.kind === "poll")
            || (id === "guide:report" && entry.kind === "report"));
          if (target) setCurrentId(target.id);
        }}
      />;
    }
    if (intent.kind === "report") {
      return <IssueReportForm campaignId={campaignId} preview={preview} branding={branding} onSubmitted={() => markDone(intent.id)} />;
    }
    return intent.items.map((item) => {
      if (item.item_type === "poll") {
        return <InlinePollVote key={item.item_id} item={item} branding={branding} preview={preview} showGodwitLink={false} onSubmitted={(response) => {
          markDone(intent.id);
          if (response.answers.length) setPendingPollResponse(response);
        }} />;
      }
      if (item.item_type === "donation") return <DonationCard key={item.item_id} item={item} campaignToken={token} />;
      return <div key={item.item_id} className="qr-portal-menu-item qr-portal-menu-info">
        {item.image_url && <img src={item.image_url} alt={item.title || ""} className="qr-portal-menu-item-image" />}
        <span className="qr-portal-menu-item-title">{item.item_type === "reward" ? "🎁 " : ""}{item.title}</span>
        {item.accessibility_tags?.length > 0 && <span className="qr-portal-menu-item-tags" aria-label={`Accessibility: ${item.accessibility_tags.map((tag) => accessibilityTagLabel(tag)).join(", ")}`}>
          {item.accessibility_tags.map((tag) => <span key={tag} className="qr-portal-menu-item-tag" title={accessibilityTagLabel(tag)}>{accessibilityTagIcon(tag)}</span>)}
        </span>}
        {item.body && <p className="qr-portal-menu-item-body">{item.body}</p>}
        {item.reward_code && <p className="qr-portal-menu-item-reward-code">{item.reward_code}</p>}
        <GuideLink
          item={item}
          branding={branding}
          label={t("eggGuide.openLink", { defaultValue: "Open link" })}
          onClick={() => { onLinkClick?.(item.item_id); markDone(intent.id); }}
        />
      </div>;
    });
  }

  return <main className="egg-guide" style={{ "--egg-brand": brand, "--egg-brand-ink": brandInk }}>
    <header className="egg-guide-header">
      {branding.logoUrl && <img src={branding.logoUrl} alt={`${branding.brandName || "Venue"} logo`} className="egg-guide-logo" />}
      <p className="egg-guide-brand">{branding.brandName || "Godwit"}</p>
      {intents.length > 1 && <p>{t("eggGuide.optionalOptions", { defaultValue: "Choose what is useful to you. Everything is optional." })}</p>}
    </header>

    {!current && <section className="egg-guide-body">
      <p className="egg-guide-kicker">{doneIds.length
        ? t("eggGuide.thanksKicker", { defaultValue: "Thanks — that helps." })
        : t("eggGuide.kicker", { defaultValue: "A little help from Godwit" })}</p>
      <h1>{next
        ? (doneIds.length ? t("eggGuide.whatNext", { defaultValue: "What would you like to do next?" }) : portalTitle || t("eggGuide.welcome", { defaultValue: "Welcome. What brings you here?" }))
        : t("eggGuide.allDone", { defaultValue: "You're all set. Thank you!" })}</h1>
      {!doneIds.length && portalMessage && <p className="egg-guide-lead">{portalMessage}</p>}
      <div className="egg-guide-options">
        {intents.map((intent) => {
          const done = doneIds.includes(intent.id);
          const suggested = next?.id === intent.id;
          return <button
            key={intent.id}
            type="button"
            className={`egg-guide-option${suggested ? " is-suggested" : ""}${done ? " is-done" : ""}`}
            onClick={() => { if (intent.kind === "ask") setAssistantOpened(true); setCurrentId(intent.id); }}
          >
            <span className="egg-guide-option-icon" aria-hidden="true">{done ? "✓" : INTENT_ICONS[intent.kind]}</span>
            <span className="egg-guide-option-text">
              <strong>{label(intent.kind, "title")}</strong>
              <small>{label(intent.kind, "hint")}</small>
            </span>
            {suggested && <em>{t("eggGuide.suggested", { defaultValue: "Suggested" })}</em>}
          </button>;
        })}
      </div>
    </section>}

    {(current || assistantOpened) && <section className="egg-guide-body" hidden={!current}>
      {intents.length > 1 && <button type="button" className="egg-guide-back" onClick={() => setCurrentId(null)}>
        ← {t("eggGuide.back", { defaultValue: "Back" })}
      </button>}
      {current && <h1>{label(current.kind, "title")}</h1>}
      <div className="egg-guide-panel">
        {assistantOpened && intents.some((intent) => intent.kind === "ask") && <div hidden={current?.kind !== "ask"}>{renderPanel(intents.find((intent) => intent.kind === "ask"))}</div>}
        {current && current.kind !== "ask" && renderPanel(current)}
        {current?.kind === "poll" && pendingPollResponse && aiAvailable && !preview && <div className="qr-portal-ai-prompts">
          <p>{t("eggAi.continueAfterVotePrivacy", { defaultValue: "Optional: share your selected answers with Anthropic's AI for a useful next step. They may also be used for your later questions in this conversation." })}</p>
          <button type="button" className="egg-guide-continue" onClick={() => {
            setContinuationRequest(pendingPollResponse); setAssistantOpened(true); setCurrentId("ask");
          }}>
            {t("eggAi.continueAfterVote", { defaultValue: "Continue with AI" })}
          </button>
        </div>}
      </div>
      {current && intents.length > 1 && <div className="egg-guide-footer">
        <button type="button" className="egg-guide-continue" onClick={() => {
          if (!doneIds.includes(current.id)) setSkippedIds((existing) => [...existing, current.id]);
          setCurrentId(null);
        }}>
          {doneIds.includes(current.id)
            ? t("eggGuide.continueDone", { defaultValue: "Done — what's next?" })
            : t("eggGuide.continueSkip", { defaultValue: "Skip — show other options" })}
        </button>
      </div>}
    </section>}
  </main>;
}
