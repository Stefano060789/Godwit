import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { appendAuditLog, readPollMeta, savePollMeta, isPollClosed } from "../lib/pollMeta";
import { createQrCampaign, loadQrCampaigns } from "../lib/qrCampaigns";
import { buildEggUrl } from "../lib/eggs";
import DashboardHub from "../components/DashboardHub";
import InteractionUsageNotice from "../components/InteractionUsageNotice";
import EggGoal from "../components/EggGoal";
import EggResults from "../components/EggResults";
import BusinessProfile from "../components/BusinessProfile";
import BusinessData from "../components/BusinessData";
import GoalProgress from "../components/GoalProgress";
import EggNfcSetup from "../components/EggNfcSetup";
import { createGoalEggSetup } from "../lib/goalEggSetup";
import { getEggAccessAnalyticsErrorMessage } from "../lib/eggAccessAnalytics";
import { isRestrictedTopic } from "../lib/restrictedContent";
import { normalizeEggEmailBenefit } from "../lib/eggBenefits";
import "../components/EggDashboard.css";
import {
  loadQrCampaignItems,
  addQrCampaignPollItem,
  addQrCampaignInfoItem,
  addQrCampaignDonationItem,
  addQrCampaignRewardItem,
  swapQrCampaignItemPositions
} from "../lib/qrCampaignItems";
import { extractQrToken, reassignManagedCampaignPoll, resolveManagedQrToken } from "../lib/qrManage";
import QrScanner from "../components/QrScanner";
import LockedFeature from "../components/LockedFeature";
import { loadLeadNurtureSettings, saveLeadNurtureSettings } from "../lib/leadNurture";
import { loadWinbackSettings, saveWinbackSettings } from "../lib/winbackSettings";
import { loadDonationSettings, saveDonationSettings, startStripeConnectOnboarding, refreshStripeConnectStatus } from "../lib/donationSettings";
import { getEntitlements, planLabel, minPlanLabelFor } from "../lib/entitlements";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";
import { PERSONAS, findPersona } from "../lib/personas";
import { getAdminTab, getCampaignGoalKeys, getStartSelection, START_GOALS } from "../lib/startGuide";
import Woodpecker from "./Woodpecker";
import {
  getCurrentUserRole,
  getPermissionSet,
  loadWorkspaceProfile,
  readWorkspaceProfile,
  saveWorkspaceProfile
} from "../lib/workspaceProfile";

