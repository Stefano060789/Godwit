import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import { isRestrictedTopic } from "../lib/restrictedContent";
import { createStableQrUrl } from "../lib/pollLinks";
import { savePollMeta } from "../lib/pollMeta";
import { POLL_TEMPLATES, INDUSTRY_LABELS, getTemplateByKey } from "../lib/pollTemplates";
import { DEFAULT_ACCENT_COLOR, DEFAULT_PRIMARY_COLOR } from "../lib/pollBranding";
import { loadWorkspaceProfile } from "../lib/workspaceProfile";
import { getEntitlements } from "../lib/entitlements";
import LockedFeature from "../components/LockedFeature";

export default function CreatePoll() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const assignCampaignId = searchParams.get("campaign");
  const [assignedCampaignName, setAssignedCampaignName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([""]);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [allowUserAnswers, setAllowUserAnswers] = useState(false);
  const [allowOrganizerMessages, setAllowOrganizerMessages] = useState(false);
  const [templateKey, setTemplateKey] = useState("blank");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(DEFAULT_PRIMARY_COLOR);
  const [brandAccentColor, setBrandAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [rewardMessage, setRewardMessage] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [rewardUrl, setRewardUrl] = useState("");
  const [emailBenefitType, setEmailBenefitType] = useState("none");
  const [emailBenefitValue, setEmailBenefitValue] = useState("");
  const [emailBenefitUrl, setEmailBenefitUrl] = useState("");
  const [raffleEnabled, setRaffleEnabled] = useState(false);
  const [rafflePrize, setRafflePrize] = useState("");
  const [raffleAcknowledged, setRaffleAcknowledged] = useState(false);
  const [raffleRulesUrl, setRaffleRulesUrl] = useState("");
  const [loyaltyVisitThreshold, setLoyaltyVisitThreshold] = useState("");
  const [loyaltyBenefitMessage, setLoyaltyBenefitMessage] = useState("");
  const [loyaltyBenefitCode, setLoyaltyBenefitCode] = useState("");
  const [loyaltyBenefitUrl, setLoyaltyBenefitUrl] = useState("");
  const [pollId, setPollId] = useState(null);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    async function loadDefaultBranding() {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(Boolean(user?.id));
      if (!user?.id) return;

      const profile = await loadWorkspaceProfile();
      setPlan(profile.plan || "free");
      setBrandName((current) => current || profile.companyName || "");
      setBrandLogoUrl((current) => current || profile.logoUrl || "");
      setBrandPrimaryColor((current) => current === DEFAULT_PRIMARY_COLOR ? profile.primaryColor : current);
      setBrandAccentColor((current) => current === DEFAULT_ACCENT_COLOR ? profile.accentColor : current);
    }

    loadDefaultBranding();
  }, [assignCampaignId]);

  async function createShortLink(longUrl) {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`
    );
    if (!response.ok) {
      throw new Error(`TinyURL request failed with status ${response.status}`);
    }
    return response.text();
  }

  function updateAnswer(index, value) {
    const newAnswers = [...answers];
    newAnswers[index] = value;

    if (index === answers.length - 1 && value.trim() !== "" && answers.length < 10) {
      newAnswers.push("");
    }

    setAnswers(newAnswers);
  }

  function applyTemplate(selectedKey) {
    const template = getTemplateByKey(selectedKey);
    setTemplateKey(template.key);
    setQuestion(template.question);
    const nextAnswers = Array.isArray(template.answers) ? template.answers.slice(0, 10) : [""];
    if (nextAnswers.length < 10) {
      nextAnswers.push("");
    }
    setAnswers(nextAnswers);
    if (template.suggestedPrimaryColor) {
      setBrandPrimaryColor(template.suggestedPrimaryColor);
    }
  }

  async function createPoll() {
    if (!question.trim()) return;

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(userError || "User not authenticated");
      return;
    }

    const cleanedAnswers = answers
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    if (cleanedAnswers.length === 0) return;

    if (isRestrictedTopic(question.trim())) {
      alert(t("admin.pollForm.errors.restrictedQuestion"));
      return;
    }

    if (raffleEnabled && !raffleAcknowledged) {
      alert(t("admin.pollForm.errors.confirmPrizeRules"));
      return;
    }

    for (const ans of cleanedAnswers) {
      if (isRestrictedTopic(ans)) {
        alert(t("admin.pollForm.errors.restrictedAnswer", { answer: ans }));
        return;
      }
    }

    const { data, error } = await supabase
      .from("polls")
      .insert({
        question: question.trim(),
        answers: cleanedAnswers,
        multiple_choice: multipleChoice,
        allow_user_answers: allowUserAnswers,
        allow_organizer_messages: allowOrganizerMessages,
        creator_id: user.id
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert(t("admin.pollForm.errors.createFailed", { message: error.message }));
      return;
    }

    const stableShortUrl = createStableQrUrl();
    const { error: stableShortUrlError } = await supabase
      .from("polls")
      .update({ stable_short_url: stableShortUrl })
      .eq("id", data.id);

    if (stableShortUrlError) {
      console.error(stableShortUrlError);
      alert(t("admin.pollForm.errors.qrLinkFailed", { message: stableShortUrlError.message }));
      return;
    }

    const voteUrl = `${window.location.origin}/vote/${data.id}`;
    try {
      const shortUrl = await createShortLink(voteUrl);
      const { error: shortUrlError } = await supabase
        .from("polls")
        .update({ short_url: shortUrl })
        .eq("id", data.id);

      if (shortUrlError) {
        console.error(shortUrlError);
      }
    } catch (shortUrlError) {
      console.error(shortUrlError);
    }

    let resolvedLocationName = null;

    if (assignCampaignId) {
      const { data: campaign, error: assignError } = await supabase
        .from("qr_campaigns")
        .update({ poll_id: data.id })
        .eq("id", assignCampaignId)
        .select("name, placement_label, token")
        .maybeSingle();
      if (!assignError && campaign) {
        setAssignedCampaignName(campaign.name);
        resolvedLocationName = campaign.placement_label || campaign.name;
      }
    }

    await savePollMeta(data.id, {
      location_name: resolvedLocationName,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      status: "active",
      template_key: templateKey,
      brand_name: brandName.trim() || null,
      brand_logo_url: brandLogoUrl.trim() || null,
      brand_primary_color: brandPrimaryColor || DEFAULT_PRIMARY_COLOR,
      brand_accent_color: brandAccentColor || DEFAULT_ACCENT_COLOR,
      reward_message: rewardMessage.trim() || null,
      reward_code: rewardCode.trim() || null,
      reward_url: rewardUrl.trim() || null,
      email_benefit_type: emailBenefitType,
      email_benefit_value: emailBenefitValue.trim() || null,
      email_benefit_url: emailBenefitUrl.trim() || null,
      raffle_enabled: raffleEnabled,
      raffle_prize: raffleEnabled ? rafflePrize.trim() || null : null,
      raffle_terms_acknowledged: raffleEnabled ? raffleAcknowledged : false,
      raffle_rules_url: raffleEnabled ? raffleRulesUrl.trim() || null : null,
      loyalty_visit_threshold: loyaltyVisitThreshold.trim() ? Number(loyaltyVisitThreshold) : null,
      loyalty_benefit_message: loyaltyBenefitMessage.trim() || null,
      loyalty_benefit_code: loyaltyBenefitCode.trim() || null,
      loyalty_benefit_url: loyaltyBenefitUrl.trim() || null
    });

    setPollId(data.id);
  }

  const entitlements = getEntitlements(plan);

  return (
    <Layout theme="workspace">
      <div className="max-w-xl mx-auto p-6">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">{t("admin.pollForm.createTitle")}</h1>
          <p className="mt-2 text-sm text-slate-400">{t("admin.pollForm.createSubtitle")}</p>
          {assignCampaignId && (
            <p className="mt-2 rounded border border-teal-700 bg-teal-950 p-2 text-sm text-teal-200">
              {t("admin.pollForm.assignedQr")}
            </p>
          )}
        </div>

        {isAuthenticated === false && (
          <div className="rounded border border-sky-700 bg-slate-900 p-5 text-center">
            <h2 className="text-xl font-bold">{t("admin.pollForm.workspaceTitle")}</h2>
            <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/register" className="rounded bg-sky-500 px-4 py-2 font-semibold text-slate-950">{t("admin.pollForm.createWorkspace")}</Link>
              <Link to="/login" className="rounded border border-slate-500 px-4 py-2 font-semibold text-slate-100">{t("admin.pollForm.signIn")}</Link>
            </div>
          </div>
        )}

        {isAuthenticated === null && <p className="text-center text-sm text-slate-400">{t("admin.pollForm.checkingAccess")}</p>}

        {isAuthenticated !== true ? null : <>

        <label className="block mb-2 font-semibold">{t("admin.pollForm.template")}</label>
        <select
          value={templateKey}
          onChange={(e) => applyTemplate(e.target.value)}
          className="w-full border p-2 rounded mb-4 text-black"
        >
          {Object.entries(INDUSTRY_LABELS).map(([industryKey, industryLabel]) => (
            <optgroup key={industryKey} label={industryLabel}>
              {POLL_TEMPLATES.filter((template) => template.industry === industryKey).map((template) => (
                <option key={template.key} value={template.key}>
                  {template.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label className="block mb-2 font-semibold">{t("admin.pollForm.question")}</label>
        <input
          type="text"
          className="w-full border p-2 rounded mb-4 text-black"
          placeholder={t("admin.pollForm.questionPlaceholder")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <label className="block mb-2 font-semibold">{t("admin.pollForm.answers")}</label>
        <div className="space-y-2 mb-4">
          {answers.map((answer, index) => (
            <input
              key={index}
              type="text"
              value={answer}
              onChange={(e) => updateAnswer(index, e.target.value)}
              className="w-full border p-2 rounded text-black"
              placeholder={t("admin.pollForm.answerPlaceholder", { number: index + 1 })}
            />
          ))}
        </div>

        {answers.length >= 10 && (
          <p className="text-red-600 text-sm mb-4">{t("admin.pollForm.maxAnswers")}</p>
        )}

        <details className="mb-4 border border-slate-700 rounded">
          <summary className="cursor-pointer p-3 font-semibold">{t("admin.pollForm.responseOptions")}</summary>
          <div className="px-3 pb-3">
            <p className="mb-3 text-sm text-slate-400">{t("admin.pollForm.responseOptionsHint")}</p>
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={multipleChoice}
                onChange={(e) => setMultipleChoice(e.target.checked)}
              />
              <span>{t("admin.pollForm.multipleAnswers")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowUserAnswers}
                onChange={(e) => setAllowUserAnswers(e.target.checked)}
              />
              <span>{t("admin.pollForm.customAnswers")}</span>
            </label>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={allowOrganizerMessages}
                onChange={(e) => setAllowOrganizerMessages(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("admin.pollForm.organizerMessages")}</span>
            </label>
          </div>
        </details>

        <details className="mb-6 border border-slate-700 rounded">
          <summary className="cursor-pointer p-3 font-semibold">{t("admin.pollForm.schedule")}</summary>
          <div className="px-3 pb-3">
            <p className="mb-3 text-sm text-slate-400">{t("admin.pollForm.scheduleHint")}</p>
            <label className="block mb-2 font-semibold">{t("admin.pollForm.startsAt")}</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full border p-2 rounded mb-4 text-black placeholder-black"
            />
            <label className="block mb-2 font-semibold">{t("admin.pollForm.endsAt")}</label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full border p-2 rounded text-black placeholder-black"
            />
          </div>
        </details>

        <details className="mb-6 border border-slate-700 rounded">
          <summary className="cursor-pointer p-3 font-semibold">{t("admin.pollForm.afterVoting")}</summary>
          <div className="px-3 pb-3">
            <p className="mb-3 text-sm text-slate-400">{t("admin.pollForm.afterVotingHint")}</p>
            {entitlements.rewardMessage ? (
            <>
            <label className="block mb-2 font-semibold">{t("admin.pollForm.rewardMessage")}</label>
            <input
              type="text"
              value={rewardMessage}
              onChange={(e) => setRewardMessage(e.target.value)}
              className="w-full border p-2 rounded mb-4 text-black placeholder-black"
              placeholder={t("admin.pollForm.rewardMessagePlaceholder")}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <input
                type="text"
                value={rewardCode}
                onChange={(e) => setRewardCode(e.target.value)}
                className="w-full border p-2 rounded text-black placeholder-black"
                placeholder={t("admin.pollForm.discountCode")}
              />
              <input
                type="url"
                value={rewardUrl}
                onChange={(e) => setRewardUrl(e.target.value)}
                className="w-full border p-2 rounded text-black placeholder-black"
                placeholder={t("admin.pollForm.redemptionLink")}
              />
            </div>
            </>
            ) : (
              <div className="mb-4">
                <LockedFeature
                  feature="rewardMessage"
                  title={t("admin.pollForm.rewardLockedTitle")}
                  description={t("admin.pollForm.rewardLockedBody")}
                />
              </div>
            )}
            <div className="mt-5 border-t border-slate-600 pt-4">
              {!entitlements.emailBenefits ? (
                <LockedFeature
                  feature="emailBenefits"
                  title={t("admin.pollForm.emailBenefitLockedTitle")}
                  description={t("admin.pollForm.emailBenefitLockedBody")}
                />
              ) : (
              <>
              <p className="font-semibold">{t("admin.pollForm.emailBenefitTitle")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("admin.pollForm.emailBenefitBody")}</p>
              <select value={emailBenefitType} onChange={(event) => setEmailBenefitType(event.target.value)} className="mt-3 w-full border p-2 rounded text-black">
                <option value="none">{t("admin.pollForm.noEmailBenefit")}</option>
                <option value="voucher">{t("admin.pollForm.voucher")}</option>
                <option value="discount_code">{t("admin.pollForm.discountCodeShort")}</option>
              </select>
              {emailBenefitType !== "none" && <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <input value={emailBenefitValue} onChange={(event) => setEmailBenefitValue(event.target.value)} className="border p-2 rounded text-black" placeholder={t("admin.pollForm.voucherOrCode")} />
                <input type="url" value={emailBenefitUrl} onChange={(event) => setEmailBenefitUrl(event.target.value)} className="border p-2 rounded text-black" placeholder={t("admin.pollForm.redemptionLink")} />
              </div>}
              </>
              )}
            </div>
            {entitlements.prizeDraws ? (
            <>
            <label className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                checked={raffleEnabled}
                onChange={(e) => setRaffleEnabled(e.target.checked)}
              />
              <span className="font-semibold">{t("admin.pollForm.prizeDraw")}</span>
            </label>
            {raffleEnabled && (
              <>
                <input
                  type="text"
                  value={rafflePrize}
                  onChange={(e) => setRafflePrize(e.target.value)}
                  className="mt-2 w-full border p-2 rounded text-black placeholder-black"
                  placeholder={t("admin.pollForm.prizePlaceholder")}
                />
                <p className="mt-2 text-xs text-slate-400">
                  {t("admin.pollForm.prizeRulesHint")}
                </p>
                <input
                  type="url"
                  value={raffleRulesUrl}
                  onChange={(e) => setRaffleRulesUrl(e.target.value)}
                  className="mt-2 w-full border p-2 rounded text-black placeholder-black"
                  placeholder={t("admin.pollForm.officialRulesLink")}
                />
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={raffleAcknowledged}
                    onChange={(e) => setRaffleAcknowledged(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t("admin.pollForm.prizeAcknowledgement")}</span>
                </label>
              </>
            )}
            </>
            ) : (
              <div className="mt-4">
                <LockedFeature
                  feature="prizeDraws"
                  title={t("admin.pollForm.prizeDraw")}
                  description={t("admin.pollForm.prizeLockedBody")}
                />
              </div>
            )}
            <div className="mt-5 border-t border-slate-600 pt-4">
              <p className="font-semibold">{t("admin.pollForm.returningCustomer")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("admin.pollForm.returningCustomerBody")}</p>
              <input
                type="number"
                min="2"
                max="50"
                value={loyaltyVisitThreshold}
                onChange={(e) => setLoyaltyVisitThreshold(e.target.value)}
                className="mt-3 w-full border p-2 rounded text-black placeholder-black"
                placeholder={t("admin.pollForm.visitThreshold")}
              />
              {loyaltyVisitThreshold.trim() && <>
                <input
                  type="text"
                  value={loyaltyBenefitMessage}
                  onChange={(e) => setLoyaltyBenefitMessage(e.target.value)}
                  className="mt-3 w-full border p-2 rounded text-black placeholder-black"
                  placeholder={t("admin.pollForm.welcomeBack")}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <input
                    type="text"
                    value={loyaltyBenefitCode}
                    onChange={(e) => setLoyaltyBenefitCode(e.target.value)}
                    className="border p-2 rounded text-black placeholder-black"
                    placeholder={t("admin.pollForm.bonusCode")}
                  />
                  <input
                    type="url"
                    value={loyaltyBenefitUrl}
                    onChange={(e) => setLoyaltyBenefitUrl(e.target.value)}
                    className="border p-2 rounded text-black placeholder-black"
                    placeholder={t("admin.pollForm.redemptionLink")}
                  />
                </div>
              </>}
            </div>
          </div>
        </details>

        <button
          onClick={createPoll}
          className="w-full bg-blue-600 text-white p-3 rounded font-semibold"
        >
          {t("admin.pollForm.createButton")}
        </button>

        {pollId && (
          <div className="mt-8 text-center">
            <h2 className="text-xl font-bold mb-4">{t("admin.pollForm.createdTitle")}</h2>
            {assignedCampaignName && (
              <p className="mb-4 rounded border border-teal-700 bg-teal-950 p-2 text-sm text-teal-200">
                {t("admin.pollForm.assignedToQr", { name: assignedCampaignName })}
              </p>
            )}
            <p className="mb-4">{t("admin.pollForm.pollId", { id: pollId })}</p>

            <p className="text-white mt-4">
              {t("admin.pollForm.shareLink")}:{" "}
              <span
                className="text-blue-400 underline cursor-pointer"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/vote/${pollId}`)}
              >
                {window.location.origin}/vote/{pollId}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/vote/${pollId}`)}
                className="ml-2 bg-blue-600 text-white px-2 py-1 rounded"
              >
                {t("admin.pollForm.copy")}
              </button>
            </p>

            <p className="mt-6 text-sm text-slate-400">{t("admin.pollForm.whatsNext")}</p>
            <div className="mt-3 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => { window.location.href = "/create"; }}
                className="inline-flex items-center justify-center rounded bg-slate-100 px-4 py-2 font-semibold text-slate-900"
              >
                {t("admin.pollForm.createAnother")}
              </button>
              <Link
                to="/admin?tab=engagement"
                className="inline-flex items-center justify-center rounded bg-amber-400 px-4 py-2 font-semibold text-slate-950"
              >
                {t("admin.pollForm.goToQr")}
              </Link>
            </div>

            <div className="mt-3">
              <Link
                to={`/admin?poll=${pollId}`}
                className="inline-flex items-center justify-center rounded border border-slate-500 px-4 py-2 font-semibold text-slate-100"
              >
                {t("admin.pollForm.managePoll")}
              </Link>
            </div>
          </div>
        )}

        </>}

        <p className="mt-10 text-center text-xs text-slate-400">
          Godwit v1.0.1
        </p>
      </div>
    </Layout>
  );
}
