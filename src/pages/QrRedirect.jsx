import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getPollBranding } from "../lib/pollBranding";
import { reassignManagedCampaignPoll, resolveManagedQrToken } from "../lib/qrManage";
import EggGuide from "../components/EggGuide";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";
import { normalizeEggAccessMethod } from "../lib/eggs";
import { getEggTrialSessionId } from "../lib/eggTrial";
import { useTranslation } from "react-i18next";
import VisitorPreviewBar from "../components/VisitorPreviewBar";
import { recordEggPromotionLinkClick } from "../lib/goalProgress";

export default function QrRedirect() {
  return <>
    <VisitorPreviewBar />
    <QrRedirectContent />
  </>;
}

function QrRedirectContent() {
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
  const [guideGoalKeys, setGuideGoalKeys] = useState([]);
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
        try {
          const managed = await resolveManagedQrToken(token);
          if (managed) {
            setManage(managed);
            return;
          }
        } catch (error) {
          console.error("Unable to recognize managed Egg", error);
          setErrorMessage(t("admin.engagement.scanner.lookupError", { defaultValue: "Could not recognize this Egg. Please try again." }));
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
        const aiConfig = await aiConfigResponse.json();
        eggAiEnabled = aiConfig.enabled === true;
        if (Array.isArray(aiConfig.goalKeys)) setGuideGoalKeys(aiConfig.goalKeys);
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
        if (sessionItems.length === 1 && sessionItems[0].item_type === "poll" && !eggAiEnabled && !isPreview) {
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
        if (campaignPoll?.allow_organizer_messages !== true && !eggAiEnabled && !isPreview) {
          navigate(`/vote/${campaign.poll_id}?campaign=${campaign.campaign_id}&trialSessionId=${trialSessionId}`, { replace: true });
          return;
        }
        if (eggAiEnabled || isPreview) {
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
            aiEnabled: eggAiEnabled && !isPreview,
            aiPreview: eggAiEnabled && isPreview
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

      if (campaign && !campaign.poll_id) {
        setMenu({
          campaignId: campaign.campaign_id,
          portalTitle: campaign.portal_title,
          portalMessage: campaign.portal_message,
          items: [],
          branding: getPollBranding(null),
          trialSessionId,
          aiEnabled: false,
          aiPreview: false
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

      if (isPreview) {
        setMenu({ items: [{ item_id: `legacy-${data.id}`, item_type: "poll", poll_id: data.id, poll_question: data.question, trial_session_id: trialSessionId }],
          branding: getPollBranding(data), trialSessionId, aiEnabled: false, aiPreview: false });
      } else navigate(`/vote/${data.id}`, { replace: true });
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
    const { trialSessionId } = menu;
    const trackPromotionClick = (itemId) => {
      if (isPreview || !menu.campaignId || !trialSessionId) return;
      void recordEggPromotionLinkClick(menu.campaignId, itemId, trialSessionId)
        .catch((failure) => console.error("Unable to record promotion link click:", failure));
    };
    return <EggGuide token={token} menu={menu} goalKeys={guideGoalKeys} preview={isPreview} onLinkClick={trackPromotionClick} />;
  }

  if (errorMessage) return <main className="p-6 text-center" role="alert">{errorMessage}</main>;
  return <main className="p-6 text-center" role="status">Opening feedback...</main>;
}