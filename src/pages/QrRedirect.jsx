import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getPollBranding } from "../lib/pollBranding";
import { reassignManagedCampaignPoll, resolveManagedQrToken } from "../lib/qrManage";
import DonationCard from "../components/DonationCard";
import InlinePollVote from "../components/InlinePollVote";
import OrganizerMessageCard from "../components/OrganizerMessageCard";
import EggAiAssistant from "../components/EggAiAssistant";
import { accessibilityTagIcon, accessibilityTagLabel } from "../lib/accessibilityTags";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";
import { normalizeEggAccessMethod } from "../lib/eggs";

export default function QrRedirect() {
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
    async function recordEggAccess(campaignId) {
      if (isPreview || !campaignId) return;
      const { error: accessError } = await supabase.rpc("record_egg_access", {
        target_campaign_id: campaignId,
        target_access_method: accessMethod
      });
      if (accessError) console.error("Unable to record Egg access:", accessError);
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

      // A QR code can be linked to several things at once (extra polls, admin-authored
      // info cards). If it has any, show a menu of everything instead of jumping
      // straight to a single poll - this also covers info-only QR codes with no poll.
      const { data: items, error: itemsError } = await supabase
        .rpc("get_public_qr_campaign_items", { target_token: token });

      const visibleItems = DONATION_FEATURE_ENABLED
        ? items
        : (items || []).filter((item) => item.item_type !== "donation");
      const { data: woodpeckerTasks, error: woodpeckerError } = await supabase
        .rpc("get_public_woodpecker_portal", { target_token: token });
      const hasWoodpeckerTasks = !woodpeckerError && Array.isArray(woodpeckerTasks) && woodpeckerTasks.length > 0;
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
      eggAiEnabled = eggAiEnabled && !isPreview;

      if (!itemsError && Array.isArray(visibleItems) && visibleItems.length > 0) {
        await recordEggAccess(visibleItems[0].campaign_id);

        // If this QR code carries just one poll and nothing else (no info card, donation, or
        // reward), skip the intermediate "menu" screen entirely - land directly on the
        // question with answer options ready to tap, instead of an extra "Share feedback"
        // click. Only collapse when there's truly one thing to show; a poll alongside other
        // items still needs the menu so those other items remain visible.
        let singlePollHasMessage = false;
        if (visibleItems.length === 1 && visibleItems[0].item_type === "poll") {
          const { data: singlePoll } = await supabase
            .rpc("get_public_poll", { target_poll_id: visibleItems[0].poll_id })
            .single();
          singlePollHasMessage = singlePoll?.allow_organizer_messages === true;
        }
        if (visibleItems.length === 1 && visibleItems[0].item_type === "poll" && !singlePollHasMessage && !eggAiEnabled) {
          navigate(`/vote/${visibleItems[0].poll_id}?campaign=${visibleItems[0].campaign_id}`, { replace: true });
          return;
        }

        const firstPollItem = visibleItems.find((item) => item.item_type === "poll");
        const branding = getPollBranding(firstPollItem ? {
          brand_name: firstPollItem.poll_brand_name,
          brand_logo_url: firstPollItem.poll_brand_logo_url,
          brand_primary_color: firstPollItem.poll_brand_primary_color,
          brand_accent_color: firstPollItem.poll_brand_accent_color
        } : null);
        setMenu({
          campaignId: visibleItems[0].campaign_id,
          portalTitle: visibleItems[0].portal_title,
          portalMessage: visibleItems[0].portal_message,
          items: visibleItems,
          branding,
          hasWoodpeckerTasks,
          aiEnabled: eggAiEnabled
        });
        return;
      }

      if (hasWoodpeckerTasks) {
        const taskCampaignId = woodpeckerTasks[0]?.campaign_id;
        await recordEggAccess(taskCampaignId);
        navigate(`/qr/${token}/tasks`, { replace: true });
        return;
      }

      const { data: campaign, error: campaignError } = await supabase
        .rpc("get_public_qr_campaign", { target_token: token })
        .maybeSingle();

      if (!campaignError && campaign?.poll_id) {
        await recordEggAccess(campaign.campaign_id);
        const { data: campaignPoll } = await supabase
          .rpc("get_public_poll", { target_poll_id: campaign.poll_id })
          .single();
        if (campaignPoll?.allow_organizer_messages !== true && !eggAiEnabled) {
          navigate(`/vote/${campaign.poll_id}?campaign=${campaign.campaign_id}`, { replace: true });
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
              poll_question: campaignPoll?.question
            }],
            branding,
            hasWoodpeckerTasks,
            aiEnabled: true
          });
          return;
        }
      }

      const stableShortUrl = `${window.location.origin}/qr/${token}`;
      const { data, error } = await supabase
        .rpc("get_public_poll_by_qr", { target_url: stableShortUrl })
        .single();

      if (error || !data) {
        console.error(error);
        setErrorMessage("This QR code does not have an active poll.");
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
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">You are managing this QR code</p>
        <h1 className="mt-1 text-2xl font-bold">{manage.campaign.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {manage.campaign.placement_label || "Unlabeled placement"}{manage.campaign.variant_label ? ` · ${manage.campaign.variant_label}` : ""}
        </p>

        <div className="mt-6 rounded border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Currently showing</p>
          <p className="mt-1 font-semibold">{manage.currentPoll?.question || "No poll assigned yet"}</p>
        </div>

        <label className="mt-6 block text-sm font-semibold">Change the poll for this QR code</label>
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
          Create a new poll for this QR code
        </Link>

        <Link to="/admin" className="mt-6 block text-center text-sm text-slate-300 underline">Back to dashboard</Link>
      </main>
    );
  }

  if (menu) {
    const { portalTitle, portalMessage, items, branding, hasWoodpeckerTasks, aiEnabled } = menu;
    return (
      <main className="qr-portal" style={{ backgroundColor: branding.accentColor }}>
        <section className="qr-portal-card qr-portal-menu">
          {branding.logoUrl && <img src={branding.logoUrl} alt={`${branding.brandName || "Venue"} logo`} className="qr-portal-logo" />}
          <p className="qr-portal-brand" style={{ color: branding.primaryColor }}>{branding.brandName || "Godwit"}</p>
          <h1>{portalTitle || "Welcome! Choose an option below."}</h1>
          {portalMessage && <p>{portalMessage}</p>}
          <div className="qr-portal-menu-list">
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
            {hasWoodpeckerTasks && (
              <Link
                to={`/qr/${token}/tasks`}
                className="qr-portal-menu-item qr-portal-menu-info"
              >
                <span className="qr-portal-menu-item-title">Woodpecker tasks</span>
                <p className="qr-portal-menu-item-body">See open tasks, share an update, or mark a task complete.</p>
                <span
                  className="qr-portal-menu-item-cta"
                  style={{ backgroundColor: branding.primaryColor }}
                >
                  Open tasks
                </span>
              </Link>
            )}
            {(() => {
              const messagePoll = items.find((item) => item.item_type === "poll");
              return messagePoll ? (
                <OrganizerMessageCard
                  key="organizer-message"
                  pollId={messagePoll.poll_id}
                  campaignId={messagePoll.campaign_id}
                  branding={branding}
                />
              ) : null;
            })()}
            {aiEnabled && <EggAiAssistant token={token} />}
          </div>
        </section>
      </main>
    );
  }

  if (errorMessage) return <main className="p-6 text-center" role="alert">{errorMessage}</main>;
  return <main className="p-6 text-center" role="status">Opening feedback...</main>;
}