export default function Admin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeTab = getAdminTab(location.search);
  const startSelection = getStartSelection(location.search);

  function setActiveTab(tab) {
    const params = new URLSearchParams(location.search);
    params.set("tab", tab);
    params.delete("poll");
    navigate(`/admin?${params}`);
  }

  // Scroll a poll into view when arriving via a "jump to this poll" link from the QR codes
  // tab. Must run unconditionally on every render (before any early return below) - hooks
  // can't be skipped on some renders and not others.
  useEffect(() => {
    const selectedId = new URLSearchParams(location.search).get("poll");
    if (activeTab !== "polls" || !selectedId) return;
    const card = document.getElementById(`poll-card-${selectedId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTab, location.search, loading]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [qrPrintFormat, setQrPrintFormat] = useState("a4");
  const [analytics, setAnalytics] = useState({ total: 0, active: 0, closed: 0, scheduled: 0, withLocation: 0 });
  const [locationStats, setLocationStats] = useState([]);
  const [templateBenchmark, setTemplateBenchmark] = useState(null);
  const [workspaceProfile, setWorkspaceProfile] = useState({
    companyName: "Godwit",
    logoUrl: "",
    primaryColor: "#0f766e",
    accentColor: "#172b2b",
    webhookUrl: "",
    reviewPlatforms: [],
    businessType: "",
    businessDescription: "",
    role: "owner",
    plan: "free",
    trial: null
  });
  const [workspaceUserId, setWorkspaceUserId] = useState(null);
  const [interactionUsage, setInteractionUsage] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("viewer");
  const [qrCampaigns, setQrCampaigns] = useState([]);
  const [eggAccessCounts, setEggAccessCounts] = useState({});
  const [eggAccessTrackingError, setEggAccessTrackingError] = useState("");
  const [editingEggId, setEditingEggId] = useState(null);
  const [eggEditName, setEggEditName] = useState("");
  const [eggEditPlacement, setEggEditPlacement] = useState("");
  const [eggEditGoals, setEggEditGoals] = useState([]);
  const [qrCampaignItems, setQrCampaignItems] = useState([]);
  const [actionTasks, setActionTasks] = useState([]);
  const [actionTasksError, setActionTasksError] = useState("");
  const [itemPollId, setItemPollId] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [itemLinkUrl, setItemLinkUrl] = useState("");
  const [itemLinkLabel, setItemLinkLabel] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState("");
  const [itemAccessibilityTags, setItemAccessibilityTags] = useState([]);
  const [itemRewardTitle, setItemRewardTitle] = useState("");
  const [itemRewardBody, setItemRewardBody] = useState("");
  const [itemRewardCode, setItemRewardCode] = useState("");
  const [itemRewardLinkUrl, setItemRewardLinkUrl] = useState("");
  const [itemRewardLinkLabel, setItemRewardLinkLabel] = useState("");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignPlacement, setNewCampaignPlacement] = useState("");
  const [qrWizardOpen, setQrWizardOpen] = useState(false);
  const [qrWizardStep, setQrWizardStep] = useState(1);
  const [qrWizardCampaign, setQrWizardCampaign] = useState(null);
  const [eggAccessChoice, setEggAccessChoice] = useState("both");
  const [qrWizardActionId, setQrWizardActionId] = useState("");
  const [qrWizardTaskTitle, setQrWizardTaskTitle] = useState("");
  const [qrWizardTaskDescription, setQrWizardTaskDescription] = useState("");
  const [qrWizardTaskIds, setQrWizardTaskIds] = useState([]);
  const [qrModifier, setQrModifier] = useState(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [alertRules, setAlertRules] = useState([]);
  const [feedbackAlerts, setFeedbackAlerts] = useState([]);
  const [recoveryTasks, setRecoveryTasks] = useState([]);
  const [reportSettings, setReportSettings] = useState({ recipient_email: "", is_enabled: false });
  const [nurtureSettings, setNurtureSettings] = useState({ is_enabled: false, subject: "", message: "" });
  const [winbackSettings, setWinbackSettings] = useState({ is_enabled: false, days_since_last_visit: 30, subject: "", message: "" });
  const [donationSettings, setDonationSettings] = useState({
    is_enabled: false,
    category: "contribution",
    currency: "EUR",
    suggested_amount: "",
    message: "",
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    stripe_charges_enabled: false,
    stripe_payouts_enabled: false
  });
  const [stripeConnectBusy, setStripeConnectBusy] = useState(false);
  const [stripeConnectError, setStripeConnectError] = useState("");
  const [donationStats, setDonationStats] = useState({ totalRaised: 0, count: 0 });
  const [sentimentSummary, setSentimentSummary] = useState({});
  const [newRulePollId, setNewRulePollId] = useState("");
  const [newRuleType, setNewRuleType] = useState("low_score");
  const [newRuleThreshold, setNewRuleThreshold] = useState("3");
  const [newRuleAnswer, setNewRuleAnswer] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAlertId, setNewTaskAlertId] = useState("");
  const [organizerMessages, setOrganizerMessages] = useState([]);
  const [contentReports, setContentReports] = useState([]);
  const [moderationMessage, setModerationMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLookupValue, setScanLookupValue] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [scanMessage, setScanMessage] = useState("");
  const [personaKey, setPersonaKey] = useState(null);
  const [weeklyInsight, setWeeklyInsight] = useState(null);
  const [voteTrend, setVoteTrend] = useState(null);
  const [workspaceUpdates, setWorkspaceUpdates] = useState([]);
  const [newUpdateMessage, setNewUpdateMessage] = useState("");
  const [newUpdatePollId, setNewUpdatePollId] = useState("");
  const [selectedQrReviewPlatforms, setSelectedQrReviewPlatforms] = useState([]);

  useEffect(() => {
    const { business } = getStartSelection(location.search);
    if (!workspaceUserId || !business) return;
    setPersonaKey(business.key);
    localStorage.setItem(`ivote_persona_${workspaceUserId}`, business.key);
  }, [workspaceUserId, location.search]);

  function getPollStatusInfo(poll) {
    const meta = readPollMeta(poll.id);
    const startsAt = poll.starts_at ?? meta.starts_at;
    const endsAt = poll.expires_at ?? meta.ends_at;

    if (poll.status === "closed" || meta.status === "closed" || poll.closed_at || meta.closed_at) {
      return "closed";
    }

    if (startsAt && new Date(startsAt) > new Date()) {
      return "scheduled";
    }

    if (endsAt && new Date(endsAt) < new Date()) {
      return "expired";
    }

    return "active";
  }

  async function loadPolls() {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(userError);
      setLoading(false);
      navigate("/login", { replace: true, state: { returnTo: `/admin${location.search}` } });
      return;
    }

    if (!user) {
      navigate("/login", { replace: true, state: { returnTo: `/admin${location.search}` } });
      return;
    }

    const { data, error } = await supabase
      .from("polls")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const normalizedPolls = (data ?? []).filter((poll) => Boolean(poll?.id));
    setPolls(normalizedPolls);

    const nextAnalytics = { total: normalizedPolls.length, active: 0, closed: 0, scheduled: 0, withLocation: 0 };
    normalizedPolls.forEach((poll) => {
      const meta = readPollMeta(poll.id);
      const status = getPollStatusInfo(poll);
      const locationName = poll.location_name ?? meta.location_name;

      if (status === "active") nextAnalytics.active += 1;
      if (status === "closed") nextAnalytics.closed += 1;
      if (status === "scheduled") nextAnalytics.scheduled += 1;
      if (locationName) nextAnalytics.withLocation += 1;
    });
    setAnalytics(nextAnalytics);
    setLoading(false);
  }

  useEffect(() => {
    async function loadWorkspaceProfileState() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const profile = await loadWorkspaceProfile();
        setWorkspaceUserId(profile.id);
        setCurrentUserRole(profile.role);
        setWorkspaceProfile(profile);
        const savedPersona = findPersona(localStorage.getItem(`ivote_persona_${profile.id}`));
        setPersonaKey(savedPersona?.key || null);
        setQrCampaigns(await loadQrCampaigns());
        setQrCampaignItems(await loadQrCampaignItems());
        const [rulesResult, alertsResult, tasksResult, reportsResult, messagesResult, contentReportsResult, actionTasksResult, eggAccessResult] = await Promise.all([
          supabase.from("feedback_alert_rules").select("*").order("created_at", { ascending: false }),
          supabase.from("feedback_alerts").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("feedback_recovery_tasks").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("weekly_report_settings").select("recipient_email, is_enabled").eq("workspace_id", profile.id).maybeSingle(),
          supabase.from("organizer_messages").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("content_reports").select("*").order("created_at", { ascending: false }),
          supabase.from("woodpecker_tasks").select("*, qr_campaigns!woodpecker_tasks_campaign_id_fkey(name), woodpecker_task_campaigns(campaign_id)").eq("workspace_id", profile.id).order("created_at", { ascending: false }),
          supabase.rpc("get_workspace_egg_access_metrics")
        ]);
        if (!rulesResult.error) setAlertRules(rulesResult.data || []);
        if (!alertsResult.error) setFeedbackAlerts(alertsResult.data || []);
        if (!tasksResult.error) setRecoveryTasks(tasksResult.data || []);
        if (!reportsResult.error && reportsResult.data) setReportSettings(reportsResult.data);
        if (!messagesResult.error) setOrganizerMessages(messagesResult.data || []);
        if (!contentReportsResult.error) setContentReports(contentReportsResult.data || []);
        if (actionTasksResult.error) {
          console.error("Unable to load Egg actions", actionTasksResult.error);
          setActionTasksError(actionTasksResult.error.message);
        } else {
          setActionTasks(actionTasksResult.data || []);
          setActionTasksError("");
        }
        if (eggAccessResult.error) {
          console.error("Egg access analytics are unavailable.", eggAccessResult.error);
          setEggAccessTrackingError(getEggAccessAnalyticsErrorMessage(
            eggAccessResult.error,
            (key) => t(key)
          ));
        } else {
          setEggAccessTrackingError("");
          setEggAccessCounts(Object.fromEntries((eggAccessResult.data || []).map((row) => [
            String(row.campaign_id),
            { qr: Number(row.qr_access_count || 0), nfc: Number(row.nfc_access_count || 0) }
          ])));
        }

        setNurtureSettings(await loadLeadNurtureSettings(profile.id));
        setWinbackSettings(await loadWinbackSettings(profile.id));
        setDonationSettings(await loadDonationSettings(profile.id));
        const { data: donationRows } = await supabase.from("donations").select("amount_total").eq("status", "succeeded");
        setDonationStats({
          totalRaised: (donationRows || []).reduce((sum, row) => sum + Number(row.amount_total || 0), 0),
          count: (donationRows || []).length
        });
        const { data: sentimentRows } = await supabase.from("user_answers").select("poll_id, sentiment").not("sentiment", "is", null);
        const summary = {};
        (sentimentRows || []).forEach((row) => {
          summary[row.poll_id] = summary[row.poll_id] || { positive: 0, neutral: 0, negative: 0 };
          summary[row.poll_id][row.sentiment] += 1;
        });
        setSentimentSummary(summary);

        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
        const { count: priorWeekCount } = await supabase.from("votes").select("id", { count: "exact", head: true }).gte("created_at", fourteenDaysAgo).lt("created_at", sevenDaysAgo);

        const { data: recentVotes } = await supabase.from("votes").select("answer, poll_id").gte("created_at", sevenDaysAgo);
        if (recentVotes && recentVotes.length > 0) {
          const tally = {};
          recentVotes.forEach((vote) => {
            const key = vote.answer;
            tally[key] = (tally[key] || 0) + 1;
          });
          const [topAnswer, topCount] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
          setWeeklyInsight({ answer: topAnswer, count: topCount, totalVotes: recentVotes.length });
        } else {
          setWeeklyInsight(null);
        }
        setVoteTrend({ thisWeek: recentVotes?.length || 0, lastWeek: priorWeekCount || 0 });


        const { data: updatesRows } = await supabase.from("workspace_updates").select("*").order("created_at", { ascending: false }).limit(20);
        setWorkspaceUpdates(updatesRows || []);

      } catch (error) {
        console.error(error);
        alert(error.message || "Unable to load workspace role data.");
      }
    }

    loadPolls();
    loadWorkspaceProfileState();

    const interval = setInterval(() => {
      loadPolls();
    }, 5000);

    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    if (!workspaceUserId) return;
    let cancelled = false;
    async function refreshUsage() {
      const { data, error } = await supabase.rpc("workspace_interaction_status", { target_workspace_id: workspaceUserId });
      if (cancelled) return;
      if (error) {
        console.error("Unable to load interaction usage", error);
        setInteractionUsage({ state: "unavailable" });
        return;
      }
      setInteractionUsage(data);
    }
    refreshUsage();
    const timer = setInterval(refreshUsage, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [workspaceUserId]);

  useEffect(() => {
    if (!workspaceUserId || !["engagement", "results"].includes(activeTab)) return;
    let cancelled = false;
    supabase.from("woodpecker_tasks")
      .select("*, qr_campaigns!woodpecker_tasks_campaign_id_fkey(name), woodpecker_task_campaigns(campaign_id)")
      .eq("workspace_id", workspaceUserId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Unable to load Egg actions", error);
          setActionTasksError(error.message);
        } else {
          setActionTasks(data || []);
          setActionTasksError("");
        }
      });
    return () => { cancelled = true; };
  }, [workspaceUserId, activeTab]);

  useEffect(() => {
    const eggId = new URLSearchParams(location.search).get("egg");
    if (activeTab !== "engagement" || !eggId || !qrCampaigns.length) return;
    document.getElementById(`egg-card-${eggId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, location.search, qrCampaigns, loading]);

  // Returning from Stripe's hosted Connect onboarding lands back here with ?donations=
  // connected|refresh (see the return_url/refresh_url built in api/create-checkout-session.js).
  // Do a live status check rather than waiting on the account.updated webhook, which is
  // usually near-instant but not guaranteed to have arrived before the redirect completes.
  useEffect(() => {
    if (!DONATION_FEATURE_ENABLED || !workspaceUserId) return;
    const donationsParam = new URLSearchParams(location.search).get("donations");
    if (donationsParam !== "connected" && donationsParam !== "refresh") return;
    refreshStripeConnectStatus()
      .then((result) => {
        setDonationSettings((current) => ({
          ...current,
          stripe_charges_enabled: Boolean(result.chargesEnabled),
          stripe_payouts_enabled: Boolean(result.payoutsEnabled),
          stripe_onboarding_complete: Boolean(result.detailsSubmitted)
        }));
      })
      .catch((error) => console.error("Stripe status refresh failed", error));
  }, [workspaceUserId, location.search]);

  // Lightweight usage instrumentation (see docs/TODO.md "Product" section): log which tabs get
  // opened at all, so future work can be prioritized by real usage instead of guesswork. Fire
  // once per activeTab change; silently do nothing until the workspace has resolved.
  useEffect(() => {
    if (!workspaceUserId || !activeTab) return;
    supabase.rpc("log_workspace_admin_event", { p_event_type: "tab_open", p_tab: activeTab })
      .then(({ error }) => { if (error) console.error("Failed to log admin tab-open event", error); });
  }, [workspaceUserId, activeTab]);

  useEffect(() => {
    async function loadLocationStats() {
      if (polls.length === 0) {
        setLocationStats([]);
        return;
      }
      const { data: voteRows } = await supabase.from("votes").select("poll_id, answer");
      if (!voteRows) return;
      const countsByPoll = {};
      voteRows.forEach((vote) => {
        countsByPoll[vote.poll_id] = (countsByPoll[vote.poll_id] || 0) + 1;
      });
      const byLocation = {};
      polls.forEach((poll) => {
        const location = poll.location_name ?? readPollMeta(poll.id).location_name;
        if (!location) return;
        byLocation[location] = byLocation[location] || { votes: 0, polls: 0 };
        byLocation[location].votes += countsByPoll[poll.id] || 0;
        byLocation[location].polls += 1;
      });
      setLocationStats(Object.entries(byLocation).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.votes - a.votes));

      const templateCounts = {};
      polls.forEach((poll) => {
        const key = poll.template_key ?? readPollMeta(poll.id).template_key;
        if (!key || key === "blank") return;
        templateCounts[key] = (templateCounts[key] || 0) + (countsByPoll[poll.id] || 0);
      });
      const topTemplateKey = Object.entries(templateCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!topTemplateKey || !workspaceUserId) {
        setTemplateBenchmark(null);
        return;
      }

      const templatePolls = polls.filter((poll) => (poll.template_key ?? readPollMeta(poll.id).template_key) === topTemplateKey);
      let scoredVotes = 0;
      let scoreSum = 0;
      templatePolls.forEach((poll) => {
        const answers = Array.isArray(poll.answers) ? poll.answers : [];
        if (answers.length <= 1) return;
        voteRows.filter((vote) => vote.poll_id === poll.id).forEach((vote) => {
          const index = answers.indexOf(vote.answer);
          if (index < 0) return;
          scoreSum += (1 - index / (answers.length - 1)) * 100;
          scoredVotes += 1;
        });
      });
      if (scoredVotes === 0) {
        setTemplateBenchmark(null);
        return;
      }

      const { data: benchmarkRows } = await supabase.rpc("get_template_benchmark", { target_template_key: topTemplateKey, excluded_workspace_id: workspaceUserId }).maybeSingle();
      setTemplateBenchmark({
        templateKey: topTemplateKey,
        ownScore: Math.round(scoreSum / scoredVotes),
        industryScore: benchmarkRows?.average_score ? Math.round(benchmarkRows.average_score) : null,
        sampleSize: benchmarkRows?.sample_size || 0
      });
    }
    loadLocationStats();
  }, [polls, workspaceUserId]);

  async function saveWorkspaceSettings() {
    if (!workspaceUserId) return;
    try {
      const nextProfile = await saveWorkspaceProfile(workspaceUserId, workspaceProfile);
      setWorkspaceProfile((current) => ({ ...current, ...nextProfile }));
      alert("Workspace settings saved.");
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to save workspace settings.");
    }

  }

  function toggleQrReviewPlatform(url) {
    setSelectedQrReviewPlatforms((current) => (
      current.includes(url) ? current.filter((item) => item !== url) : [...current, url]
    ));
  }

  // Guided QR creation wizard - replaces the old flat "name + poll + placement + variant, all
  // at once" form. Walks through the same underlying steps (create -> info -> polls ->
  // reviews -> donation -> print) one at a time, reusing the exact same handlers as the
  // "edit an existing QR code's items" accordion below, so there's only one code path per
  // action, not two.
  function openQrWizard() {
    setQrWizardCampaign(null);
    setEggAccessChoice("both");
    setQrWizardStep(1);
    setSelectedQrReviewPlatforms([]);
    setQrWizardActionId("");
    setQrWizardTaskTitle("");
    setQrWizardTaskDescription("");
    setQrWizardTaskIds([]);
    setQrWizardOpen(true);
  }

  function closeQrWizard() {
    setQrWizardOpen(false);
    setQrWizardCampaign(null);
    setEggAccessChoice("both");
    setQrWizardStep(1);
    setQrWizardActionId("");
    setQrWizardTaskTitle("");
    setQrWizardTaskDescription("");
    setQrWizardTaskIds([]);
  }

  async function handleCreateCampaignFromWizard() {
    if (!newCampaignName.trim()) {
      alert(t("admin.engagement.campaigns.nameRequired"));
      return;
    }
    try {
      const campaign = await createQrCampaign({
        name: newCampaignName,
        pollId: null,
        placementLabel: newCampaignPlacement
      });
      setQrCampaigns((current) => [campaign, ...current]);
      setQrWizardCampaign(campaign);
      if (itemTitle.trim()) {
        const infoItem = await addQrCampaignInfoItem(campaign.id, {
          title: itemTitle,
          body: itemBody,
          linkUrl: itemLinkUrl,
          linkLabel: itemLinkLabel,
          imageUrl: itemImageUrl,
          accessibilityTags: itemAccessibilityTags
        });
        setQrCampaignItems((current) => [...current, infoItem]);
      }
      setNewCampaignName("");
      setNewCampaignPlacement("");
      setItemTitle("");
      setItemBody("");
      setItemLinkUrl("");
      setItemLinkLabel("");
      setItemImageUrl("");
      setItemAccessibilityTags([]);
      setQrWizardStep(2);
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to create Egg. Run the ROI migration first.");
    }
  }

  async function handleAddPollItemFromWizard() {
    if (!qrWizardCampaign) return;
    await handleAddPollItem(qrWizardCampaign.id);
  }

  async function handleContinueFromPollStep() {
    if (qrWizardCampaign && itemPollId) {
      await handleAddPollItem(qrWizardCampaign.id);
    }
    setQrWizardStep(3);
  }

  async function handleAddTaskFromWizard() {
    if (!qrWizardCampaign || (!qrWizardActionId && !qrWizardTaskTitle.trim())) {
      alert("Choose an existing Task or enter a new Task title.");
      return false;
    }
    if (qrWizardCampaign && qrWizardActionId) {
      try {
        const { error } = await supabase
          .from("woodpecker_task_campaigns")
          .upsert({
            task_id: Number(qrWizardActionId),
            campaign_id: qrWizardCampaign.id
          }, { onConflict: "task_id,campaign_id" });
        if (error) throw error;
        setActionTasks((current) => current.map((item) => item.id === Number(qrWizardActionId)
          ? {
              ...item,
              woodpecker_task_campaigns: [
                ...(item.woodpecker_task_campaigns || []).filter((link) => Number(link.campaign_id) !== Number(qrWizardCampaign.id)),
                { campaign_id: qrWizardCampaign.id, qr_campaigns: { name: qrWizardCampaign.name, token: qrWizardCampaign.token } }
              ]
            }
          : item));
        setQrWizardTaskIds((current) => current.includes(Number(qrWizardActionId)) ? current : [...current, Number(qrWizardActionId)]);
        setQrWizardActionId("");
        setQrWizardTaskTitle("");
        setQrWizardTaskDescription("");
      } catch (error) {
        alert(error.message || "Unable to attach the Action.");
        return false;
      }
    } else if (qrWizardCampaign && qrWizardTaskTitle.trim()) {
      try {
        const { data: task, error } = await supabase
          .from("woodpecker_tasks")
          .insert({
            workspace_id: workspaceUserId,
            campaign_id: qrWizardCampaign.id,
            title: qrWizardTaskTitle.trim(),
            description: qrWizardTaskDescription.trim() || null
          })
          .select()
          .single();
        if (error) throw error;
        if (!task) throw new Error("The task was not created.");
        setActionTasks((current) => [task, ...current]);
        setQrWizardTaskIds((current) => [...current, Number(task.id)]);
        setQrWizardActionId("");
        setQrWizardTaskTitle("");
        setQrWizardTaskDescription("");
      } catch (error) {
        alert(error.message || "Unable to create the Action.");
        return false;
      }
    }
    return true;
  }

  async function handleContinueFromTaskStep() {
    if (qrWizardActionId || qrWizardTaskTitle.trim()) {
      const added = await handleAddTaskFromWizard();
      if (!added) return;
    }
    setQrWizardStep(4);
  }

  async function handleContinueFromReviewStep() {
    if (!qrWizardCampaign) return;
    const selected = (workspaceProfile.reviewPlatforms || [])
      .filter((platform) => selectedQrReviewPlatforms.includes(platform.url));
    try {
      const reviewItems = [];
      for (const platform of selected) {
        reviewItems.push(await addQrCampaignInfoItem(qrWizardCampaign.id, {
          title: `${platform.name} reviews`,
          body: `Share your experience on ${platform.name}.`,
          linkUrl: platform.url,
          linkLabel: `Open ${platform.name}`
        }));
      }
      if (reviewItems.length > 0) setQrCampaignItems((current) => [...current, ...reviewItems]);
      setSelectedQrReviewPlatforms([]);
      setQrWizardStep(DONATION_FEATURE_ENABLED ? 5 : 6);
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleAddRewardItemFromWizard() {
    if (!qrWizardCampaign) return;
    await handleAddRewardItem(qrWizardCampaign.id);
  }

  // Same idea again: a typed-but-not-added reward/prize shouldn't be silently dropped when
  // finishing the wizard.
  async function handleContinueFromRewardStep() {
    if (qrWizardCampaign && itemRewardTitle.trim()) {
      await handleAddRewardItem(qrWizardCampaign.id);
    }
    setQrWizardStep(6);
  }

  async function handleAddDonationItemFromWizard() {
    if (!qrWizardCampaign) return;
    await handleAddDonationItem(qrWizardCampaign.id);
  }

  async function handleDeleteQrCampaign(campaignId, campaignName) {
    if (!window.confirm(t("admin.engagement.campaigns.confirmDelete", { name: campaignName }))) return;
    const { error } = await supabase.from("qr_campaigns").delete().eq("id", campaignId);
    if (error) {
      alert(error.message);
      return;
    }
    setQrCampaigns((current) => current.filter((item) => item.id !== campaignId));
  }

  function beginEditEgg(campaign) {
    setEditingEggId(campaign.id);
    setEggEditName(campaign.name || "");
    setEggEditPlacement(campaign.placement_label || "");
    setEggEditGoals(getCampaignGoalKeys(campaign));
  }

  async function saveEggDetails(campaignId) {
    const name = eggEditName.trim();
    if (!name) {
      alert(t("admin.engagement.campaigns.nameRequired"));
      return;
    }
    const lockedGoal = eggEditGoals
      .map((key) => START_GOALS.find((entry) => entry.key === key))
      .find((goal) => goal?.feature && !entitlements[goal.feature]);
    if (lockedGoal) {
      alert(t("admin.overview.availableOn", { plan: minPlanLabelFor(lockedGoal.feature) }));
      return;
    }

    const { data, error } = await supabase
      .from("qr_campaigns")
      .update({
        name,
        placement_label: eggEditPlacement.trim() || null,
        goal_keys: eggEditGoals.length ? eggEditGoals : null,
        goal_key: eggEditGoals[0] || null
      })
      .eq("id", campaignId)
      .select("id, name, placement_label, goal_key, goal_keys")
      .single();

    if (error) {
      console.error(error);
      alert(error.message || t("admin.engagement.campaigns.saveFailed"));
      return;
    }

    setQrCampaigns((current) => current.map((campaign) => campaign.id === campaignId
      ? { ...campaign, ...data }
      : campaign));
    setEditingEggId(null);
  }

  // --- QR code items: let one QR code show a menu of several polls and/or info cards at once ---

  function itemsForCampaign(campaignId) {
    return qrCampaignItems
      .filter((item) => item.campaign_id === campaignId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  async function reassignQrCampaignPoll(campaignId, nextPollId) {
    if (!nextPollId) return;
    const { error } = await supabase.from("qr_campaigns").update({ poll_id: Number(nextPollId) }).eq("id", campaignId);
    if (error) {
      alert(error.message);
      return;
    }
    setQrCampaigns((current) => current.map((item) => item.id === campaignId ? { ...item, poll_id: Number(nextPollId) } : item));
  }

  async function handleAddPollItem(campaignId) {
    if (!itemPollId) {
      alert("Choose a poll to add.");
      return;
    }
    try {
      const item = await addQrCampaignPollItem(campaignId, itemPollId);
      setQrCampaignItems((current) => [...current, item]);
      setItemPollId("");
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleAddRewardItem(campaignId) {
    if (!itemRewardTitle.trim()) {
      alert("Give the reward or prize a title.");
      return;
    }
    try {
      const item = await addQrCampaignRewardItem(campaignId, { title: itemRewardTitle, body: itemRewardBody, linkUrl: itemRewardLinkUrl, linkLabel: itemRewardLinkLabel, rewardCode: itemRewardCode });
      setQrCampaignItems((current) => [...current, item]);
      setItemRewardTitle("");
      setItemRewardBody("");
      setItemRewardCode("");
      setItemRewardLinkUrl("");
      setItemRewardLinkLabel("");
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleAddDonationItem(campaignId) {
    if (!DONATION_FEATURE_ENABLED) {
      alert(t("admin.engagement.donations.notEnabled"));
      return;
    }
    if (!donationSettings.is_enabled) {
      alert("Set up and enable donation settings first, in Settings.");
      return;
    }
    try {
      const item = await addQrCampaignDonationItem(campaignId);
      setQrCampaignItems((current) => [...current, item]);
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleMoveItemWithinType(campaignId, itemId, itemType, direction) {
    const items = itemsForCampaign(campaignId).filter((item) => item.item_type === itemType);
    const index = items.findIndex((item) => item.id === itemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return;
    const current = items[index];
    const swapWith = items[swapIndex];
    try {
      await swapQrCampaignItemPositions(current, swapWith);
      setQrCampaignItems((previous) => previous.map((item) => {
        if (item.id === current.id) return { ...item, sort_order: swapWith.sort_order };
        if (item.id === swapWith.id) return { ...item, sort_order: current.sort_order };
        return item;
      }));
    } catch (error) {
      alert(error.message);
    }
  }

  // Lets a poll card offer "add this poll to a QR code" directly, without going to the QR
  // codes tab first. Same underlying operation as the QR tab's "Add a poll..." form.
  async function assignPollToQrCode(pollId, campaignId) {
    try {
      const item = await addQrCampaignPollItem(campaignId, pollId);
      setQrCampaignItems((current) => [...current, item]);
    } catch (error) {
      alert(error.message);
    }

  }

  async function lookUpScannedQr(rawValue) {
    const token = extractQrToken(rawValue);
    if (!token) {
      setScanResult(null);
      setScanMessage("Could not read a QR link from that value.");
      return;
    }

    const managed = await resolveManagedQrToken(token);
    if (!managed) {
      setScanResult(null);
      setScanMessage("This Egg isn't linked to a poll in your workspace.");
      return;
    }

    setScanResult(managed);
    setScanMessage("");
  }

  async function handleScanDecode(rawValue) {
    setScannerOpen(false);
    await lookUpScannedQr(rawValue);
  }

  async function handleRedeemCode() {
    const code = redeemCode.trim();
    if (!code) {
      setRedeemMessage("Enter the reward code first.");
      return;
    }
    const { data, error } = await supabase.rpc("redeem_reward_code", { target_code: code }).maybeSingle();
    if (error) {
      setRedeemMessage(error.message);
      return;
    }
    setRedeemMessage(`Redeemed for "${data.question}". Total redemptions: ${data.reward_redeemed_count}.`);
    setRedeemCode("");
    setPolls((current) => current.map((poll) => poll.id === data.poll_id ? { ...poll, reward_redeemed_count: data.reward_redeemed_count } : poll));
  }

  async function changeScannedPoll(nextPollId) {
    if (!scanResult || !nextPollId) return;
    const error = await reassignManagedCampaignPoll(scanResult.campaign.id, nextPollId);
    if (error) {
      alert(error.message);
      return;
    }
    const nextPoll = scanResult.polls.find((poll) => String(poll.id) === String(nextPollId)) || null;
    setScanResult((current) => ({ ...current, currentPoll: nextPoll, campaign: { ...current.campaign, poll_id: Number(nextPollId) } }));
    setQrCampaigns((current) => current.map((item) => item.id === scanResult.campaign.id ? { ...item, poll_id: Number(nextPollId) } : item));
  }

  async function createAlertRule() {
    if (!newRulePollId || (newRuleType === "answer_match" && !newRuleAnswer.trim())) return alert("Choose a poll and complete the trigger.");
    const rule = { workspace_id: workspaceUserId, poll_id: Number(newRulePollId), trigger_type: newRuleType, score_threshold: newRuleType === "low_score" ? Number(newRuleThreshold) : null, answer_match: newRuleType === "answer_match" ? newRuleAnswer.trim() : null };
    const { data, error } = await supabase.from("feedback_alert_rules").insert(rule).select().single();
    if (error) return alert(error.message);
    setAlertRules((current) => [data, ...current]); setNewRuleAnswer("");
  }

  async function createRecoveryTask() {
    if (!newTaskTitle.trim()) return alert("Add a recovery task title.");
    const { data, error } = await supabase.from("feedback_recovery_tasks").insert({ workspace_id: workspaceUserId, alert_id: newTaskAlertId ? Number(newTaskAlertId) : null, title: newTaskTitle.trim() }).select().single();
    if (error) return alert(error.message);
    setRecoveryTasks((current) => [data, ...current]); setNewTaskTitle(""); setNewTaskAlertId("");
  }

  async function saveReportSettings() {
    if (!reportSettings.recipient_email.trim()) return alert("Enter a report recipient email.");
    const { error } = await supabase.from("weekly_report_settings").upsert({ workspace_id: workspaceUserId, recipient_email: reportSettings.recipient_email.trim(), is_enabled: reportSettings.is_enabled, updated_at: new Date().toISOString() });
    if (error) return alert(error.message);
    alert("Weekly report settings saved.");
  }

  async function saveNurtureSettings() {
    try {
      await saveLeadNurtureSettings(workspaceUserId, nurtureSettings);
      alert("Lead nurture email settings saved.");
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to save nurture email settings.");
    }
  }

  async function saveWinbackEmailSettings() {
    try {
      await saveWinbackSettings(workspaceUserId, winbackSettings);
      alert("Win-back email settings saved.");
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to save win-back email settings.");
    }
  }

  async function saveDonationSettingsHandler() {
    if (!DONATION_FEATURE_ENABLED) {
      alert(t("admin.engagement.donations.notEnabled"));
      return;
    }
    if (donationSettings.is_enabled && !donationSettings.stripe_charges_enabled) {
      alert("Connect and finish onboarding with Stripe before enabling donations.");
      return;
    }
    try {
      await saveDonationSettings(workspaceUserId, donationSettings);
      alert("Donation settings saved.");
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to save donation settings.");
    }
  }

  async function connectStripeHandler() {
    if (!DONATION_FEATURE_ENABLED) {
      setStripeConnectError(t("admin.engagement.donations.notEnabled"));
      return;
    }
    setStripeConnectError("");
    setStripeConnectBusy(true);
    try {
      const url = await startStripeConnectOnboarding();
      window.location.assign(url);
    } catch (error) {
      console.error(error);
      setStripeConnectError(error.message || "Unable to start Stripe onboarding.");
      setStripeConnectBusy(false);
    }
  }

  async function refreshStripeStatusHandler() {
    if (!DONATION_FEATURE_ENABLED) {
      setStripeConnectError(t("admin.engagement.donations.notEnabled"));
      return;
    }
    setStripeConnectError("");
    setStripeConnectBusy(true);
    try {
      const result = await refreshStripeConnectStatus();
      setDonationSettings((current) => ({
        ...current,
        stripe_charges_enabled: Boolean(result.chargesEnabled),
        stripe_payouts_enabled: Boolean(result.payoutsEnabled),
        stripe_onboarding_complete: Boolean(result.detailsSubmitted)
      }));
    } catch (error) {
      console.error(error);
      setStripeConnectError(error.message || "Unable to check Stripe status.");
    } finally {
      setStripeConnectBusy(false);
    }
  }

  async function pickRaffleWinner(pollId) {
    const { data, error } = await supabase.rpc("pick_raffle_winner", { target_poll_id: pollId }).maybeSingle();
    if (error) {
      alert(error.message);
      return;
    }
    setPolls((current) => current.map((poll) => poll.id === pollId ? { ...poll, raffle_winner_email: data.email, raffle_winner_picked_at: new Date().toISOString() } : poll));
    alert(`Winner picked: ${data.email}`);
  }

  async function deletePoll(id) {
    const { error } = await supabase.from("polls").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert(`Error deleting poll: ${error.message}`);
      return;
    }

    appendAuditLog("delete_poll", { poll_id: id });
    setPolls((prev) => prev.filter((p) => p.id !== id));
  }

  async function closePoll(poll) {
    const status = isPollClosed(poll) ? "active" : "closed";
    const closedAt = status === "closed" ? new Date().toISOString() : null;

    await savePollMeta(poll.id, {
      status,
      closed_at: closedAt
    });

    appendAuditLog(status === "closed" ? "close_poll" : "reopen_poll", { poll_id: poll.id, question: poll.question });
    await loadPolls();
    alert(status === "closed" ? "Poll closed." : "Poll reopened.");
  }

  async function exportPollCsv(poll) {
    const { data: voteRows, error } = await supabase
      .from("votes")
      .select("*")
      .eq("poll_id", poll.id);

    if (error) {
      console.error(error);
      alert(`Unable to export results: ${error.message}`);
      return;
    }

    const rows = [
      ["poll_id", "question", "answer", "user_id", "created_at"],
      ...(voteRows ?? []).map((row) => [
        String(poll.id),
        String(poll.question ?? ""),
        String(row.answer ?? ""),
        String(row.user_id ?? ""),
        String(row.created_at ?? "")
      ])
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `poll-${poll.id}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
    appendAuditLog("export_csv", { poll_id: poll.id });
  }

  async function exportConsentedEmailCsv() {
    if (!workspaceUserId) return;
    const { data: leadRows, error } = await supabase
      .from("voter_leads")
      .select("email, consented_at")
      .eq("workspace_id", workspaceUserId)
      .order("consented_at", { ascending: false });

    if (error) {
      console.error(error);
      alert(`Unable to export consented emails: ${error.message}`);
      return;
    }

    const latestByEmail = new Map();
    (leadRows ?? []).forEach((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      if (email && !latestByEmail.has(email)) {
        latestByEmail.set(email, row.consented_at || "");
      }
    });

    const rows = [
      ["email", "consented_at"],
      ...Array.from(latestByEmail.entries()).map(([email, consentedAt]) => [email, consentedAt])
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "consented-email-list.csv";
    link.click();
    URL.revokeObjectURL(url);
    appendAuditLog("export_consented_email_list", { count: latestByEmail.size });
  }

  function copyShareLink(poll) {
    const shareLink = poll.stable_short_url || poll.short_url || `${window.location.origin}/vote/${poll.id}`;
    navigator.clipboard.writeText(shareLink);
  }

  function choosePersona(key) {
    setPersonaKey(key);
    if (workspaceUserId) localStorage.setItem(`ivote_persona_${workspaceUserId}`, key);
  }

  function changePersona() {
    setPersonaKey(null);
    if (workspaceUserId) localStorage.removeItem(`ivote_persona_${workspaceUserId}`);
    const params = new URLSearchParams(location.search);
    params.delete("business");
    navigate(`/admin?${params}`, { replace: true });
  }

  function goToPersonaStep(step) {
    if (step.route) navigate(step.route);
    else if (step.tab) setActiveTab(step.tab);
  }

  async function postWorkspaceUpdate() {
    if (!newUpdateMessage.trim()) return alert("Write the update message first.");
    const { data, error } = await supabase.from("workspace_updates").insert({
      workspace_id: workspaceUserId,
      poll_id: newUpdatePollId ? Number(newUpdatePollId) : null,
      message: newUpdateMessage.trim()
    }).select().single();
    if (error) return alert(error.message);
    setWorkspaceUpdates((current) => [data, ...current]);
    setNewUpdateMessage("");
    setNewUpdatePollId("");
  }

  async function deleteWorkspaceUpdate(id) {
    const { error } = await supabase.from("workspace_updates").delete().eq("id", id);
    if (error) return alert(error.message);
    setWorkspaceUpdates((current) => current.filter((item) => item.id !== id));
  }

  // Moved here from the standalone /admin/moderation page (now redirects to this tab) - content
  // moderation naturally belongs with the rest of Redshank's "catch trouble early" duties.
  async function reviewContentReport(report, status) {
    if (status === "hidden") {
      const { error } = await supabase
        .from("user_answers")
        .update({ is_hidden: true })
        .eq("poll_id", report.poll_id)
        .eq("answer", report.reported_answer);
      if (error) {
        setModerationMessage(error.message);
        return;
      }
    }
    const { error } = await supabase
      .from("content_reports")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", report.id);
    if (error) {
      setModerationMessage(error.message);
      return;
    }
    setModerationMessage(t("admin.feedback.moderation.reportUpdated"));
    setContentReports((current) => current.map((item) => (item.id === report.id ? { ...item, status } : item)));
  }

  function getQrPrintFormatConfig(format = qrPrintFormat) {
    const formatMap = {
      letter: { label: "Letter", size: "8.5in 11in", cssSize: "820px 1050px", margin: "0.5in" },
      a4: { label: "A4", size: "A4", cssSize: "794px 1123px", margin: "0.5in" },
      a5: { label: "A5", size: "A5", cssSize: "562px 794px", margin: "0.4in" },
      a6: { label: "A6", size: "A6", cssSize: "397px 562px", margin: "0.25in" },
      a3: { label: "A3", size: "A3", cssSize: "1123px 1587px", margin: "0.5in" },
      postcard: { label: "Postcard", size: "5in 7in", cssSize: "480px 680px", margin: "0.2in" },
      beerHolder: { label: "Round beer holder", size: "4in 4in", cssSize: "560px 560px", margin: "0.15in", shape: "round" },
      ticket: { label: "Ticket", size: "3.5in 8in", cssSize: "420px 960px", margin: "0.15in", shape: "ticket" }
    };

    return formatMap[format] || formatMap.a4;
  }

  function generateQrStyle(seedOverride = 1, presetOverride = "brand") {
    const baseName = `${workspaceProfile.companyName || "Godwit"}-${seedOverride}`;
    const hash = Array.from(baseName).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const palette = [
      workspaceProfile.primaryColor || "#2563eb",
      workspaceProfile.accentColor || "#0f172a",
      "#f8fafc",
      "#e0f2fe",
      "#fdf2f8",
      "#ecfeff"
    ];

    const presetPalettes = {
      brand: palette,
      celebration: ["#fef3c7", "#fb7185", "#7c3aed", "#f97316", "#fefce8", "#be123c"],
      fresh: ["#ecfeff", "#14b8a6", "#0ea5e9", "#f0fdf4", "#84cc16", "#f8fafc"],
      premium: ["#f8fafc", "#cbd5e1", "#334155", "#0f172a", "#b08968", "#f5f5f4"],
      ocean: ["#cffafe", "#0891b2", "#1d4ed8", "#172554", "#e0f2fe", "#0f766e"],
      sunset: ["#ffedd5", "#fb923c", "#e11d48", "#7c2d12", "#fef3c7", "#c2410c"],
      botanical: ["#ecfccb", "#65a30d", "#15803d", "#14532d", "#f0fdf4", "#a7f3d0"],
      midnight: ["#dbeafe", "#4f46e5", "#312e81", "#111827", "#c4b5fd", "#0f172a"],
      paper: ["#fff7ed", "#fed7aa", "#fef3c7", "#f8fafc", "#e7e5e4", "#d6d3d1"],
      lavender: ["#f5f3ff", "#c4b5fd", "#8b5cf6", "#4c1d95", "#fdf4ff", "#e9d5ff"],
      terracotta: ["#fff7ed", "#fdba74", "#c2410c", "#7c2d12", "#fef2f2", "#fb7185"],
      aurora: ["#cffafe", "#2dd4bf", "#6366f1", "#312e81", "#f0fdf4", "#a7f3d0"],
      coastal: ["#ecfeff", "#67e8f9", "#0e7490", "#164e63", "#eff6ff", "#93c5fd"],
      citrus: ["#fefce8", "#fde047", "#f97316", "#c2410c", "#ecfccb", "#84cc16"]
    };
    const selectedPalette = presetPalettes[presetOverride] || palette;
    const first = selectedPalette[hash % selectedPalette.length];
    const second = selectedPalette[(hash + 2) % selectedPalette.length];
    const third = selectedPalette[(hash + 4) % selectedPalette.length];
    const fourth = selectedPalette[(hash + 5) % selectedPalette.length];

    return {
      background: ["premium", "paper"].includes(presetOverride)
        ? `linear-gradient(135deg, ${first} 0%, ${second} 48%, ${fourth} 100%)`
        : `radial-gradient(circle at top left, ${first} 0%, ${second} 32%, ${third} 62%, ${fourth} 100%)`,
      colors: [first, second, third, fourth],
      shadow: `0 20px 45px rgba(15, 23, 42, 0.18)`
    };
  }

  // Eggs (the multi-item customer destinations) previously only offered a "copy link" text
  // URL, with no actual QR image, download, or print option - unlike the older single-poll
  // QR cards above, which have all three. These two functions bring campaigns up to the same
  // level, reusing the same api.qrserver.com image source and branded print-poster layout,
  // but without needing a persistent ref (multiple campaigns can be listed at once, so each
  // builds its own QR image URL directly instead of sharing one ref).
  function getCampaignQrImageUrl(url, size = 300) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}`;
  }

  function openQrModifier(campaign, url) {
    setQrModifier({
      campaign,
      url,
      text: campaign.name || "",
      preset: "brand",
      seed: 1,
      logoUrl: workspaceProfile.logoUrl || ""
    });
  }

  function downloadCampaignQr(campaign, url, design = {}) {
    const generatedStyle = generateQrStyle(design.seed || 1, design.preset || "brand");
    const customText = (design.text || "").trim();
    const logoUrl = (design.logoUrl || "").trim();
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const framePadding = 42;
      const footerHeight = 54;
      const textHeight = customText ? 54 : 0;
      const logoHeight = logoUrl ? 80 : 0;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(img.naturalWidth + framePadding * 2 + 80, 520);
      canvas.height = img.naturalHeight + framePadding * 2 + footerHeight + textHeight + logoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const paint = () => {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, generatedStyle.colors[0]);
        gradient.addColorStop(0.5, generatedStyle.colors[1]);
        gradient.addColorStop(1, generatedStyle.colors[3]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#0b1a33";
        ctx.lineWidth = 18;
        ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);
        if (logoUrl && logo.naturalWidth > 0) {
          const scale = Math.min(160 / logo.naturalWidth, 52 / logo.naturalHeight);
          const logoWidth = logo.naturalWidth * scale;
          const logoHeight = logo.naturalHeight * scale;
          ctx.drawImage(logo, (canvas.width - logoWidth) / 2, framePadding + (52 - logoHeight) / 2, logoWidth, logoHeight);
        }
        ctx.fillStyle = "#ffffff";
        const qrTop = framePadding + logoHeight;
        ctx.fillRect(framePadding, qrTop, img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, framePadding, qrTop);
        if (customText) {
          ctx.fillStyle = "#0f172a";
          ctx.font = "700 24px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(customText.slice(0, 80), canvas.width / 2, qrTop + img.naturalHeight + 36);
        }
        ctx.fillStyle = "#0b1a33";
        ctx.font = "700 22px Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("hellogodwit.com", canvas.width / 2, canvas.height - 18);
        const link = document.createElement("a");
        link.download = `${(campaign.name || "qr-campaign").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-qr.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      };
      paint();
    };
    img.onerror = () => console.error("Unable to load QR image for download.");
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => img.src = getCampaignQrImageUrl(url, 600);
    logo.onerror = () => img.src = getCampaignQrImageUrl(url, 600);
    if (logoUrl) {
      logo.src = logoUrl;
    } else {
      img.src = getCampaignQrImageUrl(url, 600);
    }
  }

  function printCampaignQr(campaign, url, design = {}) {
    const formatConfig = getQrPrintFormatConfig();
    const customText = (design.text || "").trim().replace(/[<>&"']/g, "");
    const campaignName = (campaign?.name || "QR code").replace(/[<>&"']/g, "");
    const logoUrl = new URL("/godwit-logo.png", window.location.href).href;
    const qrUrl = getCampaignQrImageUrl(url, 600);
    const returnUrl = window.location.href.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      console.error("Unable to open print window.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${t("admin.polls.card.printQr")}</title>
          <style>
            @page { size: ${formatConfig.size}; margin: ${formatConfig.margin}; }
            * { box-sizing: border-box; }
            body { min-height: 100vh; margin: 0; padding: 24px; background: #edf2f0; color: #284542; font-family: Arial, sans-serif; }
            .print-toolbar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 16px; max-width: 980px; margin: 0 auto 24px; padding: 14px 18px; border: 1px solid #d1ddd8; border-radius: 14px; background: #fff; box-shadow: 0 8px 24px #28454212; }
            .toolbar-copy { min-width: 0; }
            .toolbar-copy strong { display: block; font-size: 15px; }
            .toolbar-copy p { margin: 4px 0 0; color: #5b706b; font-size: 13px; line-height: 1.4; }
            .toolbar-actions { display: flex; flex: 0 0 auto; gap: 8px; }
            .toolbar-actions button, .toolbar-actions a { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; padding: 0 15px; border: 1px solid #cbd7d1; border-radius: 9px; color: #284542; background: #fff; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; }
            .toolbar-actions .print-button { border-color: #176f68; color: #fff; background: #176f68; }
            .toolbar-actions button:disabled { cursor: wait; opacity: .58; }
            .poster { display: grid; width: min(100%, 720px); aspect-ratio: 1; place-items: center; margin: 0 auto; padding: 30px; border: 1px solid #b99555; border-radius: 28px; background: radial-gradient(ellipse at 82% 100%, #e8c9c0 0%, transparent 44%), radial-gradient(ellipse at 8% 0%, #d5dfe0 0%, transparent 50%), #e9e2dc; box-shadow: 0 18px 50px #28454216; }
            .egg { position: relative; display: flex; width: min(100%, 510px); aspect-ratio: .88; flex-direction: column; align-items: center; justify-content: center; gap: 9px; overflow: hidden; padding: 24px 30px 28px; border: 2px solid #d2a953; border-radius: 50% 50% 46% 46% / 42% 42% 58% 58%; background: #fff2df; box-shadow: inset 0 0 0 5px #fffaf0; text-align: center; }
            .egg::before { position: absolute; inset: 9px; border: 1px solid #925141; border-radius: 50% 50% 46% 46% / 42% 42% 58% 58%; content: ""; pointer-events: none; }
            .poster-logo { z-index: 1; display: block; width: min(32%, 1.3in); height: auto; clip-path: ellipse(49% 48% at 50% 50%); object-fit: contain; }
            .qr-box { z-index: 1; display: grid; width: min(72%, 2.35in); aspect-ratio: 1; place-items: center; padding: 10px; border: 6px solid #fff; border-radius: 12px; background: #fff; box-shadow: 0 6px 18px #28454220; }
            .qr-box img { display: block; width: 100%; height: 100%; object-fit: contain; }
            .subtitle { z-index: 1; color: #42645e; font-size: 11px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
            .custom-text { z-index: 1; display: -webkit-box; max-width: 350px; overflow: hidden; color: #284542; font-size: 12px; font-weight: 700; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
            .title { z-index: 1; display: -webkit-box; max-width: 350px; overflow: hidden; color: #284542; font-family: Georgia, "Times New Roman", serif; font-size: 16px; font-weight: 700; line-height: 1.2; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
            .website { z-index: 1; margin-top: 1px; color: #725326; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
            .print-status { min-height: 18px; margin: 10px auto 0; color: #5b706b; font-size: 12px; text-align: center; }
            .print-status[role="alert"] { color: #a33b32; }
            @media print {
              body { min-height: 0; padding: 0; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              .print-toolbar, .print-status { display: none !important; }
              .poster { width: min(100%, 6in); margin: 0 auto; padding: 18px; border-color: transparent; border-radius: 0; box-shadow: none; break-inside: avoid; }
              .egg { width: min(100%, 4.6in); }
              .poster-logo { width: min(32%, 1.05in); }
              .qr-box { width: min(72%, 2.15in); }
            }
            @media (max-width: 600px) {
              body { padding: 12px; }
              .print-toolbar { align-items: flex-start; flex-direction: column; margin-bottom: 14px; }
              .toolbar-actions { width: 100%; }
              .toolbar-actions button, .toolbar-actions a { flex: 1; padding: 0 8px; font-size: 12px; }
              .poster { padding: 14px; border-radius: 18px; }
              .egg { aspect-ratio: .72; gap: 8px; padding: 22px 20px 26px; }
              .poster-logo { width: min(32%, 1in); }
              .qr-box { width: min(72%, 1.8in); }
            }
          </style>
        </head>
        <body>
          <header class="print-toolbar">
            <div class="toolbar-copy">
              <strong>${t("admin.engagement.campaigns.printTitle", { defaultValue: "Print your Egg QR" })}</strong>
              <p>${t("admin.engagement.campaigns.printerHint", { defaultValue: "Choose Print to open your device's printer dialog, then select a printer or save as PDF." })}</p>
            </div>
            <div class="toolbar-actions">
              <button id="print-button" class="print-button" type="button" disabled>${t("admin.engagement.campaigns.printAction", { defaultValue: "Choose printer" })}</button>
              <a href="${returnUrl}">${t("admin.engagement.campaigns.returnToDashboard", { defaultValue: "Back to Godwit" })}</a>
            </div>
          </header>
          <main>
            <div class="poster">
              <div class="egg">
                <img id="logo-image" class="poster-logo" src="${logoUrl}" alt="Godwit" />
                <div class="subtitle">${t("admin.engagement.campaigns.scanToView")}</div>
                <div class="qr-box"><img id="qr-image" src="${qrUrl}" alt="QR code" /></div>
                ${customText ? `<div class="custom-text">${customText}</div>` : ""}
                <div class="title">${campaignName}</div>
                <div class="website">hellogodwit.com</div>
              </div>
            </div>
          <p id="print-status" class="print-status" role="status">${t("admin.engagement.campaigns.preparingQr", { defaultValue: "Preparing the QR code…" })}</p>
          </main>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    const posterImages = Array.from(printWindow.document.images);
    const printButton = printWindow.document.getElementById("print-button");
    const status = printWindow.document.getElementById("print-status");
    const updateImageReadiness = () => {
      if (posterImages.some((image) => image.complete && image.naturalWidth === 0)) {
        printButton.disabled = true;
        status.setAttribute("role", "alert");
        status.textContent = t("admin.engagement.campaigns.qrLoadError", { defaultValue: "The poster artwork or QR code could not be loaded. Close this page and try again." });
      } else if (posterImages.every((image) => image.complete && image.naturalWidth > 0)) {
        printButton.disabled = false;
        status.textContent = t("admin.engagement.campaigns.qrReady", { defaultValue: "QR code ready. Choose a printer to print." });
      }
    };
    posterImages.forEach((image) => {
      image.addEventListener("load", updateImageReadiness, { once: true });
      image.addEventListener("error", updateImageReadiness, { once: true });
    });
    updateImageReadiness();
    printButton.addEventListener("click", () => {
      printWindow.focus();
      printWindow.print();
    });
  }

  if (loading) return <p className="text-center p-6">Loading polls...</p>;

  const entitlements = {
    ...getEntitlements(workspaceProfile.plan),
    ...(["small", "standard", "scale", "regional"].includes(interactionUsage?.plan)
      && ["active", "exhausted"].includes(interactionUsage.state) ? { campaignLimit: Infinity } : {})
  };
  const permission = getPermissionSet(currentUserRole);
  const canEditPolls = permission.canEditPolls;
  const canDeletePolls = permission.canDeletePolls;
  const canReuseQr = permission.canReuseQr;
  const canExportResults = permission.canExportResults && entitlements.csvExport;
  const canClosePolls = permission.canClosePolls;
  const selectedPollId = new URLSearchParams(location.search).get("poll");

  // --- Poll <-> QR code cross-linking: let an admin jump either direction instantly ---
  function qrCodesForPoll(pollId) {
    const matches = [];
    qrCampaigns.forEach((campaign) => {
      const isPrimary = campaign.poll_id === pollId;
      const isItem = qrCampaignItems.some(
        (item) => item.campaign_id === campaign.id && item.item_type === "poll" && item.poll_id === pollId
      );
      if (isPrimary || isItem) {
        matches.push({ kind: "campaign", id: campaign.id, name: campaign.name, token: campaign.token });
      }
    });
    return matches;
  }

  function goToPoll(pollId) {
    setSearchTerm("");
    setStatusFilter("all");
    setLocationFilter("all");
    const params = new URLSearchParams(location.search);
    params.set("tab", "polls");
    params.set("poll", pollId);
    navigate(`/admin?${params}`);
  }

  function goToEgg(campaignId) {
    const params = new URLSearchParams(location.search);
    params.set("tab", "engagement");
    params.set("egg", campaignId);
    params.delete("poll");
    navigate(`/admin?${params}`);
  }

  async function createGoalEgg(fields) {
    if (!canReuseQr || !workspaceUserId) throw new Error(t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." }));
    if (!workspaceProfile.businessType) throw new Error(t("admin.goal.businessRequired", { defaultValue: "Set your business type before creating an Egg." }));
    const lockedGoal = fields.goalKeys
      .map((key) => START_GOALS.find((entry) => entry.key === key))
      .find((goal) => goal?.feature && !entitlements[goal.feature]);
    if (lockedGoal) throw new Error(t("admin.overview.availableOn", { plan: minPlanLabelFor(lockedGoal.feature) }));
    const benefitFields = normalizeEggEmailBenefit(fields.emailBenefit);
    if (benefitFields.email_benefit_type !== "none" && !entitlements.emailBenefits) {
      throw new Error(t("admin.overview.availableOn", { plan: minPlanLabelFor("emailBenefits") }));
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) throw new Error(userError?.message || t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." }));
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error(sessionError?.message || t("admin.goal.managerRequired", { defaultValue: "An owner or editor can create Eggs." }));
    const generationResponse = await fetch("/api/egg-ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        action: "generate-goal-setup",
        workspaceId: workspaceUserId,
        businessType: workspaceProfile.businessType,
        businessDescription: workspaceProfile.businessDescription,
        goalKeys: fields.goalKeys,
        goalContext: fields.goalContext,
        name: fields.name,
        placementLabel: fields.placementLabel,
        language: navigator.language
      })
    });
    const generated = await generationResponse.json().catch(() => ({}));
    if (!generationResponse.ok) {
      throw new Error(generated.error || t("admin.goal.generationFailed", { defaultValue: "Unable to generate this Egg's poll. Please try again." }));
    }
    if (
      !generated
      || typeof generated !== "object"
      || typeof generated.poll?.question !== "string"
      || !Array.isArray(generated.poll.answers)
      || generated.poll.answers.some((answer) => typeof answer !== "string")
      || isRestrictedTopic(generated.poll.question)
      || generated.poll.answers.some((answer) => isRestrictedTopic(answer))
    ) {
      throw new Error(t("admin.goal.generationInvalid", { defaultValue: "The generated poll needs review. Please try creating the Egg again." }));
    }

    const campaign = await createQrCampaign({
      ...fields,
      businessType: workspaceProfile.businessType,
      workspaceId: workspaceUserId,
      aiEnabled: true
    });
    let setup;
    try {
      setup = await createGoalEggSetup({
        campaign,
        workspaceId: workspaceUserId,
        userId: user.id,
        pollDraft: generated.poll,
        emailBenefit: fields.emailBenefit,
        reviewCards: fields.goalKeys.includes("reviews")
          ? (workspaceProfile.reviewPlatforms || []).map((platform) => ({
            title: platform.name,
            body: t("admin.goal.reviewInvitation", { defaultValue: "Share an honest review of your experience. It is optional and independent of any customer benefit." }),
            linkUrl: platform.url,
            linkLabel: platform.name
          }))
          : []
      });
    } catch (error) {
      const { error: campaignCleanupError } = await supabase.from("qr_campaigns").delete().eq("id", campaign.id);
      if (campaignCleanupError) throw new Error(`${error.message} Egg cleanup was incomplete: ${campaignCleanupError.message}.`);
      throw error;
    }

    setQrCampaigns((current) => [campaign, ...current]);
    setPolls((current) => [setup.poll, ...current]);
    setQrCampaignItems((current) => [setup.pollItem, ...setup.reviewItems, ...current]);
    setAnalytics((current) => ({ ...current, total: current.total + 1, active: current.active + 1 }));
    goToEgg(campaign.id);
  }

  const filteredPolls = polls.filter((poll) => {
    const pollMeta = readPollMeta(poll.id);
    const locationName = poll.location_name ?? pollMeta.location_name ?? "";
    const brandName = poll.brand_name ?? pollMeta.brand_name ?? "";
    const status = getPollStatusInfo(poll);
    const questionText = `${poll.question ?? ""} ${locationName} ${brandName}`.toLowerCase();
    const matchesSearch = questionText.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesLocation = locationFilter === "all" || locationName === locationFilter;
    return matchesSearch && matchesStatus && matchesLocation;
  });

  const quickActions = [
    { key: "engagement", icon: "🥚", label: t("admin.quickActions.engagement.label"), description: t("admin.quickActions.engagement.description"), onSelect: () => setActiveTab("engagement") },
    { key: "analytics", icon: "\ud83d\udcca", label: t("admin.quickActions.analytics.label"), description: t("admin.quickActions.analytics.description"), onSelect: () => navigate("/admin/analytics") },
    { key: "feedback", icon: "\ud83d\udcac", label: t("admin.quickActions.feedback.label"), description: t("admin.quickActions.feedback.description"), onSelect: () => setActiveTab("feedback") },
    { key: "settings", icon: "\u2699\ufe0f", label: t("admin.quickActions.settings.label"), description: t("admin.quickActions.settings.description"), onSelect: () => setActiveTab("settings") }
  ];

  function openConnectionSetup(tab, sectionId) {
    setActiveTab(tab);
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <div className="workspace-page egg-workspace max-w-5xl mx-auto p-6">
      {interactionUsage && <InteractionUsageNotice usage={interactionUsage} t={t} />}
      {!interactionUsage && workspaceProfile.trial?.state === "active" && (
        <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            <strong>{t("trial.dashboardActive", {
              used: workspaceProfile.trial.interactions_used,
              limit: workspaceProfile.trial.interaction_limit,
              date: new Date(workspaceProfile.trial.ends_at).toLocaleDateString()
            })}</strong>
          </p>
          <Link to="/admin/billing" className="font-semibold underline">{t("trial.billingLink")}</Link>
        </aside>
      )}
      {!interactionUsage && ["expired", "used_up", "inactive"].includes(workspaceProfile.trial?.state) && (
        <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="status">
          <p><strong>{t("trial.dashboardPaused")}</strong> {t("trial.dashboardPausedDetail")}</p>
          <Link to="/support" className="font-semibold underline">{t("trial.supportLink")}</Link>
        </aside>
      )}
      {!interactionUsage && workspaceProfile.trial?.state === "unavailable" && (
        <aside className="mb-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="alert">
          {t("trial.statusUnavailable")} {workspaceProfile.trial.error}
        </aside>
      )}
      <DashboardHub activeTab={["feedback", "woodpecker", "connection"].includes(activeTab) ? "results" : activeTab} onSelect={setActiveTab} t={t} />

      {activeTab === "your-business" && workspaceUserId && <BusinessProfile
        workspaceId={workspaceUserId}
        businessType={workspaceProfile.businessType}
        businessDescription={workspaceProfile.businessDescription}
        canManage={permission.canManageWorkspace}
        onSaved={(profile) => setWorkspaceProfile((current) => ({ ...current, ...profile }))}
        t={t}
      />}
      {activeTab === "business" && workspaceUserId && <BusinessData workspaceId={workspaceUserId} canManage={permission.canManageWorkspace} t={t} />}
      {activeTab === "goal" && <EggGoal
        businessType={workspaceProfile.businessType}
        initialSelection={startSelection}
        canManage={canReuseQr && Boolean(workspaceUserId)}
        entitlements={entitlements}
        onCreate={createGoalEgg}
        onOpenReviewSettings={() => openConnectionSetup("settings", "review-platform-settings")}
        t={t}
      />}
      {activeTab === "results" && <EggResults campaigns={qrCampaigns} canViewMessages={permission.canManageWorkspace} onOpenEgg={goToEgg} t={t} />}
      {activeTab === "goal-progress" && <GoalProgress campaigns={qrCampaigns} t={t} />}

      {activeTab === "overview" && (
      <>
      <div className="goal-guide mb-6">
        <div className="goal-plan-heading">
          <h2>{t("admin.overview.goalGuideTitle")}</h2>
          <Link to={`/essentials${personaKey ? `?business=${findPersona(personaKey)?.audienceKey || ""}` : ""}`} className="goal-text-link">
            {t("quickStart.pickGoal")}
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-300">{t("admin.overview.goalGuideIntro")}</p>

        {!findPersona(personaKey) ? (
          <>
            <p className="mt-3 text-sm text-slate-400">{t("admin.overview.businessTypePrompt")}</p>
            <div className="goal-business-grid">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.key}
                  type="button"
                  onClick={() => choosePersona(persona.key)}
                  className="goal-choice"
                >
                  <span className="goal-choice-title">{t(`landing.useCases.${persona.audienceKey}Title`)}</span>
                  <span className="goal-choice-detail">{t(`quickStart.businesses.${persona.audienceKey}`)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          (() => {
            const persona = findPersona(personaKey);
            if (!persona) return null;
            return (
              <>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-400">
                    {t("admin.overview.guideFor")} <strong className="text-slate-200">{t(`landing.useCases.${persona.audienceKey}Title`)}</strong>
                  </p>
                  <button onClick={changePersona} className="text-xs text-slate-400 underline">{t("admin.overview.chooseDifferentPath")}</button>
                </div>
                <div className="mt-3 space-y-2">
                  {persona.steps
                    .filter((step) => DONATION_FEATURE_ENABLED || step.featureFlag !== "donations")
                    .map((step, index) => {
                    const isLocked = step.feature && !entitlements[step.feature];
                    return (
                    <div key={step.title} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 bg-gray-900 p-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{index + 1}. {step.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
                        {isLocked && (
                          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                            🔒 {t("admin.overview.availableOn", { plan: minPlanLabelFor(step.feature) })}
                            {" · "}
                            <Link to="/admin/billing" className="underline">{t("admin.overview.upgrade")}</Link>
                          </p>
                        )}
                      </div>
                      <button onClick={() => goToPersonaStep(step)} className="shrink-0 rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950">{t("admin.overview.go")}</button>
                    </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        )}

        <div className="mt-4 rounded border border-slate-700 bg-gray-900 p-3">
          <p className="text-sm font-semibold">{t("admin.overview.setupLinks.title")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("admin.overview.setupLinks.body")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DONATION_FEATURE_ENABLED && (
              <button onClick={() => setActiveTab("engagement")} className="rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950">
                {t("admin.overview.setupLinks.donations")}
              </button>
            )}
            <button onClick={() => setActiveTab("settings")} className="rounded border border-teal-500 px-3 py-1.5 text-xs font-semibold text-teal-300">
              {t("admin.overview.setupLinks.reviews")}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quickActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onSelect}
            className="rounded border border-slate-700 bg-gray-900 p-4 text-left transition hover:border-teal-500"
          >
            <span className="text-2xl" aria-hidden="true">{action.icon}</span>
            <p className="mt-2 font-bold">{action.label}</p>
            <p className="mt-1 text-sm text-slate-400">{action.description}</p>
          </button>
        ))}
      </div>

      </>
      )}

      {activeTab === "woodpecker" && <Woodpecker embedded />}

      {activeTab === "connection" && (
      <section className="space-y-6">
        <div className="rounded border border-teal-700 bg-slate-900 p-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-300">{t("admin.connection.eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-bold">{t("admin.connection.title")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">{t("admin.connection.subtitle")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded border border-slate-700 bg-gray-900 p-4">
            <span className="text-2xl font-bold text-teal-300">1</span>
            <h3 className="mt-2 text-lg font-bold">{t("admin.connection.step1.title")}</h3>
            <p className="mt-2 text-sm text-slate-400">{t("admin.connection.step1.body")}</p>
            <Link to="/create" className="mt-4 inline-block rounded bg-teal-500 px-3 py-2 text-sm font-semibold text-slate-950">{t("admin.connection.step1.cta")}</Link>
          </article>
          <article className="rounded border border-slate-700 bg-gray-900 p-4">
            <span className="text-2xl font-bold text-sky-300">2</span>
            <h3 className="mt-2 text-lg font-bold">{t("admin.connection.step2.title")}</h3>
            <p className="mt-2 text-sm text-slate-400">{t("admin.connection.step2.body")}</p>
            <a href="#nurture-settings" className="mt-4 inline-block rounded bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950">{t("admin.connection.step2.cta")}</a>
          </article>
          <article className="rounded border border-slate-700 bg-gray-900 p-4">
            <span className="text-2xl font-bold text-amber-300">3</span>
            <h3 className="mt-2 text-lg font-bold">{t("admin.connection.step3.title")}</h3>
            <p className="mt-2 text-sm text-slate-400">{t("admin.connection.step3.body")}</p>
            <button onClick={() => openConnectionSetup("settings", "review-platform-settings")} className="mt-4 rounded bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950">{t("admin.connection.step3.cta")}</button>
          </article>
        </div>

        <div className="rounded border border-slate-700 bg-gray-900 p-5">
          <h2 className="text-xl font-bold">{t("admin.connection.whatCustomerSees.title")}</h2>
          <div className="customer-connection-journey mt-4" aria-label={t("admin.connection.whatCustomerSees.title")}>
            <article className="customer-connection-step">
              <span className="customer-connection-step-number" aria-hidden="true">1</span>
              <div className="min-w-0">
                <p className="customer-connection-step-label">{t("admin.connection.whatCustomerSees.voteLabel")}</p>
                <p className="customer-connection-step-body">{t("admin.connection.whatCustomerSees.voteBody")}</p>
              </div>
            </article>
            <article className="customer-connection-step">
              <span className="customer-connection-step-number" aria-hidden="true">2</span>
              <div className="min-w-0">
                <p className="customer-connection-step-label">{t("admin.connection.whatCustomerSees.stayConnectedLabel")}</p>
                <p className="customer-connection-step-body">{t("admin.connection.whatCustomerSees.stayConnectedBody")}</p>
              </div>
            </article>
            <article className="customer-connection-step">
              <span className="customer-connection-step-number" aria-hidden="true">3</span>
              <div className="min-w-0">
                <p className="customer-connection-step-label">{t("admin.connection.whatCustomerSees.shareHonestlyLabel")}</p>
                <p className="customer-connection-step-body">{t("admin.connection.whatCustomerSees.shareHonestlyBody")}</p>
              </div>
            </article>
          </div>
          <p className="mt-4 text-xs text-slate-500">{t("admin.connection.whatCustomerSees.disclaimer")}</p>
        </div>

        <div className="rounded border border-slate-700 bg-gray-900 p-5">
          <h2 className="text-xl font-bold">{t("admin.connection.emailList.title")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("admin.connection.emailList.description")}</p>
          {entitlements.leadCapture ? (
            <>
              <button onClick={exportConsentedEmailCsv} className="mt-4 rounded bg-teal-500 px-4 py-2 font-semibold text-slate-950">
                {t("admin.connection.emailList.downloadButton")}
              </button>
              <p className="mt-3 text-xs text-amber-300">{t("admin.connection.emailList.legalNote")}</p>
            </>
          ) : (
            <LockedFeature
              feature="leadCapture"
              title={t("admin.connection.emailList.lockedTitle")}
              description={t("admin.connection.emailList.lockedDescription")}
            />
          )}
        </div>

        <div className="rounded border border-slate-700 bg-gray-900 p-5">
          <h2 className="text-xl font-bold">{t("admin.connection.benefits.title")}</h2>
          <p className="mt-2 text-sm text-slate-400">{t("admin.connection.benefits.intro")}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-sky-700/60 bg-sky-950/20 p-4">
              <h3 className="font-bold text-sky-300">{t("admin.connection.benefits.emailTitle")}</h3>
              <p className="mt-2 text-sm text-slate-300">{t("admin.connection.benefits.emailBody")}</p>
            </article>
            <article className="rounded-lg border border-amber-700/60 bg-amber-950/20 p-4">
              <h3 className="font-bold text-amber-300">{t("admin.connection.benefits.reviewTitle")}</h3>
              <p className="mt-2 text-sm text-slate-300">{t("admin.connection.benefits.reviewBody")}</p>
            </article>
          </div>
        </div>

        <div id="nurture-settings">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-300">{t("admin.connection.emailAutomations.eyebrow")}</p>
          <p className="mb-3 text-sm text-slate-400">{t("admin.connection.emailAutomations.description")}</p>
          <div className="grid gap-4 md:grid-cols-2">
          <details className="rounded border border-slate-700 bg-gray-900" open>
            <summary className="cursor-pointer p-4 text-lg font-bold">{t("admin.connection.leadNurture.title")}</summary>
            <div className="px-4 pb-4 space-y-3">
              {entitlements.automatedNurture ? (
              <>
              <p className="text-sm text-slate-400">{t("admin.connection.leadNurture.description")}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={nurtureSettings.is_enabled} onChange={(event) => setNurtureSettings((current) => ({ ...current, is_enabled: event.target.checked }))} />
                <span>{t("admin.connection.leadNurture.enableLabel")}</span>
              </label>
              <input value={nurtureSettings.subject || ""} onChange={(event) => setNurtureSettings((current) => ({ ...current, subject: event.target.value }))} className="w-full border p-2 rounded text-black" placeholder={t("admin.connection.leadNurture.subjectPlaceholder")} />
              <textarea value={nurtureSettings.message || ""} onChange={(event) => setNurtureSettings((current) => ({ ...current, message: event.target.value }))} rows="4" className="w-full border p-2 rounded text-black" placeholder={t("admin.connection.messageBodyPlaceholder")} />
              <button onClick={saveNurtureSettings} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold">{t("admin.connection.leadNurture.saveButton")}</button>
              <p className="text-xs text-slate-500">{t("admin.connection.emailDeliveryNote")}</p>
              </>
              ) : (
                <LockedFeature
                  feature="automatedNurture"
                  title={t("admin.connection.leadNurture.lockedTitle")}
                  description={t("admin.connection.leadNurture.lockedDescription")}
                />
              )}
            </div>
          </details>

          <details className="rounded border border-slate-700 bg-gray-900" open>
            <summary className="cursor-pointer p-4 text-lg font-bold">{t("admin.connection.winback.title")}</summary>
            <div className="px-4 pb-4 space-y-3">
              {entitlements.automatedNurture ? (
              <>
              <p className="text-sm text-slate-400">{t("admin.connection.winback.description")}</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={winbackSettings.is_enabled} onChange={(event) => setWinbackSettings((current) => ({ ...current, is_enabled: event.target.checked }))} />
                <span>{t("admin.connection.winback.enableLabel")}</span>
              </label>
              <label className="block font-semibold">
                {t("admin.connection.winback.daysSinceLabel")}
                <input type="number" min="7" max="365" value={winbackSettings.days_since_last_visit} onChange={(event) => setWinbackSettings((current) => ({ ...current, days_since_last_visit: event.target.value }))} className="mt-1 w-full border p-2 rounded text-black" />
              </label>
              <input value={winbackSettings.subject || ""} onChange={(event) => setWinbackSettings((current) => ({ ...current, subject: event.target.value }))} className="w-full border p-2 rounded text-black" placeholder={t("admin.connection.winback.subjectPlaceholder")} />
              <textarea value={winbackSettings.message || ""} onChange={(event) => setWinbackSettings((current) => ({ ...current, message: event.target.value }))} rows="4" className="w-full border p-2 rounded text-black" placeholder={t("admin.connection.messageBodyPlaceholder")} />
              <button onClick={saveWinbackEmailSettings} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold">{t("admin.connection.winback.saveButton")}</button>
              <p className="text-xs text-slate-500">{t("admin.connection.emailDeliveryNote")}</p>
              </>
              ) : (
                <LockedFeature
                  feature="automatedNurture"
                  title={t("admin.connection.winback.lockedTitle")}
                  description={t("admin.connection.winback.lockedDescription")}
                />
              )}
            </div>
          </details>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <details className="rounded border border-slate-700 bg-gray-900" open>
            <summary className="cursor-pointer p-4 text-lg font-bold">{t("admin.engagement.redemptions.title")}</summary>
            <div className="px-4 pb-4">
              {entitlements.redemptionTracking ? (
                <>
                  <p className="mb-3 text-sm text-slate-400">{t("admin.engagement.redemptions.subtitle")}</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} className="flex-1 border p-2 rounded text-black" placeholder={t("admin.engagement.redemptions.codePlaceholder")} />
                    <button onClick={handleRedeemCode} className="bg-teal-500 text-slate-950 px-4 py-2 rounded font-semibold">{t("admin.engagement.redemptions.markRedeemed")}</button>
                  </div>
                  {redeemMessage && <p className="mt-3 text-sm text-amber-300">{redeemMessage}</p>}
                  <div className="mt-4 space-y-2 text-sm">
                    {polls.filter((poll) => poll.reward_code).length === 0 ? (
                      <p className="text-gray-400">{t("admin.engagement.redemptions.noCodes")}</p>
                    ) : polls.filter((poll) => poll.reward_code).map((poll) => (
                      <div key={poll.id} className="flex items-center justify-between gap-3 border-b border-gray-700 py-1">
                        <span className="min-w-0">#{poll.id} - {poll.question} · {t("admin.engagement.redemptions.codeLabel", { code: poll.reward_code })}</span>
                        <span className="shrink-0 whitespace-nowrap text-teal-300">{t("admin.engagement.redemptions.redeemedCount", { count: poll.reward_redeemed_count || 0 })}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <LockedFeature feature="redemptionTracking" title={t("admin.engagement.redemptions.lockedTitle")} description={t("admin.engagement.redemptions.lockedDescription")} />
              )}
            </div>
          </details>
          <details className="rounded border border-slate-700 bg-gray-900" open>
            <summary className="cursor-pointer p-4 text-lg font-bold">{t("admin.engagement.prizeDraws.title")}</summary>
            <div className="px-4 pb-4">
              {entitlements.prizeDraws ? (
                <>
                  <p className="mb-3 text-sm text-slate-400">{t("admin.engagement.prizeDraws.subtitle")}</p>
                  <div className="space-y-2 text-sm">
                    {polls.filter((poll) => poll.raffle_enabled).length === 0 ? (
                      <p className="text-gray-400">{t("admin.engagement.prizeDraws.noDraws")}</p>
                    ) : polls.filter((poll) => poll.raffle_enabled).map((poll) => (
                      <div key={poll.id} className="border-b border-gray-700 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span>#{poll.id} - {poll.question} · {t("admin.engagement.prizeDraws.prizeLabel", { prize: poll.raffle_prize || t("admin.engagement.prizeDraws.notSet") })}</span>
                          <button onClick={() => pickRaffleWinner(poll.id)} className="shrink-0 bg-amber-500 text-slate-950 px-3 py-1.5 rounded font-semibold">{t("admin.engagement.prizeDraws.pickWinner")}</button>
                        </div>
                        {poll.raffle_winner_email && <p className="mt-1 text-xs text-amber-300">{t("admin.engagement.prizeDraws.winner", { email: poll.raffle_winner_email, date: new Date(poll.raffle_winner_picked_at).toLocaleString() })}</p>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <LockedFeature feature="prizeDraws" title={t("admin.engagement.prizeDraws.lockedTitle")} description={t("admin.engagement.prizeDraws.lockedDescription")} />
              )}
            </div>
          </details>
        </div>
      </section>
      )}

      {activeTab === "polls" && (
      <>
      <div className="mb-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t("admin.polls.title")}</h2>
            <p className="mt-1 mb-3 text-sm text-slate-400">{t("admin.polls.subtitle")}</p>
          </div>
          <Link to="/create" className="workspace-create-poll-button shrink-0 self-start rounded bg-teal-500 px-4 py-2.5 text-center font-semibold text-slate-950">
            {t("admin.polls.createNew")}
          </Link>
        </div>
        <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={t("admin.polls.searchPlaceholder")}
          className="w-full md:w-2/3 border p-2 rounded text-black"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-full md:w-1/3 border p-2 rounded text-black"
        >
          <option value="all">{t("admin.polls.filters.allStatuses")}</option>
          <option value="active">{t("admin.polls.filters.active")}</option>
          <option value="scheduled">{t("admin.polls.filters.scheduled")}</option>
          <option value="expired">{t("admin.polls.filters.expired")}</option>
          <option value="closed">{t("admin.polls.filters.closed")}</option>
        </select>
        <select
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
          className="w-full md:w-1/3 border p-2 rounded text-black"
        >
          <option value="all">{t("admin.polls.filters.allLocations")}</option>
          {Array.from(new Set((polls || []).map((poll) => readPollMeta(poll.id).location_name ?? poll.location_name ?? "").filter(Boolean))).map((location) => (
            <option key={location} value={location}>{location}</option>
          ))}
        </select>
        </div>
      </div>

      {locationStats.length > 0 && (
        <details className="mb-6 border rounded bg-gray-900">
          <summary className="cursor-pointer p-4 text-lg font-bold">{t("admin.polls.locationsOverview.title")}</summary>
          <div className="px-4 pb-4">
            <p className="mb-3 text-sm text-slate-400">{t("admin.polls.locationsOverview.subtitle")}</p>
            <div className="space-y-2 text-sm">
              {locationStats.map((location) => (
                <div key={location.name} className="flex items-center justify-between gap-3 border-b border-gray-700 py-1">
                  <span className="min-w-0">{location.name} ({location.polls} {location.polls === 1 ? t("admin.polls.locationsOverview.poll") : t("admin.polls.locationsOverview.polls")})</span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-teal-300">{location.votes} {t("admin.polls.locationsOverview.votes")}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
      </>
      )}

      {activeTab === "engagement" && (
      <header className="hub-page-heading">
        <p className="goal-eyebrow">{t("admin.hub.eggs", { defaultValue: "Eggs" })}</p>
        <h2>{t("admin.eggList.title", { defaultValue: "Your Eggs, out in the world" })}</h2>
        <p>{t("admin.eggList.intro", { defaultValue: "One location. One purpose. Scan or tap to connect." })}</p>
      </header>
      )}

      {activeTab === "engagement" && (
      <section className="egg-list mb-6 border rounded bg-gray-900">
        <div className="px-4 pb-4">
          {eggAccessTrackingError && (
            <p className="mb-4 rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200" role="alert">
              {eggAccessTrackingError}
            </p>
          )}
          <div className="egg-list-toolbar">
            <button type="button" onClick={() => setActiveTab("goal")} className="goal-primary-action">{t("admin.goal.create", { defaultValue: "Create Egg" })}<span aria-hidden="true">+</span></button>
          </div>

          {qrWizardOpen && (
            <div className="godwit-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="godwit-dialog-panel qr-wizard-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-5"
                role="dialog"
                aria-modal="true"
                aria-label={t(`admin.engagement.wizard.step${qrWizardStep}Title`)}
              >
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#f2c744]">
                    {t("admin.engagement.wizard.stepOf", { step: qrWizardStep, total: 6 })}
                  </p>
                  <button
                    type="button"
                    onClick={closeQrWizard}
                    className="text-[#8fa0c2] hover:text-[#ffffff]"
                    aria-label={t("common.close", "Close")}
                  >
                    ✕
                  </button>
                </div>

                {qrWizardStep === 1 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step1Title")}</h3>
                    <label className="block text-sm font-semibold text-[#dbe3f0]">
                      {t("admin.engagement.campaigns.nameLabel")} <span className="text-amber-300">{t("admin.engagement.campaigns.required")}</span>
                      <input required aria-required="true" value={newCampaignName} onChange={(event) => setNewCampaignName(event.target.value)} className="qr-wizard-input mt-1 w-full border p-2 rounded text-black" placeholder={t("admin.engagement.campaigns.namePlaceholder")} />
                    </label>
                    <label className="block text-sm font-semibold text-[#dbe3f0]">
                      {t("admin.engagement.campaigns.placementLabel")}
                      <input value={newCampaignPlacement} onChange={(event) => setNewCampaignPlacement(event.target.value)} className="qr-wizard-input mt-1 w-full border p-2 rounded text-black" placeholder={t("admin.engagement.campaigns.placementPlaceholder")} />
                    </label>
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-semibold text-[#dbe3f0]">{t("admin.engagement.wizard.accessMethodTitle")}</legend>
                      <p className="text-xs text-[#93a3c2]">{t("admin.engagement.wizard.accessMethodHint")}</p>
                      {["qr", "nfc", "both"].map((method) => (
                        <label
                          key={method}
                          className={`flex cursor-pointer gap-3 rounded border p-3 ${eggAccessChoice === method ? "border-[#f2c744] bg-[#182742]" : "border-[#2c3f66] bg-[#10203a]"}`}
                        >
                          <input
                            type="radio"
                            name="egg-access-method"
                            value={method}
                            checked={eggAccessChoice === method}
                            onChange={() => setEggAccessChoice(method)}
                            className="mt-1 accent-[#f2c744]"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-[#f4f7fb]">{t(`admin.engagement.wizard.accessMethods.${method}.title`)}</span>
                            <span className="mt-1 block text-xs text-[#93a3c2]">{t(`admin.engagement.wizard.accessMethods.${method}.description`)}</span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <div className="qr-wizard-customer-content rounded-lg border border-[#cbd5c4] bg-[#f0f1e9] p-3">
                      <p className="text-sm font-semibold text-[#173b3a]">{t("admin.engagement.wizard.customerContentTitle")}</p>
                      <p className="mt-1 text-xs text-[#607170]">{t("admin.engagement.wizard.customerContentHint")}</p>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#607170]">{t("admin.engagement.items.sectionInfo")}</p>
                      <p className="mt-1 text-xs text-[#607170]">{t("admin.engagement.items.sectionInfoHint")}</p>
                      <input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} className="qr-wizard-input mt-2 w-full border p-2 rounded text-black" placeholder={t("admin.engagement.items.infoTitlePlaceholder")} />
                      <textarea value={itemBody} onChange={(event) => setItemBody(event.target.value)} className="qr-wizard-input mt-2 w-full border p-2 rounded text-black" placeholder={t("admin.engagement.items.infoBodyPlaceholder")} rows="3" />
                    </div>
                    <button onClick={handleCreateCampaignFromWizard} className="w-full rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">
                      {t("admin.engagement.wizard.createAndContinue")}
                    </button>
                  </div>
                )}

                {qrWizardStep === 2 && qrWizardCampaign && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step2Title")}</h3>
                    <div className="flex min-w-0 gap-2">
                      <select value={itemPollId} onChange={(event) => setItemPollId(event.target.value)} className="qr-wizard-input min-w-0 flex-1 border p-2 rounded text-black">
                        <option value="">{t("admin.engagement.items.addPollOption")}</option>
                        {polls.map((poll) => <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>)}
                      </select>
                      <button onClick={handleAddPollItemFromWizard} className="shrink-0 rounded bg-[#0f766e] px-4 py-2 font-semibold text-[#f8fafc] hover:bg-[#0d6259]">
                        {t("admin.engagement.items.addPoll")}
                      </button>
                    </div>
                    <p className="text-xs text-[#93a3c2]">
                      {t("admin.engagement.wizard.pollsAddedSoFar", { count: itemsForCampaign(qrWizardCampaign.id).filter((item) => item.item_type === "poll").length })}
                    </p>
                    {(() => {
                      const pollItems = itemsForCampaign(qrWizardCampaign.id).filter((item) => item.item_type === "poll");
                      return pollItems.length > 0 && (
                        <div className="space-y-1.5">
                          {pollItems.map((item, index, all) => (
                            <div key={item.id} className="flex min-w-0 items-center justify-between gap-2 rounded border border-[#2c3f66] bg-[#101f39] p-2 text-sm">
                              <p className="min-w-0 truncate text-[#dbe3f0]">
                                {polls.find((poll) => poll.id === item.poll_id)?.question || t("admin.engagement.items.unknownPoll")}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleMoveItemWithinType(qrWizardCampaign.id, item.id, "poll", "up")}
                                  disabled={index === 0}
                                  title="Move poll up"
                                  aria-label="Move poll up"
                                  className="rounded border border-[#2c3f66] px-2 py-1 text-[#dbe3f0] disabled:opacity-30"
                                >↑</button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveItemWithinType(qrWizardCampaign.id, item.id, "poll", "down")}
                                  disabled={index === all.length - 1}
                                  title="Move poll down"
                                  aria-label="Move poll down"
                                  className="rounded border border-[#2c3f66] px-2 py-1 text-[#dbe3f0] disabled:opacity-30"
                                >↓</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2">
                      <button onClick={() => setQrWizardStep(1)} className="qr-wizard-back-button flex-1 rounded border border-[#2c3f66] bg-[#182742] px-4 py-2 font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">{t("admin.engagement.wizard.back")}</button>
                      <button onClick={handleContinueFromPollStep} className="flex-1 rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">{t("admin.engagement.wizard.next")}</button>
                    </div>
                  </div>
                )}

                {qrWizardStep === 3 && qrWizardCampaign && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step3Title")}</h3>
                    <p className="text-xs text-[#93a3c2]">{t("admin.engagement.wizard.taskHint")}</p>
                    {actionTasksError && <p role="alert" className="text-sm text-red-300">{t("admin.eggConnections.actionsUnavailable", { defaultValue: "Actions could not be loaded:" })} {actionTasksError}</p>}
                    <div className="flex min-w-0 gap-2">
                      <select
                        value={qrWizardActionId}
                        onChange={(event) => {
                          const actionId = event.target.value;
                          const action = actionTasks.find((item) => String(item.id) === actionId);
                          setQrWizardActionId(actionId);
                          setQrWizardTaskTitle(action ? action.title : "");
                          setQrWizardTaskDescription(action ? action.description || "" : "");
                        }}
                        className="qr-wizard-input min-w-0 flex-1 border p-2 rounded text-black"
                      >
                        <option value="">{t("admin.engagement.wizard.addNewTaskOption")}</option>
                        {actionTasks.filter((action) => !qrWizardTaskIds.includes(Number(action.id))).map((action) => (
                          <option key={action.id} value={action.id}>
                            {action.title}{action.qr_campaigns?.name ? ` (${action.qr_campaigns.name})` : ""}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={handleAddTaskFromWizard} className="shrink-0 rounded bg-[#0f766e] px-4 py-2 font-semibold text-[#f8fafc] hover:bg-[#0d6259]">
                        {t("admin.engagement.wizard.addTask")}
                      </button>
                    </div>
                    <p className="text-xs text-[#93a3c2]">
                      {t("admin.engagement.wizard.tasksAddedSoFar", { count: qrWizardTaskIds.length })}
                    </p>
                    {qrWizardTaskIds.length > 0 && (
                      <div className="space-y-1.5">
                        {qrWizardTaskIds.map((taskId) => (
                          <div key={taskId} className="rounded border border-[#2c3f66] bg-[#101f39] p-2 text-sm text-[#dbe3f0]">
                            {actionTasks.find((task) => Number(task.id) === Number(taskId))?.title || t("admin.engagement.items.unknownTask")}
                          </div>
                        ))}
                      </div>
                    )}
                    {qrWizardActionId && <p className="text-xs text-[#93a3c2]">{t("admin.engagement.wizard.selectedActionHint")}</p>}
                    <input
                      value={qrWizardTaskTitle}
                      disabled={Boolean(qrWizardActionId)}
                      onChange={(event) => setQrWizardTaskTitle(event.target.value)}
                      className="qr-wizard-input w-full border p-2 rounded text-black"
                      placeholder={t("admin.engagement.wizard.taskTitle")}
                      maxLength={200}
                    />
                    <textarea
                      value={qrWizardTaskDescription}
                      disabled={Boolean(qrWizardActionId)}
                      onChange={(event) => setQrWizardTaskDescription(event.target.value)}
                      className="qr-wizard-input w-full border p-2 rounded text-black"
                      placeholder={t("admin.engagement.wizard.taskDescription")}
                      rows="3"
                      maxLength={2000}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => setQrWizardStep(2)} className="qr-wizard-back-button flex-1 rounded border border-[#2c3f66] bg-[#182742] px-4 py-2 font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">{t("admin.engagement.wizard.back")}</button>
                      <button type="button" onClick={handleContinueFromTaskStep} className="flex-1 rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">{t("admin.engagement.wizard.next")}</button>
                    </div>
                  </div>
                )}

                {qrWizardStep === 4 && qrWizardCampaign && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step4Title")}</h3>
                    <p className="text-xs text-[#93a3c2]">{t("admin.engagement.items.reviewSitesHint")}</p>
                    {(workspaceProfile.reviewPlatforms || []).length === 0 ? (
                      <p className="rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-300">{t("admin.engagement.items.reviewSitesEmpty")}</p>
                    ) : (
                      <div className="space-y-2">
                        {workspaceProfile.reviewPlatforms.map((platform) => (
                          <label key={platform.url} className="flex items-center gap-2 text-sm text-[#dbe3f0]">
                            <input
                              type="checkbox"
                              checked={selectedQrReviewPlatforms.includes(platform.url)}
                              onChange={() => toggleQrReviewPlatform(platform.url)}
                            />
                            <span>{platform.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="qr-wizard-benefits space-y-2 rounded border border-[#2c3f66] bg-[#182742] p-3">
                      <p className="text-sm font-semibold text-[#f4f7fb]">{t("admin.engagement.items.voterBenefitsTitle")}</p>
                      <p className="text-xs text-[#93a3c2]">{t("admin.engagement.items.voterBenefitsHint")}</p>
                      {itemsForCampaign(qrWizardCampaign.id)
                        .filter((item) => item.item_type === "poll")
                        .map((item) => {
                          const poll = polls.find((candidate) => String(candidate.id) === String(item.poll_id));
                          const hasEmailBenefit = poll?.email_benefit_type && poll.email_benefit_type !== "none";
                          return (
                            <div key={item.id} className="rounded border border-[#385277] bg-[#10203a] p-2 text-xs">
                              <p className="font-semibold text-[#f4f7fb]">{poll?.question || t("admin.engagement.items.unknownPoll")}</p>
                              <p className="mt-1 text-[#dbe3f0]">
                                {hasEmailBenefit
                                  ? t("admin.engagement.items.emailBenefitConfigured", { benefit: poll.email_benefit_type === "voucher" ? t("thankYou.voucher") : t("thankYou.discountCode") })
                                  : t("admin.engagement.items.emailBenefitNotConfigured")}
                              </p>
                            </div>
                          );
                        })}
                      {itemsForCampaign(qrWizardCampaign.id).filter((item) => item.item_type === "poll").length === 0 && (
                        <p className="text-xs text-[#93a3c2]">{t("admin.engagement.items.addPollForBenefits")}</p>
                      )}
                    </div>
                    <p className="text-xs text-[#93a3c2]">{t("admin.engagement.items.reviewSitesSelectionNote")}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setQrWizardStep(3)} className="qr-wizard-back-button flex-1 rounded border border-[#2c3f66] bg-[#182742] px-4 py-2 font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">{t("admin.engagement.wizard.back")}</button>
                      <button onClick={handleContinueFromReviewStep} className="flex-1 rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">{t("admin.engagement.wizard.next")}</button>
                    </div>
                  </div>
                )}

                {DONATION_FEATURE_ENABLED && qrWizardStep === 5 && qrWizardCampaign && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step5Title")}</h3>
                    <p className="text-xs text-[#93a3c2]">{t("admin.engagement.items.sectionDonationHint")}</p>
                    {donationSettings.is_enabled ? (
                      <button onClick={handleAddDonationItemFromWizard} disabled={!DONATION_FEATURE_ENABLED} className="w-full rounded bg-[#0f766e] px-4 py-2 font-semibold text-[#f8fafc] hover:bg-[#0d6259] disabled:cursor-not-allowed disabled:opacity-50">
                        {t("admin.engagement.items.addDonationOption")}
                      </button>
                    ) : (
                      <p className="rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-300">
                        {t("admin.engagement.items.enableDonationsNote")}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => setQrWizardStep(4)} className="qr-wizard-back-button flex-1 rounded border border-[#2c3f66] bg-[#182742] px-4 py-2 font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">{t("admin.engagement.wizard.back")}</button>
                      <button onClick={() => setQrWizardStep(6)} className="flex-1 rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">{t("admin.engagement.wizard.next")}</button>
                    </div>
                  </div>
                )}

                {qrWizardStep === 6 && qrWizardCampaign && (() => {
                  const wizardUrl = buildEggUrl(window.location.origin, qrWizardCampaign.token, "qr");
                  const nfcUrl = buildEggUrl(window.location.origin, qrWizardCampaign.token, "nfc");
                  const showQr = eggAccessChoice !== "nfc";
                  const showNfc = eggAccessChoice !== "qr";
                  return (
                    <div className="space-y-3 text-center">
                      <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step6Title")}</h3>
                      <p className="text-sm text-[#c3cede]">{t("admin.engagement.wizard.accessMethodSelected", { method: t(`admin.engagement.wizard.accessMethods.${eggAccessChoice}.title`) })}</p>
                      {showQr && (
                        <div className="space-y-3 rounded border border-[#2c3f66] bg-[#10203a] p-3">
                          <h4 className="font-semibold text-[#f4f7fb]">{t("admin.engagement.wizard.qrSetupTitle")}</h4>
                          <div className="flex justify-center">
                            <img src={getCampaignQrImageUrl(wizardUrl, 220)} alt={t("admin.engagement.campaigns.qrAlt", { name: qrWizardCampaign.name })} className="h-40 w-40 rounded border border-[#24345c] bg-white p-2" />
                          </div>
                          <p className="truncate text-xs text-[#8ab4f8]">{wizardUrl}</p>
                          <button type="button" onClick={() => navigator.clipboard.writeText(wizardUrl)} className="rounded border border-[#385277] px-3 py-2 text-sm font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">
                            {t("admin.engagement.campaigns.copyLink")}
                          </button>
                          <div className="text-left">
                            <label className="mb-1 block text-xs font-semibold text-[#c3cede]">{t("admin.polls.card.printFormat")}</label>
                            <select value={qrPrintFormat} onChange={(event) => setQrPrintFormat(event.target.value)} className="w-full border p-2 rounded text-black">
                              <option value="letter">{t("admin.polls.card.formats.letter")}</option>
                              <option value="a4">{t("admin.polls.card.formats.a4")}</option>
                              <option value="a5">{t("admin.polls.card.formats.a5")}</option>
                              <option value="a6">{t("admin.polls.card.formats.a6")}</option>
                              <option value="a3">{t("admin.polls.card.formats.a3")}</option>
                              <option value="postcard">{t("admin.polls.card.formats.postcard")}</option>
                              <option value="beerHolder">{t("admin.polls.card.formats.beerHolder")}</option>
                              <option value="ticket">{t("admin.polls.card.formats.ticket")}</option>
                            </select>
                          </div>
                          <div className="flex flex-wrap justify-center gap-2">
                            <button onClick={() => downloadCampaignQr(qrWizardCampaign, wizardUrl)} className="rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">
                              {t("admin.polls.card.downloadQr")}
                            </button>
                            <button onClick={() => printCampaignQr(qrWizardCampaign, wizardUrl)} className="rounded bg-[#0f766e] px-4 py-2 font-semibold text-[#f8fafc] hover:bg-[#0d6259]">
                              {t("admin.polls.card.printQr")}
                            </button>
                            <button onClick={() => openQrModifier(qrWizardCampaign, wizardUrl)} className="rounded bg-violet-600 px-4 py-2 font-semibold text-white hover:bg-violet-700">
                              {t("admin.polls.card.modifyQr")}
                            </button>
                          </div>
                        </div>
                      )}
                      {showNfc && (
                        <div className="space-y-2 rounded border border-violet-800 bg-violet-950/30 p-3 text-left">
                          <h4 className="font-semibold text-[#f4f7fb]">{t("admin.engagement.wizard.nfcSetupTitle")}</h4>
                          <p className="break-all text-xs text-violet-200">{nfcUrl}</p>
                          <button type="button" onClick={() => navigator.clipboard.writeText(nfcUrl)} className="rounded bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600">
                            {t("admin.engagement.campaigns.copyNfcLink")}
                          </button>
                          <p className="text-xs text-[#c3cede]">{t("admin.engagement.wizard.nfcSetupHint")}</p>
                        </div>
                      )}
                      {eggAccessChoice !== "both" && (
                        <p className="text-xs text-[#93a3c2]">{t("admin.engagement.wizard.changeMethodLater")}</p>
                      )}

                      <div className="border-t border-[#24345c] pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f2c744]">{t("admin.engagement.wizard.previewTitle")}</p>
                        <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[24px] border-4 border-[#24345c] bg-white shadow-lg">
                          <iframe src={`${wizardUrl}?preview=1`} title={t("admin.engagement.wizard.previewTitle")} className="h-[440px] w-full border-0" />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => setQrWizardStep(4)} className="qr-wizard-back-button flex-1 rounded border border-[#2c3f66] bg-[#182742] px-4 py-2 font-semibold text-[#dbe3f0] hover:bg-[#1f3252]">{t("admin.engagement.wizard.back")}</button>
                        <button onClick={closeQrWizard} className="flex-1 rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">{t("admin.engagement.wizard.finish")}</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {qrCampaigns.length === 0 ? <p className="text-gray-400">{t("admin.engagement.campaigns.noCampaigns")}</p> : qrCampaigns.map((campaign) => {
              const url = buildEggUrl(window.location.origin, campaign.token, "qr");
              const nfcUrl = buildEggUrl(window.location.origin, campaign.token, "nfc");
              const accessCounts = eggAccessCounts[String(campaign.id)] || { qr: 0, nfc: 0 };
              const previewUrl = new URL(url);
              previewUrl.searchParams.set("preview", "1");
              const goalKeys = getCampaignGoalKeys(campaign);
              return (
                <article key={campaign.id} id={`egg-card-${campaign.id}`} className="egg-location-card">
                  <header className="egg-card-header">
                    <div className="egg-card-identity">
                      <div className="egg-card-eyebrow">
                        <span className="egg-type-label">Egg</span>
                        <span className={`egg-status ${campaign.is_active ? "is-active" : "is-paused"}`}>
                          <span aria-hidden="true" />
                          {campaign.is_active ? t("admin.engagement.campaigns.active") : t("admin.engagement.campaigns.paused")}
                        </span>
                      </div>
                      <h3 className="egg-card-title">{campaign.name}</h3>
                      <p className="egg-card-placement">
                        {campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}
                        {campaign.variant_label ? ` · ${campaign.variant_label}` : ""}
                      </p>
                    </div>
                    <div className="egg-card-manage-actions">
                      <button onClick={() => navigator.clipboard.writeText(url)} className="egg-action egg-action-primary">{t("admin.engagement.campaigns.copyLink")}</button>
                      {canReuseQr && <button onClick={() => beginEditEgg(campaign)} className="egg-action egg-action-secondary">{t("admin.engagement.campaigns.editEgg")}</button>}
                      {permission.canDeletePolls && <button onClick={() => handleDeleteQrCampaign(campaign.id, campaign.name)} className="egg-action egg-action-danger">{t("admin.engagement.campaigns.delete")}</button>}
                    </div>
                  </header>

                  <section className="egg-card-goals" aria-label={t("admin.hub.goal", { defaultValue: "Goal" })}>
                    <span className="egg-card-section-label">{t("admin.hub.goal", { defaultValue: "Goal" })}</span>
                    <div className="egg-card-goal-list">
                      {goalKeys.length
                        ? goalKeys.map((key) => <span className="egg-target" key={key}>{t(`quickStart.goals.${key}.title`)}</span>)
                        : <span className="egg-card-no-goal">{t("admin.eggResults.noGoal", { defaultValue: "No target set" })}</span>}
                    </div>
                  </section>

                  <div
                    className="egg-card-stats"
                    aria-label={`${t("admin.engagement.campaigns.qrAccessCount", { count: accessCounts.qr })}; ${t("admin.engagement.campaigns.nfcAccessCount", { count: accessCounts.nfc })}`}
                  >
                    <div><span>QR</span><strong>{accessCounts.qr}</strong><small>{t("admin.engagement.campaigns.qrAccessLabel", { defaultValue: "Scans" })}</small></div>
                    <div><span>NFC</span><strong>{accessCounts.nfc}</strong><small>{t("admin.engagement.campaigns.nfcAccessLabel", { defaultValue: "Taps" })}</small></div>
                  </div>

                  {editingEggId === campaign.id && (
                    <div className="egg-edit-form mt-3 grid gap-2 rounded border p-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">
                        {t("admin.engagement.campaigns.nameLabel")}
                        <input value={eggEditName} maxLength={120} onChange={(event) => setEggEditName(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm" />
                      </label>
                      <label className="text-xs font-semibold">
                        {t("admin.engagement.campaigns.placementLabel")}
                        <input value={eggEditPlacement} maxLength={80} onChange={(event) => setEggEditPlacement(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm" />
                      </label>
                      <fieldset className="egg-edit-goals sm:col-span-2">
                        <legend className="text-xs font-semibold">{t("admin.hub.goal", { defaultValue: "Goal" })}</legend>
                        <div className="egg-edit-goal-list">
                          {START_GOALS.map((goal) => {
                            const selectedGoal = eggEditGoals.includes(goal.key);
                            const lockedGoal = Boolean(goal.feature && !entitlements[goal.feature]);
                            return <label key={goal.key} className={selectedGoal ? "is-selected" : ""}>
                              <input
                                type="checkbox"
                                checked={selectedGoal}
                                disabled={lockedGoal && !selectedGoal}
                                onChange={() => setEggEditGoals((current) => selectedGoal
                                  ? current.filter((key) => key !== goal.key)
                                  : [...current, goal.key])}
                              />
                              <span>{t(`quickStart.goals.${goal.key}.title`)}</span>
                            </label>;
                          })}
                        </div>
                        {eggEditGoals.length > 0 && <button type="button" className="egg-edit-clear-goals" onClick={() => setEggEditGoals([])}>
                          {t("admin.eggResults.noGoal", { defaultValue: "No target set" })}
                        </button>}
                      </fieldset>
                      <div className="flex gap-2 sm:col-span-2">
                        <button onClick={() => saveEggDetails(campaign.id)} className="egg-edit-save rounded px-3 py-2 text-sm font-semibold">{t("admin.engagement.campaigns.saveEgg")}</button>
                        <button onClick={() => setEditingEggId(null)} className="egg-edit-cancel rounded border px-3 py-2 text-sm font-semibold">{t("admin.engagement.campaigns.cancelEditEgg")}</button>
                      </div>
                    </div>
                  )}



                  <section className="egg-card-share">
                    <div className="egg-card-share-content">
                      <div>
                        <h4>{t("admin.engagement.campaigns.shareTitle", { defaultValue: "Share your Egg" })}</h4>
                        <p>{t("admin.engagement.campaigns.shareHint", { defaultValue: "Preview the customer experience or prepare your QR and NFC access." })}</p>
                      </div>
                      <div className="egg-card-share-actions">
                        <button
                          onClick={() => window.open(previewUrl.toString(), "_blank", "noopener,noreferrer")}
                          className="egg-action egg-action-primary"
                        >
                          {t("admin.engagement.campaigns.viewVisitorExperience")}
                        </button>
                        <EggNfcSetup url={nfcUrl} t={t} />
                        <button onClick={() => downloadCampaignQr(campaign, url)} className="egg-action egg-action-secondary">{t("admin.polls.card.downloadQr")}</button>
                        <button onClick={() => printCampaignQr(campaign, url)} className="egg-action egg-action-secondary">{t("admin.polls.card.printQr")}</button>
                        <button onClick={() => openQrModifier(campaign, url)} className="egg-action egg-action-secondary">{t("admin.polls.card.modifyQr")}</button>
                      </div>
                    </div>
                  </section>

                  {(() => {
                    const items = itemsForCampaign(campaign.id);
                    const itemPollIds = new Set(items.filter((item) => item.item_type === "poll").map((item) => item.poll_id));
                    const pollCount = itemPollIds.size + (campaign.poll_id && !itemPollIds.has(campaign.poll_id) ? 1 : 0);
                    const infoCount = items.filter((item) => item.item_type === "info").length;
                    const hasDonation = DONATION_FEATURE_ENABLED && items.some((item) => item.item_type === "donation");
                    const rewardCount = items.filter((item) => item.item_type === "reward").length;
                    if (pollCount <= 1 && infoCount === 0 && !hasDonation && rewardCount === 0) {
                      return null;
                    }
                    return (
                      <div className="egg-card-content-summary">
                        {pollCount > 0 && (
                          <span className="egg-content-pill">
                            {pollCount} {pollCount === 1 ? t("admin.engagement.campaigns.summaryPoll") : t("admin.engagement.campaigns.summaryPollPlural")}
                          </span>
                        )}
                        {infoCount > 0 && (
                          <span className="egg-content-pill">
                            {infoCount} {infoCount === 1 ? t("admin.engagement.campaigns.summaryInfoCard") : t("admin.engagement.campaigns.summaryInfoCardPlural")}
                          </span>
                        )}
                        {hasDonation && (
                          <span className="egg-content-pill">
                            {t("admin.engagement.campaigns.summaryDonation")}
                          </span>
                        )}
                        {rewardCount > 0 && (
                          <span className="egg-content-pill">
                            {rewardCount} {rewardCount === 1 ? t("admin.engagement.campaigns.summaryReward") : t("admin.engagement.campaigns.summaryRewardPlural")}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {false && <div className="egg-card-content-summary">
                    <label className="text-xs text-slate-400">{t("admin.engagement.campaigns.changePoll")}</label>
                    <select
                      value={campaign.poll_id ? String(campaign.poll_id) : ""}
                      onChange={(event) => reassignQrCampaignPoll(campaign.id, event.target.value)}
                      className="border p-1.5 rounded text-black text-sm"
                    >
                      <option value="">{t("admin.engagement.scanner.choosePoll")}</option>
                      {polls.map((poll) => <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>)}
                    </select>
                  </div>}


                </article>
              );
            })}
          </div>

        </div>
      </section>
      )}

      {activeTab === "engagement" && (
      <details className="mb-6 border rounded bg-gray-900 p-4">
        <summary className="text-xl font-bold">{t("admin.engagement.scanner.title")}</summary>
        <p className="mt-1 mb-3 text-sm text-slate-400">{t("admin.engagement.scanner.subtitle")}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={() => { setScannerOpen(true); setScanMessage(""); }} className="bg-teal-500 text-slate-950 px-4 py-2 rounded font-semibold">
            {t("admin.engagement.scanner.openCamera")}
          </button>
          <input
            value={scanLookupValue}
            onChange={(event) => setScanLookupValue(event.target.value)}
            placeholder={t("admin.engagement.scanner.pastePlaceholder")}
            className="flex-1 border p-2 rounded text-black"
          />
          <button onClick={() => lookUpScannedQr(scanLookupValue)} className="egg-scanner-lookup px-4 py-2 rounded font-semibold">
            {t("admin.engagement.scanner.lookUp")}
          </button>
        </div>
        {scanMessage && <p className="mt-3 text-sm text-amber-300">{scanMessage}</p>}
        {scanResult && (
          <div className="mt-4 rounded border border-teal-700 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">{scanResult.campaign.name}</p>
            <p className="mt-1 text-sm text-slate-400">
              {scanResult.campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}{scanResult.campaign.variant_label ? ` · ${scanResult.campaign.variant_label}` : ""}
            </p>
            <p className="mt-3 font-semibold">{scanResult.currentPoll?.question || t("admin.engagement.scanner.noPollAssigned")}</p>
            <label className="mt-4 block text-sm font-semibold">{t("admin.engagement.scanner.redirectLabel")}</label>
            <select
              value={scanResult.campaign.poll_id ? String(scanResult.campaign.poll_id) : ""}
              onChange={(event) => changeScannedPoll(event.target.value)}
              className="mt-2 w-full rounded border p-2 text-black"
            >
              <option value="">{t("admin.engagement.scanner.choosePoll")}</option>
              {scanResult.polls.map((poll) => (
                <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>
              ))}
            </select>
            <Link to={`/create?campaign=${scanResult.campaign.id}`} className="mt-3 block rounded bg-teal-400 px-4 py-2 text-center font-semibold text-slate-950">
              {t("admin.engagement.scanner.createNewPoll")}
            </Link>
          </div>
        )}
      </details>
      )}

      {qrModifier && (() => {
        const generatedStyle = generateQrStyle(qrModifier.seed, qrModifier.preset);
        return (
          <div className="godwit-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modify-qr-title">
            <div className="godwit-dialog-panel qr-modifier-modal max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="modify-qr-title" className="text-xl font-bold">{t("admin.polls.card.modifyQr")}</h2>
                  <p className="mt-1 text-sm text-slate-300">{t("admin.polls.card.modifyQrHint")}</p>
                </div>
                <button type="button" onClick={() => setQrModifier(null)} className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800">
                  {t("admin.polls.card.cancel")}
                </button>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="space-y-4">
                  <label className="block text-sm font-semibold">
                    {t("admin.polls.card.modifyQrText")}
                    <textarea
                      value={qrModifier.text}
                      maxLength={120}
                      onChange={(event) => setQrModifier({ ...qrModifier, text: event.target.value })}
                      className="mt-1 w-full rounded border border-slate-600 bg-white p-2 text-black"
                      rows="3"
                      placeholder={t("admin.polls.card.modifyQrTextPlaceholder")}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    {t("admin.polls.card.logo")}
                    <input
                      type="text"
                      value={qrModifier.logoUrl || ""}
                      onChange={(event) => setQrModifier({ ...qrModifier, logoUrl: event.target.value })}
                      className="mt-1 w-full rounded border border-slate-600 bg-white p-2 text-black"
                      placeholder={t("admin.polls.card.logoUrlPlaceholder")}
                    />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setQrModifier((current) => ({ ...current, logoUrl: String(reader.result || "") }));
                        reader.readAsDataURL(file);
                      }}
                      className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-300">{t("admin.polls.card.logoHint")}</span>
                  </label>
                  <label className="block text-sm font-semibold">
                    {t("admin.polls.card.backgroundTemplate")}
                    <select
                      value={qrModifier.preset}
                      onChange={(event) => setQrModifier({ ...qrModifier, preset: event.target.value, seed: qrModifier.seed + 1 })}
                      className="mt-1 w-full rounded border border-slate-600 bg-white p-2 text-black"
                    >
                      <option value="brand">{t("admin.polls.card.templates.brand")}</option>
                      <option value="ocean">{t("admin.polls.card.templates.ocean")}</option>
                      <option value="sunset">{t("admin.polls.card.templates.sunset")}</option>
                      <option value="botanical">{t("admin.polls.card.templates.botanical")}</option>
                      <option value="midnight">{t("admin.polls.card.templates.midnight")}</option>
                      <option value="paper">{t("admin.polls.card.templates.paper")}</option>
                      <option value="celebration">{t("admin.polls.card.templates.celebration")}</option>
                      <option value="fresh">{t("admin.polls.card.templates.fresh")}</option>
                      <option value="premium">{t("admin.polls.card.templates.premium")}</option>
                      <option value="lavender">{t("admin.polls.card.templates.lavender")}</option>
                      <option value="terracotta">{t("admin.polls.card.templates.terracotta")}</option>
                      <option value="aurora">{t("admin.polls.card.templates.aurora")}</option>
                      <option value="coastal">{t("admin.polls.card.templates.coastal")}</option>
                      <option value="citrus">{t("admin.polls.card.templates.citrus")}</option>
                    </select>
                  </label>
                  <p className="text-xs text-slate-300">{t("admin.polls.card.backgroundTemplateHint")}</p>
                </div>
                <div className="qr-modifier-preview rounded-xl bg-cover bg-center p-4 text-center shadow-lg" style={{ backgroundImage: generatedStyle.background }}>
                  {qrModifier.logoUrl && <img src={qrModifier.logoUrl} alt={t("admin.polls.card.logoAlt")} className="mx-auto mb-3 max-h-14 max-w-40 object-contain" />}
                  <p className="mb-3 text-sm font-bold text-slate-900">{qrModifier.text || qrModifier.campaign.name}</p>
                  <div className="mx-auto w-fit rounded-xl border-8 border-[#0b1a33] bg-white p-3 shadow-lg">
                    <img src={getCampaignQrImageUrl(qrModifier.url, 220)} alt={t("admin.engagement.campaigns.qrAlt", { name: qrModifier.campaign.name })} className="h-44 w-44" />
                  </div>
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-900">{qrModifier.campaign.name}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-4">
                <button type="button" onClick={() => downloadCampaignQr(qrModifier.campaign, qrModifier.url, qrModifier)} className="rounded bg-[#f2c744] px-4 py-2 font-semibold text-[#0b1a33] hover:bg-[#e3b93c]">
                  {t("admin.polls.card.downloadQr")}
                </button>
                <button type="button" onClick={() => printCampaignQr(qrModifier.campaign, qrModifier.url, qrModifier)} className="rounded bg-[#0f766e] px-4 py-2 font-semibold text-white hover:bg-[#0d6259]">
                  {t("admin.polls.card.printQr")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {scannerOpen && <QrScanner onDecode={handleScanDecode} onClose={() => setScannerOpen(false)} />}


      {activeTab === "feedback" && (
      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.feedback.messages.title")}</summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-sm text-slate-400">{t("admin.feedback.messages.subtitle")}</p>
          {organizerMessages.length === 0 ? <p className="text-sm text-slate-400">{t("admin.feedback.messages.noMessages")}</p> : <div className="space-y-3">{organizerMessages.map((message) => (
            <article key={message.id} className="rounded border border-slate-700 p-3">
              <p>{message.message}</p>
              <p className="mt-2 text-xs text-slate-400">{t("admin.engagement.locations.pollNumber", { id: message.poll_id })} · {new Date(message.created_at).toLocaleString()}</p>
              {message.reply_email && <a className="mt-2 inline-block text-sm text-teal-300 underline" href={`mailto:${message.reply_email}`}>{t("admin.feedback.messages.replyToVoter")}</a>}
            </article>
          ))}</div>}
        </div>
      </details>
      )}


      {activeTab === "feedback" && (
      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.feedback.moderation.title")}</summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-sm text-slate-400">{t("admin.feedback.moderation.subtitle")}</p>
          {moderationMessage && <output className="mb-3 block text-sm text-teal-300">{moderationMessage}</output>}
          {contentReports.length === 0 ? <p className="text-sm text-slate-400">{t("admin.feedback.moderation.noReports")}</p> : <div className="space-y-3">{contentReports.map((report) => (
            <article key={report.id} className="rounded border border-slate-700 p-3">
              <p className="font-semibold">{report.reported_answer}</p>
              <p className="mt-1 text-sm text-slate-400">{t("admin.feedback.moderation.pollLabel", { id: report.poll_id })} · {report.reason} · {report.status}</p>
              {report.status === "open" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => reviewContentReport(report, "hidden")} className="rounded bg-red-700 px-3 py-2 text-white">{t("admin.feedback.moderation.hideAnswer")}</button>
                  <button onClick={() => reviewContentReport(report, "reviewed")} className="rounded border px-3 py-2">{t("admin.feedback.moderation.markReviewed")}</button>
                  <button onClick={() => reviewContentReport(report, "dismissed")} className="rounded border px-3 py-2">{t("admin.feedback.moderation.dismiss")}</button>
                </div>
              )}
            </article>
          ))}</div>}
        </div>
      </details>
      )}


      {activeTab === "feedback" && (
      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.feedback.sentiment.title")}</summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-sm text-slate-400">{t("admin.feedback.sentiment.subtitle")}</p>
          <div className="space-y-2 text-sm">
            {Object.keys(sentimentSummary).length === 0 ? (
              <p className="text-gray-400">{t("admin.feedback.sentiment.noAnswers")}</p>
            ) : (
              Object.entries(sentimentSummary).map(([pollId, counts]) => {
                const total = counts.positive + counts.neutral + counts.negative;
                const poll = polls.find((item) => String(item.id) === String(pollId));
                return (
                  <div key={pollId} className="border-b border-gray-700 py-2">
                    <span>#{pollId}{poll ? ` - ${poll.question}` : ""}: </span>
                    <span className="text-emerald-300">{t("admin.feedback.sentiment.positive", { percent: Math.round((counts.positive / total) * 100) })}</span>
                    {" · "}
                    <span className="text-slate-300">{t("admin.feedback.sentiment.neutral", { percent: Math.round((counts.neutral / total) * 100) })}</span>
                    {" · "}
                    <span className="text-red-300">{t("admin.feedback.sentiment.negative", { percent: Math.round((counts.negative / total) * 100) })}</span>
                    <span className="text-gray-500"> {t("admin.feedback.sentiment.answerCount", { count: total })}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </details>
      )}

      {activeTab === "feedback" && (
      <>
      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.feedback.updates.title")}</summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-sm text-slate-400">{t("admin.feedback.updates.subtitle")}</p>
          <div className="grid gap-3 md:grid-cols-3 mb-3">
            <textarea value={newUpdateMessage} onChange={(event) => setNewUpdateMessage(event.target.value)} rows="2" maxLength={500} className="md:col-span-2 border p-2 rounded text-black" placeholder={t("admin.feedback.updates.placeholder")} />
            <select value={newUpdatePollId} onChange={(event) => setNewUpdatePollId(event.target.value)} className="border p-2 rounded text-black">
              <option value="">{t("admin.feedback.updates.allPolls")}</option>
              {polls.map((poll) => <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>)}
            </select>
          </div>
          <button onClick={postWorkspaceUpdate} className="bg-teal-500 text-slate-950 px-4 py-2 rounded font-semibold">{t("admin.feedback.updates.postButton")}</button>
          <div className="mt-4 space-y-2 text-sm">
            {workspaceUpdates.length === 0 ? (
              <p className="text-gray-400">{t("admin.feedback.updates.noUpdates")}</p>
            ) : (
              workspaceUpdates.map((update) => (
                <div key={update.id} className="flex items-start justify-between gap-3 border-b border-gray-700 py-2">
                  <div>
                    <p>{update.message}</p>
                    <p className="text-xs text-gray-500">{update.poll_id ? t("admin.polls.card.pollNumber", { id: update.poll_id }) : t("admin.feedback.updates.allPolls")} · {new Date(update.created_at).toLocaleString()}</p>
                  </div>
                  <button onClick={() => deleteWorkspaceUpdate(update.id)} className="shrink-0 text-xs text-red-300 underline">{t("admin.engagement.locations.delete")}</button>
                </div>
              ))
            )}
          </div>
        </div>
      </details>

      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.feedback.recovery.title")}</summary>
        <div className="px-4 pb-4 space-y-5">
          <div><p className="mb-2 text-sm text-slate-400">{t("admin.feedback.recovery.openAlertsHint")}</p><div className="text-sm">{feedbackAlerts.filter((alert) => alert.status !== "resolved").length ? feedbackAlerts.filter((alert) => alert.status !== "resolved").map((alert) => <div key={alert.id} className="flex items-center justify-between gap-2 border-b border-gray-700 py-1"><span>{t("admin.polls.card.pollNumber", { id: alert.poll_id })}: {alert.answer}</span><button onClick={async () => { const { error } = await supabase.from("feedback_alerts").update({ status: "resolved" }).eq("id", alert.id); if (!error) setFeedbackAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, status: "resolved" } : item)); }} className="shrink-0 text-xs text-emerald-300 underline">{t("admin.feedback.recovery.resolve")}</button></div>) : <p className="text-gray-400">{t("admin.feedback.recovery.noOpenAlerts")}</p>}</div></div>
          <div><p className="mb-2 text-sm text-slate-400">{t("admin.feedback.recovery.createAlertHint")}</p><div className="grid md:grid-cols-4 gap-3"><select value={newRulePollId} onChange={(event) => setNewRulePollId(event.target.value)} className="border p-2 rounded text-black"><option value="">{t("admin.engagement.scanner.choosePoll")}</option>{polls.map((poll) => <option key={poll.id} value={poll.id}>#{poll.id} - {poll.question}</option>)}</select><select value={newRuleType} onChange={(event) => setNewRuleType(event.target.value)} className="border p-2 rounded text-black"><option value="low_score">{t("admin.feedback.recovery.lowScore")}</option><option value="answer_match">{t("admin.feedback.recovery.exactAnswer")}</option></select>{newRuleType === "low_score" ? <input type="number" min="0" max="10" value={newRuleThreshold} onChange={(event) => setNewRuleThreshold(event.target.value)} className="border p-2 rounded text-black" placeholder={t("admin.feedback.recovery.scoreAtOrBelow")} /> : <input value={newRuleAnswer} onChange={(event) => setNewRuleAnswer(event.target.value)} className="border p-2 rounded text-black" placeholder={t("admin.feedback.recovery.answerTrigger")} />}<button onClick={createAlertRule} className="bg-violet-600 text-white px-4 py-2 rounded font-semibold">{t("admin.feedback.recovery.addAlertRule")}</button></div><div className="mt-3 text-sm">{alertRules.length ? alertRules.map((rule) => <p key={rule.id} className="border-b border-gray-700 py-1">{t("admin.polls.card.pollNumber", { id: rule.poll_id })}: {rule.trigger_type === "low_score" ? t("admin.feedback.recovery.scoreAtOrBelowValue", { value: rule.score_threshold }) : t("admin.feedback.recovery.answerMatchValue", { value: rule.answer_match })}</p>) : <p className="text-gray-400">{t("admin.feedback.recovery.noRulesYet")}</p>}</div></div>
          <div><p className="mb-2 text-sm text-slate-400">{t("admin.feedback.recovery.taskHint")}</p><div className="grid md:grid-cols-3 gap-3"><input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} className="border p-2 rounded text-black" placeholder={t("admin.feedback.recovery.taskPlaceholder")} /><select value={newTaskAlertId} onChange={(event) => setNewTaskAlertId(event.target.value)} className="border p-2 rounded text-black"><option value="">{t("admin.feedback.recovery.noLinkedAlert")}</option>{feedbackAlerts.filter((alert) => alert.status !== "resolved").map((alert) => <option key={alert.id} value={alert.id}>#{alert.id} {t("admin.polls.card.pollNumber", { id: alert.poll_id })}: {alert.answer}</option>)}</select><button onClick={createRecoveryTask} className="bg-emerald-600 text-white px-4 py-2 rounded font-semibold">{t("admin.feedback.recovery.addTask")}</button></div><div className="mt-3 text-sm">{recoveryTasks.length ? recoveryTasks.map((task) => <div key={task.id} className="flex justify-between border-b border-gray-700 py-1"><span>{task.title}</span><select value={task.status} onChange={async (event) => { const status = event.target.value; const { error } = await supabase.from("feedback_recovery_tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", task.id); if (!error) setRecoveryTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item)); }} className="text-black"><option value="open">{t("admin.feedback.recovery.statusOpen")}</option><option value="in_progress">{t("admin.feedback.recovery.statusInProgress")}</option><option value="done">{t("admin.feedback.recovery.statusDone")}</option></select></div>) : <p className="text-gray-400">{t("admin.feedback.recovery.noTasksYet")}</p>}</div></div>
          {entitlements.weeklyReport ? (
          <div><p className="mb-2 text-sm text-slate-400">{t("admin.feedback.recovery.weeklyReportHint")}</p><div className="grid md:grid-cols-3 gap-3 items-center"><input type="email" value={reportSettings.recipient_email} onChange={(event) => setReportSettings((current) => ({ ...current, recipient_email: event.target.value }))} className="border p-2 rounded text-black" placeholder="manager@example.com" /><label className="flex gap-2 items-center"><input type="checkbox" checked={reportSettings.is_enabled} onChange={(event) => setReportSettings((current) => ({ ...current, is_enabled: event.target.checked }))} /> {t("admin.feedback.recovery.enableWeeklyReport")}</label><button onClick={saveReportSettings} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold">{t("admin.feedback.recovery.saveReportSettings")}</button></div></div>
          ) : (
            <LockedFeature
              feature="weeklyReport"
              title={t("admin.feedback.recovery.lockedTitle")}
              description={t("admin.feedback.recovery.lockedDescription")}
            />
          )}
        </div>
      </details>
      </>
      )}

      {activeTab === "settings" && (
      <>
      <header className="hub-page-heading">
        <p className="goal-eyebrow">{t("admin.hub.settings", { defaultValue: "Settings" })}</p>
        <h2>{t("admin.hub.settings", { defaultValue: "Settings" })}</h2>
        <p>{t("admin.settingsIntro", { defaultValue: "Manage your customer review links." })}</p>
      </header>
      {DONATION_FEATURE_ENABLED && <details id="donation-settings" className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.engagement.donations.title")}</summary>
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
            {t("admin.engagement.donations.notEnabled")}
          </div>
          <p className="text-sm text-slate-400">
            {t("admin.engagement.donations.description")}
          </p>
          <div className="rounded border border-amber-700 bg-amber-950/20 p-3 text-sm">
            <p className="font-semibold text-amber-200">{t("admin.engagement.donations.categoryTitle")}</p>
            <p className="mt-1 text-xs text-slate-300">{t("admin.engagement.donations.categoryHelp")}</p>
            <label className="mt-3 block font-semibold">
              {t("admin.engagement.donations.categoryLabel")}
              <select
                value={donationSettings.category || "contribution"}
                disabled={!DONATION_FEATURE_ENABLED}
                onChange={(event) => setDonationSettings((current) => ({ ...current, category: event.target.value }))}
                className="mt-1 w-full border p-2 rounded text-black"
              >
                <option value="tip">{t("admin.engagement.donations.categoryTip")}</option>
                <option value="contribution">{t("admin.engagement.donations.categoryContribution")}</option>
                <option value="donation">{t("admin.engagement.donations.categoryDonation")}</option>
              </select>
            </label>
            <p className="mt-2 text-xs text-slate-400">{t("admin.engagement.donations.categoryDisclaimer")}</p>
          </div>

          <div className="rounded border border-slate-700 bg-slate-950 p-4">
            {donationSettings.stripe_charges_enabled ? (
              <p className="text-sm font-semibold text-green-400">✓ {t("admin.engagement.donations.stripeConnected")}</p>
            ) : donationSettings.stripe_account_id ? (
              <p className="text-sm font-semibold text-amber-300">{t("admin.engagement.donations.stripeStarted")}</p>
            ) : (
              <>
                <p className="text-sm text-slate-400">{t("admin.engagement.donations.stripeNotConnected")}</p>
                <p className="mt-2 text-xs text-slate-500">{t("admin.engagement.donations.beforeYouConnect")}</p>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={connectStripeHandler} disabled={!DONATION_FEATURE_ENABLED || stripeConnectBusy} className="bg-violet-600 text-white px-4 py-2 rounded font-semibold disabled:opacity-60">
                {donationSettings.stripe_account_id ? t("admin.engagement.donations.continueSetup") : t("admin.engagement.donations.connectStripe")}
              </button>
              {donationSettings.stripe_account_id && (
                <button onClick={refreshStripeStatusHandler} disabled={!DONATION_FEATURE_ENABLED || stripeConnectBusy} className="bg-slate-700 text-white px-4 py-2 rounded font-semibold disabled:opacity-60">
                  {t("admin.engagement.donations.refreshStatus")}
                </button>
              )}
            </div>
            {stripeConnectError && <p className="mt-2 text-xs font-semibold text-red-400">{stripeConnectError}</p>}
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={donationSettings.is_enabled}
              disabled={!DONATION_FEATURE_ENABLED || !donationSettings.stripe_charges_enabled}
              onChange={(event) => setDonationSettings((current) => ({ ...current, is_enabled: event.target.checked }))}
            />
            <span>{t("admin.engagement.donations.acceptDonations")}{!donationSettings.stripe_charges_enabled && ` ${t("admin.engagement.donations.connectFirst")}`}</span>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block font-semibold">
              {t("admin.engagement.donations.currency")}
              <input
                value={donationSettings.currency || "EUR"}
                disabled={!DONATION_FEATURE_ENABLED}
                onChange={(event) => setDonationSettings((current) => ({ ...current, currency: event.target.value }))}
                maxLength={3}
                className="mt-1 w-full border p-2 rounded text-black uppercase"
                placeholder="EUR"
              />
            </label>
            <label className="block font-semibold">
              {t("admin.engagement.donations.suggestedAmount")}
              <input
                type="number"
                min="0"
                step="0.01"
                value={donationSettings.suggested_amount || ""}
                disabled={!DONATION_FEATURE_ENABLED}
                onChange={(event) => setDonationSettings((current) => ({ ...current, suggested_amount: event.target.value }))}
                className="mt-1 w-full border p-2 rounded text-black"
                placeholder="5.00"
              />
            </label>
          </div>
          <textarea
            value={donationSettings.message || ""}
            disabled={!DONATION_FEATURE_ENABLED}
            onChange={(event) => setDonationSettings((current) => ({ ...current, message: event.target.value }))}
            maxLength={300}
            rows="2"
            className="w-full border p-2 rounded text-black"
            placeholder={t("admin.engagement.donations.messagePlaceholder")}
          />
          <button onClick={saveDonationSettingsHandler} disabled={!DONATION_FEATURE_ENABLED} className="bg-blue-600 text-white px-4 py-2 rounded font-semibold disabled:opacity-60">{t("admin.engagement.donations.saveButton")}</button>
          <p className="text-xs text-slate-500">
            {t("admin.engagement.donations.feeNote")}
          </p>
        </div>
      </details>}
      <details id="review-platform-settings" className="mb-6 border rounded bg-gray-900" open>
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.settings.workspace.reviewPlatforms.title")}</summary>
        <div className="px-4 pb-4">
          {!entitlements.publicReviewLinks && (
            <LockedFeature
              feature="publicReviewLinks"
              title="Invite voters to leave a public review"
              description="Starter and Growth workspaces can add optional links to Google, Tripadvisor, or another review site."
            />
          )}
          {entitlements.publicReviewLinks && <>
          <p className="mb-3 text-sm text-slate-400">{t("admin.settings.workspace.reviewPlatforms.subtitle")}</p>
          {(workspaceProfile.reviewPlatforms || []).map((platform, index) => (
            <div key={`${platform.url}-${index}`} className="mb-3 grid gap-3 sm:grid-cols-2">
              <input
                value={platform.name}
                onChange={(event) => setWorkspaceProfile((current) => ({
                  ...current,
                  reviewPlatforms: current.reviewPlatforms.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)
                }))}
                className="border p-2 rounded text-black"
                placeholder={t("admin.settings.workspace.reviewPlatforms.namePlaceholder")}
              />
              <input
                type="url"
                value={platform.url}
                onChange={(event) => setWorkspaceProfile((current) => ({
                  ...current,
                  reviewPlatforms: current.reviewPlatforms.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item)
                }))}
                className="border p-2 rounded text-black"
                placeholder={t("admin.settings.workspace.reviewPlatforms.urlPlaceholder")}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setWorkspaceProfile((current) => ({ ...current, reviewPlatforms: [...(current.reviewPlatforms || []), { name: "", url: "" }] }))}
            className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold"
          >
            {t("admin.settings.workspace.reviewPlatforms.addButton")}
          </button>
          <button onClick={saveWorkspaceSettings} disabled={!permission.canManageWorkspace} className="ml-2 rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:bg-gray-600 disabled:text-gray-300">
            {t("admin.settings.workspace.reviewPlatforms.saveButton")}
          </button>
          </>}
        </div>
      </details>
      </>
      )}

      {activeTab === "polls" && (
      <>
      {filteredPolls.length === 0 && <p className="text-center text-gray-600">{t("admin.polls.noMatches")}</p>}

      <div className="space-y-4">
        {filteredPolls.map((poll) => {
          const pollMeta = readPollMeta(poll.id);
          const isClosed = isPollClosed(poll) || pollMeta.status === "closed";
          const locationName = poll.location_name ?? pollMeta.location_name;
          const startsAt = poll.starts_at ?? pollMeta.starts_at;
          const endsAt = poll.expires_at ?? pollMeta.ends_at;
          const brandName = poll.brand_name ?? pollMeta.brand_name;
          const templateKey = poll.template_key ?? pollMeta.template_key;

          return (
          <div
            key={poll.id}
            id={`poll-card-${poll.id}`}
            className={`border rounded-lg bg-slate-900 p-5 shadow-sm ${
              String(poll.id) === selectedPollId ? "border-teal-400 ring-1 ring-teal-400" : "border-slate-700"
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.polls.card.pollNumber", { id: poll.id })}</p>
                <h2 className="text-xl font-semibold">{poll.question}</h2>
              </div>
              {String(poll.id) === selectedPollId && (
                <span className="w-fit rounded bg-teal-400/15 px-2 py-1 text-xs font-semibold text-teal-300">{t("admin.polls.card.newlyCreated")}</span>
              )}
            </div>

            {isClosed && (
              <span className="inline-block bg-red-600 text-white px-2 py-1 rounded text-sm mb-3">
                {t("admin.polls.card.closed")}
              </span>
            )}

            {locationName && (
              <p className="text-gray-300 text-sm mb-1">{t("admin.polls.card.location", { name: locationName })}</p>
            )}

            {(brandName || templateKey) && (
              <p className="text-gray-300 text-sm mb-1">
                {brandName ? t("admin.polls.card.brand", { name: brandName }) : ""} {brandName && templateKey ? "•" : ""} {templateKey ? t("admin.polls.card.template", { name: templateKey }) : ""}
              </p>
            )}

            {startsAt && (
              <p className="text-gray-300 text-sm mb-1">{t("admin.polls.card.starts", { date: new Date(startsAt).toLocaleString() })}</p>
            )}

            {endsAt && (
              <p className="text-gray-300 text-sm mb-1">{t("admin.polls.card.ends", { date: new Date(endsAt).toLocaleString() })}</p>
            )}

            <p className="text-gray-600 text-sm mb-3">
              {t("admin.polls.card.created", { date: new Date(poll.created_at).toLocaleString() })}
            </p>

            <div className="mb-3 rounded border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.polls.card.linkedQrCodes")}</p>
              {(() => {
                const linkedQrCodes = qrCodesForPoll(poll.id);
                return linkedQrCodes.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">
                    {t("admin.polls.card.notLinked")} <button type="button" onClick={() => setActiveTab("engagement")} className="font-semibold text-teal-300 underline">{t("admin.polls.card.setOneUp")}</button>.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {linkedQrCodes.map((qrCode) => (
                      <button
                        key={`${qrCode.kind}-${qrCode.id}`}
                        type="button"
                        onClick={() => goToEgg(qrCode.id)}
                        className="linked-qr-code-button rounded-full border border-teal-700 bg-teal-950/40 px-3 py-1 text-xs font-semibold text-teal-300"
                        title={t("admin.polls.card.tokenTitle", { token: qrCode.token })}
                      >
                        {"🔗"} {qrCode.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="mt-4 flex gap-2 flex-wrap">
              <Link to={`/results/${poll.id}`} className="rounded bg-slate-100 px-3 py-2 font-semibold text-slate-950">
                {t("admin.polls.card.viewResults")}
              </Link>

              <button onClick={() => exportPollCsv(poll)} disabled={!canExportResults} className="rounded border border-slate-500 px-3 py-2 font-semibold text-slate-100 disabled:opacity-40">
                {t("admin.polls.card.exportCsv")}
              </button>

              <details className="relative">
                <summary className="cursor-pointer rounded border border-blue-700 px-3 py-2 font-semibold text-blue-200">📊 {t("admin.polls.card.addToQr")}</summary>
                <div className="absolute left-0 z-10 mt-2 grid min-w-64 gap-1 rounded border border-slate-700 bg-slate-950 p-2 shadow-xl">
                  {qrCampaigns.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      {t("admin.polls.card.noQrCodesYet")}{" "}
                      <button type="button" onClick={() => setActiveTab("engagement")} className="font-semibold text-teal-300 underline">{t("admin.polls.card.setOneUp")}</button>
                    </p>
                  ) : qrCampaigns.map((campaign) => {
                    const alreadyLinked = campaign.poll_id === poll.id || itemsForCampaign(campaign.id).some((item) => item.item_type === "poll" && item.poll_id === poll.id);
                    return (
                      <button
                        key={campaign.id}
                        type="button"
                        disabled={alreadyLinked || !canReuseQr}
                        onClick={() => assignPollToQrCode(poll.id, campaign.id)}
                        className="rounded px-3 py-2 text-left hover:bg-slate-800 disabled:text-slate-500"
                      >
                        {campaign.name}{alreadyLinked ? ` (${t("admin.polls.card.alreadyLinked")})` : ""}
                      </button>
                    );
                  })}
                </div>
              </details>

              <details className="relative">
                <summary className="cursor-pointer rounded border border-slate-600 px-3 py-2 font-semibold text-slate-300">{t("admin.polls.card.moreActions")}</summary>
                <div className="absolute left-0 z-10 mt-2 grid min-w-56 gap-1 rounded border border-slate-700 bg-slate-950 p-2 shadow-xl">
                  <Link to={`/edit/${poll.id}`} className={`rounded px-3 py-2 text-left ${canEditPolls ? "hover:bg-slate-800" : "pointer-events-none text-slate-500"}`}>{t("admin.polls.card.editPoll")}</Link>
                  <button onClick={() => copyShareLink(poll)} className="rounded px-3 py-2 text-left hover:bg-slate-800">{t("admin.polls.card.copyVotingLink")}</button>
                  <Link to={`/vote/${poll.id}`} className="rounded px-3 py-2 text-left hover:bg-slate-800">{t("admin.polls.card.openVotePage")}</Link>
                  <button onClick={() => closePoll(poll)} disabled={!canClosePolls} className="rounded px-3 py-2 text-left hover:bg-slate-800 disabled:text-slate-500">{isClosed ? t("admin.polls.card.reopenPoll") : t("admin.polls.card.closePoll")}</button>
                  <button onClick={() => deletePoll(poll.id)} disabled={!canDeletePolls} className="rounded px-3 py-2 text-left text-red-300 hover:bg-red-950 disabled:text-slate-500">{t("admin.polls.card.deletePoll")}</button>
                </div>
              </details>
            </div>
          </div>
         );
       })}
     </div>
     </>
     )}
   </div>
 );
}
