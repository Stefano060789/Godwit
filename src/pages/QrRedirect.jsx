import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getPollBranding } from "../lib/pollBranding";
import { reassignManagedCampaignPoll, resolveManagedQrToken } from "../lib/qrManage";
import DonationCard from "../components/DonationCard";
import InlinePollVote from "../components/InlinePollVote";
import EggAiAssistant from "../components/EggAiAssistant";
import { accessibilityTagIcon, accessibilityTagLabel } from "../lib/accessibilityTags";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";
import { normalizeEggAccessMethod } from "../lib/eggs";
import { getEggTrialSessionId } from "../lib/eggTrial";
import { useTranslation } from "react-i18next";

export default function QrRedirect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  // Set by the "preview what a scanner sees" iframe in the QR creation wizard.
  // Management is explicit via ?manage=1 so normal QR scans behave like visitor scans,
  // even when the workspace owner is already signed in.
  const isPreview = searchParams.get("preview") === "1";
  const isManageMode = searchParams.get("manage") === "1";
  const accessMethod = normalizeEggAccessMethod(searchParams.get("via"));
  const [menu, setMenu] = useState(null);
  const [manage, setManage] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function recordEggAccess(campaignId, trialSessionId) {
      const { data: allowed, error: accessError } = await supabase.rpc("record_egg_access", {
        target_campaign_id: campaignId,
        target_access_method: accessMethod,
        target_session_id: trialSessionId,
        target_is_preview: isPreview
      });
      if (accessError) {
        console.error("Unable to verify Egg access:", accessError);
        setErrorMessage(t("trial.verifyFailed", { defaultValue: "We couldn't verify access to this Egg right now. Please try again later." }));
        return false;
      }
      if (allowed !== true) {
        setErrorMessage(t("trial.customerPaused", { defaultValue: "This Egg is temporarily unavailable. Please contact the business directly." }));
        return false;
      }
      return true;
    }

    async function resolveQr() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user && isManageMode && !isPreview) {
        const managed = await resolveManagedQrToken(token);
        if (managed) {
          setManage(managed);
          return;
        }
      }

      let trialSessionId;
      try {
        trialSessionId = getEggTrialSessionId({ preview: isPreview });
      } catch (sessionError) {
        setErrorMessage(sessionError.message);
        return;
      }

      const { data: campaign, error: campaignError } = await supabase
        .rpc("get_public_qr_campaign", { target_token: token })
        .maybeSingle();
      if (campaignError) {
        console.error("Unable to load Egg campaign:", campaignError);
        setErrorMessage(t("trial.verifyFailed", { defaultValue: "We couldn't verify access to this Egg right now. Please try again later." }));
        return;
      }
      if (campaign && !(await recordEggAccess(campaign.campaign_id, trialSessionId))) return;

      // A QR code can be linked to several things at once (extra polls, admin-authored
      // info cards). If it has any, show a menu of everything instead of jumping
      // straight to a single poll - this also covers info-only QR codes with no poll.
      const { data: items, error: itemsError } = await supabase
        .rpc("get_public_qr_campaign_items", {
          target_token: token,
          target_session_id: trialSessionId,
          target_is_preview: isPreview
        });

      const visibleItems = DONATION_FEATURE_ENABLED
        ? (items || [])
        : (items || []).filter((item) => item.item_type !== "donation");
      const sessionItems = visibleItems.map((item) => ({ ...item, trial_session_id: trialSessionId }));
      let eggAiEnabled = false;
      try {
        const aiConfigResponse = await fetch("/api/egg-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "config", token })
        });
        if (!aiConfigResponse.ok) throw new Error(`Egg AI settings request failed (${aiConfigResponse.status}).`);
        eggAiEnabled = (await aiConfigResponse.json()).enabled === true;
      } catch (aiConfigError) {
        console.error("Unable to load Egg AI settings:", aiConfigError);
      }

      if (itemsError) {
        console.error("Unable to load Egg options:", itemsError);
        setErrorMessage(t("trial.verifyFailed", { defaultValue: "We couldn't verify access to this Egg right now. Please try again later." }));
        return;
      }
      if (sessionItems.length > 0) {
        // If this QR code carries just one poll and nothing else (no info card, donation, or
        // reward), skip the intermediate "menu" screen entirely - land directly on the
        // question with answer options ready to tap, instead of an extra "Share feedback"
        // click. Only collapse when there's truly one thing to show; a poll alongside other
        // items still needs the menu so those other items remain visible.
        if (sessionItems.length === 1 && sessionItems[0].item_type === "poll" && !eggAiEnabled) {
          navigate(`/vote/${sessionItems[0].poll_id}?campaign=${sessionItems[0].campaign_id}&trialSessionId=${trialSessionId}`, { replace: true });
          return;
        }

        const firstPollItem = sessionItems.find((item) => item.item_type === "poll");
        const branding = getPollBranding(firstPollItem ? {
          brand_name: firstPollItem.poll_brand_name,
          brand_logo_url: firstPollItem.poll_brand_logo_url,
          brand_primary_color: firstPollItem.poll_brand_primary_color,
          brand_accent_color: firstPollItem.poll_brand_accent_color
        } : null);
        setMenu({
          campaignId: campaign?.campaign_id || sessionItems[0].campaign_id,
          portalTitle: campaign?.portal_title || sessionItems[0].portal_title,
          portalMessage: campaign?.portal_message || sessionItems[0].portal_message,
          items: sessionItems,
          branding,
          trialSessionId,
          aiEnabled: eggAiEnabled && !isPreview,
          aiPreview: eggAiEnabled && isPreview
        });
        return;
      }

      if (campaign?.poll_id) {
        const { data: campaignPoll } = await supabase
          .rpc("get_public_poll", { target_poll_id: campaign.poll_id })
          .single();
        if (campaignPoll?.allow_organizer_messages !== true && !eggAiEnabled) {
          navigate(`/vote/${campaign.poll_id}?campaign=${campaign.campaign_id}&trialSessionId=${trialSessionId}`, { replace: true });
          return;
        }
        if (eggAiEnabled) {
          const branding = getPollBranding(campaignPoll ? {
            brand_name: campaignPoll.brand_name,
            brand_logo_url: campaignPoll.brand_logo_url,
            brand_primary_color: campaignPoll.brand_primary_color,
            brand_accent_color: campaignPoll.brand_accent_color
          } : null);
          setMenu({
            campaignId: campaign.campaign_id,
            portalTitle: null,
            portalMessage: null,
            items: [{
              item_id: `default-${campaign.campaign_id}`,
              campaign_id: campaign.campaign_id,
              item_type: "poll",
              poll_id: campaign.poll_id,
              poll_question: campaignPoll?.question,
              trial_session_id: trialSessionId
            }],
            branding,
            trialSessionId,
            aiEnabled: !isPreview,
            aiPreview: isPreview
          });
          return;
        }
      }

      if (campaign && eggAiEnabled) {
        setMenu({
          campaignId: campaign.campaign_id,
          portalTitle: null,
          portalMessage: null,
          items: [],
          branding: getPollBranding(null),
          trialSessionId,
          aiEnabled: !isPreview,
          aiPreview: isPreview
        });
        return;
      }

      const stableShortUrl = `${window.location.origin}/qr/${token}`;
      const { data, error } = await supabase
        .rpc("get_public_poll_by_qr", { target_url: stableShortUrl })
        .single();

      if (error || !data) {
        console.error(error);
        setErrorMessage("This Egg does not have an active poll.");
        return;
      }

      navigate(`/vote/${data.id}`, { replace: true });
    }

    resolveQr();
  }, [navigate, token, isPreview, accessMethod]);

  async function changeAssignedPoll(nextPollId) {
    if (!manage || !nextPollId) return;
    const error = await reassignManagedCampaignPoll(manage.campaign.id, nextPollId);
    if (error) {
      alert(error.message);
      return;
    }
    const nextPoll = manage.polls.find((poll) => String(poll.id) === String(nextPollId)) || null;
    setManage((current) => ({ ...current, currentPoll: nextPoll, campaign: { ...current.campaign, poll_id: Number(nextPollId) } }));
  }

  if (manage) {
    return (
      <main className="mx-auto max-w-md p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">You are managing this Egg</p>
        <h1 className="mt-1 text-2xl font-bold">{manage.campaign.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {manage.campaign.placement_label || "Unlabeled placement"}{manage.campaign.variant_label ? ` · ${manage.campaign.variant_label}` : ""}
        </p>

        <div className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Currently showing</p>
          <p className="mt-1 font-semibold">{manage.currentPoll?.question || "No poll assigned yet"}</p>
        </div>

        <label className="mt-6 block text-sm font-semibold">Change the poll for this Egg</label>
        <select
          value={manage.campaign.poll_id ? String(manage.campaign.poll_id) : ""}
          onChange={(event) => changeAssignedPoll(event.target.value)}
          className="mt-2 w-full rounded border p-2 text-black"
        >
          <option value="">Choose a poll</option>
          {manage.polls.map((poll) => (
            <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>
          ))}
        </select>

        <Link
          to={`/create?campaign=${manage.campaign.id}`}
          className="mt-4 block rounded bg-teal-400 px-4 py-3 text-center font-semibold text-slate-950"
        >
          Create a new poll for this Egg
        </Link>

        <Link to="/admin" className="mt-6 block text-center text-sm text-slate-300 underline">Back to dashboard</Link>
      </main>
    );
  }

  if (menu) {
    const { portalTitle, portalMessage, items, branding, aiEnabled, trialSessionId } = menu;
    return (
      <main className="qr-portal" style={{ backgroundColor: branding.accentColor }}>
        <section className="qr-portal-card qr-portal-menu">
          {branding.logoUrl && <img src={branding.logoUrl} alt={`${branding.brandName || "Venue"} logo`} className="qr-portal-logo" />}
          <p className="qr-portal-brand" style={{ color: branding.primaryColor }}>{branding.brandName || "Godwit"}</p>
          <h1>{portalTitle || (items.length === 0 && (aiEnabled || menu.aiPreview) ? t("eggAi.welcome", { defaultValue: "Welcome. How can I help?" }) : "Welcome! Choose an option below.")}</h1>
          {portalMessage && <p>{portalMessage}</p>}
          <div className="qr-portal-menu-list">
            {(aiEnabled || menu.aiPreview) && (
              <EggAiAssistant
                token={token}
                campaignId={menu.campaignId}
                trialSessionId={trialSessionId}
                branding={branding}
                preview={menu.aiPreview}
              />
            )}
            {items.map((item) => {
              if (item.item_type === "poll") {
                return (
                  <div key={item.item_id} id={`egg-option-${item.item_id}`}>
                    <InlinePollVote item={item} branding={branding} />
                  </div>
                );
              }
              if (item.item_type === "donation") {
                return (
                  <div key={item.item_id} id={`egg-option-${item.item_id}`}>
                    <DonationCard item={item} campaignToken={token} />
                  </div>
                );
              }
              if (item.item_type === "reward") {
                return (
                  <div key={item.item_id} id={`egg-option-${item.item_id}`} className="qr-portal-menu-item qr-portal-menu-reward">
                    <span className="qr-portal-menu-item-title">🎁 {item.title}</span>
                    {item.body && <p className="qr-portal-menu-item-body">{item.body}</p>}
                    {item.reward_code && (
                      <p className="qr-portal-menu-item-reward-code">{item.reward_code}</p>
                    )}
                    {item.link_url && (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noreferrer"
                        className="qr-portal-menu-item-cta"
                        style={{ color: branding.primaryColor }}
                      >
                        {item.link_label || "Open link"} →
                      </a>
                    )}
                  </div>
                );
              }
              return (
                <div key={item.item_id} id={`egg-option-${item.item_id}`} className="qr-portal-menu-item qr-portal-menu-info">
                  {item.image_url && (
                    <img src={item.image_url} alt={item.title || ""} className="qr-portal-menu-item-image" />
                  )}
                  <span className="qr-portal-menu-item-title">{item.title}</span>
                  {item.accessibility_tags?.length > 0 && (
                    <span className="qr-portal-menu-item-tags" aria-label={`Accessibility: ${item.accessibility_tags.map((tag) => accessibilityTagLabel(tag)).join(", ")}`}>
                      {item.accessibility_tags.map((tag) => (
                        <span key={tag} className="qr-portal-menu-item-tag" title={accessibilityTagLabel(tag)}>
                          {accessibilityTagIcon(tag)}
                        </span>
                      ))}
                    </span>
                  )}
                  {item.body && <p className="qr-portal-menu-item-body">{item.body}</p>}
                  {item.link_url && (
                    <a
                      href={item.link_url}
                      target="_blank"
                      rel="noreferrer"
                      className="qr-portal-menu-item-cta"
                      style={{ color: branding.primaryColor }}
                    >
                      {item.link_label || "Open link"} →
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    );
  }

  if (errorMessage) return <main className="p-6 text-center" role="alert">{errorMessage}</main>;
  return <main className="p-6 text-center" role="status">Opening feedback...</main>;
}
