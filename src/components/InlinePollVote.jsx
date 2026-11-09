import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { isPollClosed } from "../lib/pollMeta";

export function hasOptionalPollExtras(poll) {
  return Boolean(poll.allow_organizer_messages === true
    || poll.raffle_enabled === true
    || (poll.email_benefit_type && poll.email_benefit_type !== "none")
    || (poll.review_benefit_type && poll.review_benefit_type !== "none"));
}

// Renders one "poll" QR-campaign item directly inline in the QR menu: the question and its
// answer options are shown open, right there, so a voter can answer without clicking through to
// a separate page. Optional follow-up features remain available on the full poll when configured.
export default function InlinePollVote({ item, branding }) {
  const { t } = useTranslation();
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const pageOpenedAtRef = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadPoll() {
      const { data, error } = await supabase
        .rpc("get_public_poll", { target_poll_id: Number(item.poll_id) })
        .single();
      if (cancelled) return;
      if (!error && data) setPoll(data);
      setLoading(false);
    }

    loadPoll();
    if (localStorage.getItem(`voted_${item.poll_id}`)) setSubmitted(true);

    return () => {
      cancelled = true;
    };
  }, [item.poll_id]);

  const isMultiple = Boolean(poll?.multiple_choice ?? poll?.allow_multiple);

  function toggleAnswer(answer) {
    setSelected((current) => {
      if (isMultiple) {
        return current.includes(answer) ? current.filter((existing) => existing !== answer) : [...current, answer];
      }
      return [answer];
    });
  }

  async function handleSubmit() {
    const answersToSubmit = [...selected, ...(freeText.trim() ? [freeText.trim()] : [])];
    // Same light bot friction as the full vote page: a submission faster than a human could
    // plausibly read the question and pick an answer is silently dropped.
    if (answersToSubmit.length === 0 || submitting || Date.now() - pageOpenedAtRef.current < 800) return;

    setSubmitting(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const rows = answersToSubmit.map((answer) => ({
      poll_id: item.poll_id,
      answer,
      user_id: user?.id || null,
      campaign_id: item.campaign_id || null
    }));

    const { error } = await supabase.from("votes").insert(rows);
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        setDuplicate(true);
        setSubmitted(true);
        return;
      }
      console.error(error);
      return;
    }

    if (!user) localStorage.setItem(`voted_${item.poll_id}`, "true");
    setSubmitted(true);
  }

  if (loading) {
    return (
      <div className="qr-portal-menu-item qr-portal-menu-poll">
        <span className="qr-portal-menu-item-title">{item.poll_question}</span>
      </div>
    );
  }

  if (!poll || !Array.isArray(poll.answers)) return null;

  if (isPollClosed(poll)) {
    return (
      <div className="qr-portal-menu-item qr-portal-menu-poll" style={{ borderColor: branding.primaryColor }}>
        <span className="qr-portal-menu-item-title">{poll.question}</span>
        <p className="qr-portal-poll-closed">This poll is closed.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="qr-portal-menu-item qr-portal-menu-poll qr-portal-poll-done" style={{ borderColor: branding.primaryColor }}>
        <span className="qr-portal-menu-item-title">{poll.question}</span>
        <p className="qr-portal-poll-thanks">{duplicate ? t("vote.alreadyAnsweredInline") : t("vote.thanksInline")}</p>
        <div className="qr-portal-learn">
          <p>{t("vote.learnFromGodwit")}</p>
          <Link to="/" className="qr-portal-learn-link">{t("vote.seeGodwitFeatures")}</Link>
        </div>
      </div>
    );
  }

  const canSubmit = selected.length > 0 || Boolean(freeText.trim());

  return (
    <div className="qr-portal-menu-item qr-portal-menu-poll" style={{ borderColor: branding.primaryColor }}>
      <span className="qr-portal-menu-item-title">{poll.question}</span>
      <div className="qr-portal-poll-answers">
        {poll.answers.map((answer) => (
          <label key={answer} className="qr-portal-poll-answer">
            <input
              type={isMultiple ? "checkbox" : "radio"}
              name={`qr-poll-${item.poll_id}`}
              checked={selected.includes(answer)}
              onChange={() => toggleAnswer(answer)}
            />
            <span>{answer}</span>
          </label>
        ))}
      </div>
      {poll.allow_user_answers && (
        <input
          type="text"
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
          placeholder="Or type your own answer"
          maxLength={200}
          className="qr-portal-poll-freetext"
        />
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
        className="qr-portal-menu-item-cta qr-portal-poll-submit"
        style={{ backgroundColor: branding.primaryColor }}
      >
        {submitting ? "Submitting…" : "Submit"}
      </button>
      {hasOptionalPollExtras(poll) && (
        <Link to={`/vote/${item.poll_id}?campaign=${item.campaign_id}`} className="qr-portal-poll-more">
          {t("vote.moreWaysToRespond", { defaultValue: "Optional ways to respond" })} →
        </Link>
      )}
    </div>
  );
}
