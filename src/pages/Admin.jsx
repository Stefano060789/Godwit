import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { appendAuditLog, readAuditLog, readPollMeta, savePollMeta, isPollClosed } from "../lib/pollMeta";
import { createQrCampaign, loadQrCampaigns } from "../lib/qrCampaigns";
import {
  loadQrCampaignItems,
  addQrCampaignPollItem,
  addQrCampaignInfoItem,
  addQrCampaignDonationItem,
  addQrCampaignRewardItem,
  removeQrCampaignItem,
  swapQrCampaignItemPositions
} from "../lib/qrCampaignItems";
import { extractQrToken, reassignManagedCampaignPoll, resolveManagedQrToken } from "../lib/qrManage";
import { ACCESSIBILITY_TAGS } from "../lib/accessibilityTags";
import QrScanner from "../components/QrScanner";
import LockedFeature from "../components/LockedFeature";
import FlockAvatar from "../components/FlockAvatar";
import { loadLeadNurtureSettings, saveLeadNurtureSettings } from "../lib/leadNurture";
import { loadWinbackSettings, saveWinbackSettings } from "../lib/winbackSettings";
import { loadDonationSettings, saveDonationSettings, startStripeConnectOnboarding, refreshStripeConnectStatus } from "../lib/donationSettings";
import { loadLatestReputationSnapshot, refreshReputationSnapshot } from "../lib/reputation";
import { loadApiKeys, createApiKey, deleteApiKey } from "../lib/apiKeys";
import { getEntitlements, planLabel, minPlanLabelFor } from "../lib/entitlements";
import { DONATION_FEATURE_ENABLED } from "../../lib/donationFeature.js";
import { FLOCK, flockMemberForTab } from "../lib/flock";
import { PERSONAS, findPersona } from "../lib/personas";
import Woodpecker from "./Woodpecker";
import {
  getCurrentUserRole,
  getPermissionSet,
  inviteWorkspaceMember,
  loadWorkspaceProfile,
  readWorkspaceMembers,
  readWorkspaceProfile,
  removeWorkspaceMember,
  saveWorkspaceMember,
  saveWorkspaceProfile
} from "../lib/workspaceProfile";

export default function Admin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const validTabs = ["overview", "polls", "woodpecker", "connection", "engagement", "feedback", "settings"];
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    return validTabs.includes(tabParam) ? tabParam : "overview";
  });

  // Scroll a poll into view when arriving via a "jump to this poll" link from the QR codes
  // tab. Must run unconditionally on every render (before any early return below) - hooks
  // can't be skipped on some renders and not others.
  useEffect(() => {
    const selectedId = new URLSearchParams(location.search).get("poll");
    if (activeTab !== "polls" || !selectedId) return;
    const card = document.getElementById(`poll-card-${selectedId}`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTab, location.search]);

  const [auditLog, setAuditLog] = useState([]);
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
    googlePlaceId: "",
    reviewPlatforms: [],
    role: "owner",
    plan: "free"
  });
  const [workspaceUserId, setWorkspaceUserId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState("viewer");
  const [teamMembers, setTeamMembers] = useState([]);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("viewer");
  const [qrCampaigns, setQrCampaigns] = useState([]);
  const [qrCampaignItems, setQrCampaignItems] = useState([]);
  const [actionTasks, setActionTasks] = useState([]);
  const [itemFormCampaignId, setItemFormCampaignId] = useState(null);
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
  const [qrWizardActionId, setQrWizardActionId] = useState("");
  const [qrWizardTaskTitle, setQrWizardTaskTitle] = useState("");
  const [qrWizardTaskDescription, setQrWizardTaskDescription] = useState("");
  const [qrWizardTaskIds, setQrWizardTaskIds] = useState([]);
  const [qrModifier, setQrModifier] = useState(null);
  const [invitingMember, setInvitingMember] = useState(false);
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
  const [reputationSnapshot, setReputationSnapshot] = useState(null);
  const [reputationLoading, setReputationLoading] = useState(false);
  const [reputationError, setReputationError] = useState("");
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
  const [totalVotesCount, setTotalVotesCount] = useState(0);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [qrShared, setQrShared] = useState(false);
  const [personaKey, setPersonaKey] = useState(null);
  const [weeklyInsight, setWeeklyInsight] = useState(null);
  const [voteTrend, setVoteTrend] = useState(null);
  const [workspaceUpdates, setWorkspaceUpdates] = useState([]);
  const [newUpdateMessage, setNewUpdateMessage] = useState("");
  const [newUpdatePollId, setNewUpdatePollId] = useState("");
  const [apiKeys, setApiKeys] = useState([]);
  const [newApiKeyLabel, setNewApiKeyLabel] = useState("");
  const [selectedQrReviewPlatforms, setSelectedQrReviewPlatforms] = useState([]);

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
      navigate("/login");
      return;
    }

    if (!user) {
      navigate("/login");
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
        setTeamMembers(await readWorkspaceMembers(profile.id));
        setQrCampaigns(await loadQrCampaigns());
        setQrCampaignItems(await loadQrCampaignItems());
        const [rulesResult, alertsResult, tasksResult, reportsResult, messagesResult, contentReportsResult, actionTasksResult] = await Promise.all([
          supabase.from("feedback_alert_rules").select("*").order("created_at", { ascending: false }),
          supabase.from("feedback_alerts").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("feedback_recovery_tasks").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("weekly_report_settings").select("recipient_email, is_enabled").eq("workspace_id", profile.id).maybeSingle(),
          supabase.from("organizer_messages").select("*").order("created_at", { ascending: false }).limit(30),
          supabase.from("content_reports").select("*").order("created_at", { ascending: false }),
          supabase.from("woodpecker_tasks").select("*, qr_campaigns!woodpecker_tasks_campaign_id_fkey(name)").eq("workspace_id", profile.id).order("created_at", { ascending: false })
        ]);
        if (!rulesResult.error) setAlertRules(rulesResult.data || []);
        if (!alertsResult.error) setFeedbackAlerts(alertsResult.data || []);
        if (!tasksResult.error) setRecoveryTasks(tasksResult.data || []);
        if (!reportsResult.error && reportsResult.data) setReportSettings(reportsResult.data);
        if (!messagesResult.error) setOrganizerMessages(messagesResult.data || []);
        if (!contentReportsResult.error) setContentReports(contentReportsResult.data || []);
        if (!actionTasksResult.error) setActionTasks(actionTasksResult.data || []);

        setNurtureSettings(await loadLeadNurtureSettings(profile.id));
        setWinbackSettings(await loadWinbackSettings(profile.id));
        setDonationSettings(await loadDonationSettings(profile.id));
        const { data: donationRows } = await supabase.from("donations").select("amount_total").eq("status", "succeeded");
        setDonationStats({
          totalRaised: (donationRows || []).reduce((sum, row) => sum + Number(row.amount_total || 0), 0),
          count: (donationRows || []).length
        });
        try {
          setReputationSnapshot(await loadLatestReputationSnapshot(profile.id));
        } catch (reputationLoadError) {
          console.error(reputationLoadError);
        }
        const { data: sentimentRows } = await supabase.from("user_answers").select("poll_id, sentiment").not("sentiment", "is", null);
        const summary = {};
        (sentimentRows || []).forEach((row) => {
          summary[row.poll_id] = summary[row.poll_id] || { positive: 0, neutral: 0, negative: 0 };
          summary[row.poll_id][row.sentiment] += 1;
        });
        setSentimentSummary(summary);

        setOnboardingDismissed(localStorage.getItem(`ivote_onboarding_dismissed_${profile.id}`) === "true");
        setQrShared(localStorage.getItem(`ivote_qr_shared_${profile.id}`) === "true");
        setPersonaKey(localStorage.getItem(`ivote_persona_${profile.id}`) || null);

        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
        const { count: votesCount } = await supabase.from("votes").select("id", { count: "exact", head: true });
        setTotalVotesCount(votesCount || 0);

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

        try {
          setApiKeys(await loadApiKeys(supabase, profile.id));
        } catch (apiKeyError) {
          console.warn("API key management is unavailable until its database table is installed.", apiKeyError);
          setApiKeys([]);
        }
      } catch (error) {
        console.error(error);
        alert(error.message || "Unable to load workspace role data.");
      }
    }

    loadPolls();
    loadWorkspaceProfileState();
    setAuditLog(readAuditLog());

    const interval = setInterval(() => {
      loadPolls();
      setAuditLog(readAuditLog());
    }, 5000);

    return () => clearInterval(interval);
  }, [navigate]);

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
    setQrWizardStep(1);
    setQrWizardActionId("");
    setQrWizardTaskTitle("");
    setQrWizardTaskDescription("");
    setQrWizardTaskIds([]);
  }

  async function handleCreateCampaignFromWizard() {
    if (!newCampaignName.trim()) {
      alert("Give the QR code a name.");
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
      alert(error.message || "Unable to create QR campaign. Run the ROI migration first.");
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

  async function reassignQrCampaignPoll(campaignId, nextPollId) {
    if (!nextPollId) return;
    const { error } = await supabase.from("qr_campaigns").update({ poll_id: Number(nextPollId) }).eq("id", campaignId);
    if (error) {
      alert(error.message);
      return;
    }
    setQrCampaigns((current) => current.map((item) => item.id === campaignId ? { ...item, poll_id: Number(nextPollId) } : item));
  }

  // --- QR code items: let one QR code show a menu of several polls and/or info cards at once ---

  function itemsForCampaign(campaignId) {
    return qrCampaignItems
      .filter((item) => item.campaign_id === campaignId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  async function handleAddCurrentPollAsItem(campaign) {
    try {
      const item = await addQrCampaignPollItem(campaign.id, campaign.poll_id);
      setQrCampaignItems((current) => [...current, item]);
    } catch (error) {
      alert(error.message);
    }
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

  async function handleAddInfoItem(campaignId) {
    if (!itemTitle.trim()) {
      alert("Give the info card a title.");
      return;
    }
    try {
      const item = await addQrCampaignInfoItem(campaignId, { title: itemTitle, body: itemBody, linkUrl: itemLinkUrl, linkLabel: itemLinkLabel, imageUrl: itemImageUrl, accessibilityTags: itemAccessibilityTags });
      setQrCampaignItems((current) => [...current, item]);
      setItemTitle("");
      setItemBody("");
      setItemLinkUrl("");
      setItemLinkLabel("");
      setItemImageUrl("");
      setItemAccessibilityTags([]);
    } catch (error) {
      alert(error.message);
    }
  }

  function toggleItemAccessibilityTag(value) {
    setItemAccessibilityTags((current) =>
      current.includes(value) ? current.filter((tag) => tag !== value) : [...current, value]
    );
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

  async function handleRemoveItem(itemId) {
    if (!confirm("Remove this item from the QR code?")) return;
    try {
      await removeQrCampaignItem(itemId);
      setQrCampaignItems((current) => current.filter((item) => item.id !== itemId));
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleMoveItem(campaignId, itemId, direction) {
    const items = itemsForCampaign(campaignId);
    const index = items.findIndex((item) => item.id === itemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return;
    const current = items[index];
    const swapWith = items[swapIndex];
    try {
      await swapQrCampaignItemPositions(current, swapWith);
      setQrCampaignItems((prev) => prev.map((item) => {
        if (item.id === current.id) return { ...item, sort_order: swapWith.sort_order };
        if (item.id === swapWith.id) return { ...item, sort_order: current.sort_order };
        return item;
      }));
    } catch (error) {
      alert(error.message);
    }
  }

  // Same reordering as handleMoveItem, but scoped to one item type (poll/info/donation) so the
  // Polls/Info/Donation sections in the QR tab can each have their own independent up/down
  // controls, instead of moving an item past unrelated items of a different type.
  async function handleMoveItemWithinType(campaignId, itemId, itemType, direction) {
    const items = itemsForCampaign(campaignId).filter((item) => item.item_type === itemType);
    const index = items.findIndex((item) => item.id === itemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= items.length) return;
    const current = items[index];
    const swapWith = items[swapIndex];
    try {
      await swapQrCampaignItemPositions(current, swapWith);
      setQrCampaignItems((prev) => prev.map((item) => {
        if (item.id === current.id) return { ...item, sort_order: swapWith.sort_order };
        if (item.id === swapWith.id) return { ...item, sort_order: current.sort_order };
        return item;
      }));
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleCreateApiKey() {
    try {
      const { record, plaintextKey } = await createApiKey(supabase, workspaceUserId, newApiKeyLabel);
      setApiKeys((current) => [record, ...current]);
      setNewApiKeyLabel("");
      window.prompt("Copy this API key now. It won't be shown again:", plaintextKey);
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to create API key.");
    }
  }

  async function handleDeleteApiKey(keyId) {
    const confirmed = window.confirm("Delete this API key? Anything using it will stop working immediately.");
    if (!confirmed) return;
    try {
      await deleteApiKey(supabase, keyId);
      setApiKeys((current) => current.filter((item) => item.id !== keyId));
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to delete API key.");
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
      setScanMessage("This QR code isn't linked to a poll in your workspace.");
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

  async function refreshPublicReputation() {
    setReputationLoading(true);
    setReputationError("");
    try {
      const snapshot = await refreshReputationSnapshot(workspaceUserId);
      setReputationSnapshot(snapshot);
    } catch (error) {
      console.error(error);
      setReputationError(error.message || "Unable to refresh public reputation.");
    } finally {
      setReputationLoading(false);
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

  async function addTeamMember() {
    if (!newMemberName.trim()) {
      alert("Add a team member name first.");
      return;
    }

    const email = newMemberEmail.trim();

    if (email) {
      setInvitingMember(true);
      try {
        const result = await inviteWorkspaceMember(workspaceUserId, {
          email,
          name: newMemberName.trim(),
          role: newMemberRole
        });
        setTeamMembers(await readWorkspaceMembers(workspaceUserId));
        setNewMemberName("");
        setNewMemberEmail("");
        setNewMemberRole("viewer");
        if (result.actionLink) {
          window.prompt("Invite created. Copy this sign-in link and send it to your teammate:", result.actionLink);
        } else {
          alert(`Invited ${email}. They'll receive an email to set up their account.`);
        }
      } catch (error) {
        console.error(error);
        alert(error.message || "Unable to invite team member.");
      } finally {
        setInvitingMember(false);
      }
      return;
    }

    try {
      const nextMembers = await saveWorkspaceMember(workspaceUserId, {
        name: newMemberName.trim(),
        email: newMemberEmail.trim(),
        role: newMemberRole
      });
      setTeamMembers(nextMembers);
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberRole("viewer");
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to add team member.");
    }
  }

  async function deleteTeamMember(memberId) {
    try {
      setTeamMembers(await removeWorkspaceMember(workspaceUserId, memberId));
    } catch (error) {
      console.error(error);
      alert(error.message || "Unable to remove team member.");
    }
  }

  async function deletePoll(id) {
    const { error } = await supabase.from("polls").delete().eq("id", id);
    if (error) {
      console.error(error);
      alert(`Error deleting poll: ${error.message}`);
      return;
    }

    appendAuditLog("delete_poll", { poll_id: id });
    setAuditLog(readAuditLog());
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
    setAuditLog(readAuditLog());
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
    setAuditLog(readAuditLog());
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
    setAuditLog(readAuditLog());
  }

  function copyShareLink(poll) {
    const shareLink = poll.stable_short_url || poll.short_url || `${window.location.origin}/vote/${poll.id}`;
    navigator.clipboard.writeText(shareLink);
    if (workspaceUserId) {
      localStorage.setItem(`ivote_qr_shared_${workspaceUserId}`, "true");
      setQrShared(true);
    }
  }

  function dismissOnboarding() {
    if (workspaceUserId) localStorage.setItem(`ivote_onboarding_dismissed_${workspaceUserId}`, "true");
    setOnboardingDismissed(true);
  }

  function choosePersona(key) {
    setPersonaKey(key);
    if (workspaceUserId) localStorage.setItem(`ivote_persona_${workspaceUserId}`, key);
  }

  function changePersona() {
    setPersonaKey(null);
    if (workspaceUserId) localStorage.removeItem(`ivote_persona_${workspaceUserId}`);
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

  // QR campaigns (the multi-item menu QR codes) previously only offered a "copy link" text
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
    const generatedStyle = generateQrStyle(design.seed || 1, design.preset || "brand");
    const customText = (design.text || "").trim().replace(/[<>&"']/g, "");
    const logoUrl = (design.logoUrl || workspaceProfile.logoUrl || "").trim().replace(/[<>&"']/g, "");
    const logoMarkup = logoUrl
      ? `<img src="${logoUrl}" alt="Brand logo" style="max-height: 56px; max-width: 160px; object-fit: contain; margin-right: 16px;" />`
      : "";
    const companyName = (workspaceProfile.companyName || "Godwit").replace(/[<>&"']/g, "");
    const campaignName = (campaign?.name || "QR code").replace(/[<>&"']/g, "");

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
            body {
              margin: 0;
              background: #f8fafc;
              font-family: Arial, sans-serif;
              color: #0f172a;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .page {
              width: ${formatConfig.cssSize};
              min-height: ${formatConfig.cssSize};
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              background: ${generatedStyle.background};
              border-radius: 20px;
              box-shadow: ${generatedStyle.shadow};
              padding: 36px;
              box-sizing: border-box;
            }
            .header { display: flex; align-items: center; justify-content: center; gap: 14px; margin-bottom: 18px; }
            .brand { font-size: 28px; font-weight: 700; letter-spacing: 0.04em; color: #0f172a; }
            .qr-box { position: relative; background: #fff; border: 12px solid #0b1a33; border-radius: 18px; padding: 18px 18px 44px; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12); }
            .qr-box img { display: block; width: 260px; height: 260px; object-fit: contain; }
            .qr-mark { position: absolute; right: 0; bottom: 8px; left: 0; color: #0b1a33; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
            .title { margin-top: 18px; font-size: 20px; font-weight: 700; text-align: center; max-width: 620px; }
            .custom-text { margin-top: 16px; font-size: 22px; font-weight: 700; text-align: center; max-width: 620px; color: #0f172a; }
            .subtitle { margin-top: 8px; font-size: 14px; text-align: center; letter-spacing: 0.08em; text-transform: uppercase; color: #334155; }
            .godwit-footer { margin-top: 22px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #475569; }
            .godwit-footer img { display: block; width: 16px; height: 16px; border-radius: 50%; }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="header">
              ${logoMarkup}
              <div class="brand">${companyName}</div>
            </div>
            <div class="qr-box">
              <img src="${getCampaignQrImageUrl(url, 600)}" alt="QR code" />
              <div class="qr-mark">hellogodwit.com</div>
            </div>
            <div class="subtitle">${t("admin.engagement.campaigns.scanToView")}</div>
            ${customText ? `<div class="custom-text">${customText}</div>` : ""}
            <div class="title">${campaignName}</div>
            <div class="godwit-footer">
              <img src="${window.location.origin}/favicon.svg" alt="" />
              <span>${t("admin.polls.card.madeWithGodwit", { host: window.location.host })}</span>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    const printImages = Array.from(printWindow.document.images);
    Promise.all(printImages.map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          image.onload = resolve;
          image.onerror = resolve;
        }))).then(() => printWindow.print());
  }

  if (loading) return <p className="text-center p-6">Loading polls...</p>;

  const auditEntries = auditLog.slice(0, 5);
  const entitlements = getEntitlements(workspaceProfile.plan);
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
    setActiveTab("polls");
    setSearchTerm("");
    setStatusFilter("all");
    setLocationFilter("all");
    navigate(`/admin?tab=polls&poll=${pollId}`);
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

  const adminTabs = [
    { key: "overview", label: t("admin.nav.overview") },
    { key: "polls", label: t("admin.nav.polls") },
    { key: "woodpecker", label: t("admin.nav.woodpecker") },
    { key: "engagement", label: t("admin.nav.engagement") },
    { key: "connection", label: t("admin.nav.connection") },
    { key: "feedback", label: t("admin.nav.feedback") },
    { key: "settings", label: t("admin.nav.settings") }
  ];

  const adminTabDescriptions = {
    overview: t("admin.tabDescriptions.overview"),
    polls: t("admin.tabDescriptions.polls"),
    woodpecker: t("admin.tabDescriptions.woodpecker"),
    engagement: t("admin.tabDescriptions.engagement"),
    connection: t("admin.tabDescriptions.connection"),
    feedback: t("admin.tabDescriptions.feedback"),
    settings: t("admin.tabDescriptions.settings")
  };

  const quickActions = [
    { key: "polls", icon: "\ud83d\udcca", bird: flockMemberForTab("polls"), label: t("admin.quickActions.polls.label"), description: t("admin.quickActions.polls.description"), onSelect: () => setActiveTab("polls") },
    { key: "woodpecker", icon: "\u2705", bird: flockMemberForTab("woodpecker"), label: t("admin.quickActions.woodpecker.label"), description: t("admin.quickActions.woodpecker.description"), onSelect: () => setActiveTab("woodpecker") },
    { key: "engagement", icon: "\u2728", bird: flockMemberForTab("engagement"), label: t("admin.quickActions.engagement.label"), description: t("admin.quickActions.engagement.description"), onSelect: () => setActiveTab("engagement") },
    { key: "connection", icon: "\ud83e\udd1d", bird: flockMemberForTab("connection"), label: t("admin.quickActions.connection.label"), description: t("admin.quickActions.connection.description"), onSelect: () => setActiveTab("connection") },
    { key: "analytics", icon: "\ud83d\udcca", bird: FLOCK.find((member) => member.key === "waxwing"), label: t("admin.quickActions.analytics.label"), description: t("admin.quickActions.analytics.description"), onSelect: () => navigate("/admin/analytics") },
    { key: "feedback", icon: "\ud83d\udcac", bird: flockMemberForTab("feedback"), label: t("admin.quickActions.feedback.label"), description: t("admin.quickActions.feedback.description"), onSelect: () => setActiveTab("feedback") },
    { key: "settings", icon: "\u2699\ufe0f", bird: flockMemberForTab("settings"), label: t("admin.quickActions.settings.label"), description: t("admin.quickActions.settings.description"), onSelect: () => setActiveTab("settings") }
  ];

  function openConnectionSetup(tab, sectionId) {
    setActiveTab(tab);
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  return (
    <div className="workspace-page max-w-3xl mx-auto p-6">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold">{t("admin.dashboardTitle")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("admin.dashboardSubtitle")}</p>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
        {adminTabs.map((tab) => {
          const bird = flockMemberForTab(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center justify-center gap-1.5 rounded px-4 py-3 text-center font-semibold ${activeTab === tab.key ? "bg-teal-500 text-slate-950" : "bg-gray-800 text-slate-300"}`}
            >
              {bird && <FlockAvatar bird={bird} size={28} />}
              {tab.label}
            </button>
          );
        })}
      </div>
      <p className="mb-1 text-center text-sm text-slate-400">{adminTabDescriptions[activeTab]}</p>
      {activeTab !== "overview" && flockMemberForTab(activeTab) && (
        <p className="mb-6 flex items-center justify-center gap-2 text-xs text-slate-500">
          <FlockAvatar bird={flockMemberForTab(activeTab)} size={28} />
          <span>
            {t("admin.onDuty", { name: flockMemberForTab(activeTab).name, role: flockMemberForTab(activeTab).role.toLowerCase() })}
          </span>
        </p>
      )}

      {activeTab === "overview" && (
      <>
      <div className="mb-6 rounded border border-teal-700 bg-slate-900 p-4">
        <div className="flex items-center gap-2">
          <FlockAvatar bird={flockMemberForTab("overview")} size={32} />
          <span className="text-lg font-bold">{t("admin.overview.robinGuideTitle")}</span>
        </div>
        <p className="mt-2 text-sm text-slate-300">{t("admin.overview.firstSteps.explanation")}</p>

        {!onboardingDismissed && (
          <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.overview.firstSteps.heading")}</p>
              <button onClick={dismissOnboarding} className="text-xs text-slate-400 underline">{t("admin.overview.firstSteps.dismiss")}</button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {t("admin.overview.firstSteps.newHerePrefix")} <Link to="/essentials" className="underline">{t("admin.overview.firstSteps.readGuide")}</Link> - {t("admin.overview.firstSteps.newHereSuffix")}
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={polls.length > 0 ? "text-emerald-300" : "text-slate-300"}>{polls.length > 0 ? "\u2713" : "\u25cb"} {t("admin.overview.firstSteps.createFirstPoll")}</p>
                {polls.length === 0 && <Link to="/create" className="shrink-0 rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950">{t("admin.overview.firstSteps.createPollCta")}</Link>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={actionTasks.length > 0 ? "text-emerald-300" : "text-slate-300"}>{actionTasks.length > 0 ? "\u2713" : "\u25cb"} {t("admin.overview.firstSteps.createFirstAction")}</p>
                {actionTasks.length === 0 && <button onClick={() => setActiveTab("woodpecker")} className="shrink-0 rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950">{t("admin.overview.firstSteps.createActionCta")}</button>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={qrShared ? "text-emerald-300" : "text-slate-300"}>{qrShared ? "\u2713" : "\u25cb"} {t("admin.overview.firstSteps.shareQr")}</p>
                {!qrShared && polls.length > 0 && <button onClick={() => setActiveTab("polls")} className="shrink-0 rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950">{t("admin.overview.firstSteps.goToPolls")}</button>}
              </div>
              <p className={totalVotesCount > 0 ? "text-emerald-300" : "text-slate-300"}>{totalVotesCount > 0 ? "\u2713" : "\u25cb"} {t("admin.overview.firstSteps.getFirstVote")}</p>
            </div>
          </div>
        )}

        {!personaKey ? (
          <>
            <p className="mt-3 text-sm text-slate-400">{t("admin.overview.personaPrompt")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PERSONAS.map((persona) => (
                <button
                  key={persona.key}
                  type="button"
                  onClick={() => choosePersona(persona.key)}
                  className="rounded border border-slate-700 bg-gray-900 p-3 text-left transition hover:border-teal-500"
                >
                  <span className="text-xl" aria-hidden="true">{persona.icon}</span>
                  <p className="mt-1 font-bold">{persona.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{persona.pitch}</p>
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
                    <span aria-hidden="true">{persona.icon}</span> {t("admin.overview.guideFor")} <strong className="text-slate-200">{persona.label.toLowerCase()}</strong>
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
            {action.bird ? (
              <FlockAvatar bird={action.bird} size={44} />
            ) : (
              <span className="text-2xl" aria-hidden="true">{action.icon}</span>
            )}
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
      <div className="mb-6 rounded border border-amber-700 bg-slate-900 p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">{t("admin.engagement.intro.eyebrow")}</p>
        <h2 className="mt-2 text-2xl font-bold">{t("admin.engagement.intro.title")}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          {t("admin.engagement.intro.body")}
        </p>
      </div>
      )}

      {activeTab === "engagement" && (
      <details className="mb-6 border rounded bg-gray-900" open>
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.engagement.campaigns.title")}</summary>
        <div className="px-4 pb-4">
          <p className="mb-3 text-sm text-slate-400">{t("admin.engagement.campaigns.description")}</p>
          <p className="mb-4 text-xs text-slate-500">{t("admin.engagement.campaigns.tip")}</p>
          <button onClick={openQrWizard} className="mb-4 bg-violet-600 text-white px-5 py-3 rounded font-semibold">
            {t("admin.engagement.campaigns.createButton")}
          </button>

          {qrWizardOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div
                className="qr-wizard-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#24345c] bg-[#0b1a33] p-5 text-[#e7ecf5]"
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
                  const wizardUrl = `${window.location.origin}/qr/${qrWizardCampaign.token}`;
                  return (
                    <div className="space-y-3 text-center">
                      <h3 className="text-lg font-bold text-[#f4f7fb]">{t("admin.engagement.wizard.step6Title")}</h3>
                      <div className="flex justify-center">
                        <img src={getCampaignQrImageUrl(wizardUrl, 220)} alt={t("admin.engagement.campaigns.qrAlt", { name: qrWizardCampaign.name })} className="h-40 w-40 rounded border border-[#24345c] bg-white p-2" />
                      </div>
                      <p className="truncate text-xs text-[#8ab4f8]">{wizardUrl}</p>
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
                      <div className="flex justify-center gap-2">
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
              const url = `${window.location.origin}/qr/${campaign.token}`;
              return (
                <div key={campaign.id} className="gap-3 border border-gray-700 rounded p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{campaign.name}</p>
                      <p className="text-xs text-gray-400">
                        {campaign.poll_id ? (
                          <button type="button" onClick={() => goToPoll(campaign.poll_id)} className="font-semibold text-teal-300 underline">{t("admin.polls.card.pollNumber", { id: campaign.poll_id })}</button>
                        ) : t("admin.engagement.campaigns.noDefaultPoll")}
                        {" · "}{campaign.placement_label || t("admin.engagement.scanner.unlabeledPlacement")}{campaign.variant_label ? ` · ${campaign.variant_label}` : ""} · {campaign.is_active ? t("admin.engagement.campaigns.active") : t("admin.engagement.campaigns.paused")}
                      </p>
                      <p className="truncate text-xs text-blue-300">{url}</p>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(url)} className="shrink-0 rounded bg-[#0f766e] px-3 py-2 font-semibold text-[#f8fafc] hover:bg-[#0d6259]">{t("admin.engagement.campaigns.copyLink")}</button>
                    <button onClick={() => handleDeleteQrCampaign(campaign.id, campaign.name)} className="shrink-0 rounded border border-[#c0392b] bg-white px-3 py-2 font-semibold text-[#c0392b] hover:bg-[#fdeceb]">{t("admin.engagement.campaigns.delete")}</button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={getCampaignQrImageUrl(url, 120)}
                      alt={t("admin.engagement.campaigns.qrAlt", { name: campaign.name })}
                      className="h-16 w-16 rounded border border-slate-700 bg-white p-1"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => window.open(`${url}?preview=1`, "_blank", "noopener,noreferrer")}
                        className="bg-violet-600 text-white px-3 py-1.5 rounded text-sm font-semibold"
                      >
                        {t("admin.engagement.campaigns.viewVisitorExperience")}
                      </button>
                      <button onClick={() => downloadCampaignQr(campaign, url)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold">
                        {t("admin.polls.card.downloadQr")}
                      </button>
                      <button onClick={() => printCampaignQr(campaign, url)} className="bg-violet-600 text-white px-3 py-1.5 rounded text-sm font-semibold">
                        {t("admin.polls.card.printQr")}
                      </button>
                      <button onClick={() => openQrModifier(campaign, url)} className="bg-fuchsia-600 text-white px-3 py-1.5 rounded text-sm font-semibold">
                        {t("admin.polls.card.modifyQr")}
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const items = itemsForCampaign(campaign.id);
                    const itemPollIds = new Set(items.filter((item) => item.item_type === "poll").map((item) => item.poll_id));
                    const pollCount = itemPollIds.size + (campaign.poll_id && !itemPollIds.has(campaign.poll_id) ? 1 : 0);
                    const infoCount = items.filter((item) => item.item_type === "info").length;
                    const hasDonation = DONATION_FEATURE_ENABLED && items.some((item) => item.item_type === "donation");
                    const rewardCount = items.filter((item) => item.item_type === "reward").length;
                    if (pollCount <= 1 && infoCount === 0 && !hasDonation && rewardCount === 0) {
                      return <p className="mt-2 text-xs text-slate-500">{t("admin.engagement.campaigns.summaryEmpty")}</p>;
                    }
                    return (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pollCount > 0 && (
                          <span className="rounded-full bg-blue-950/60 border border-blue-800 px-2.5 py-0.5 text-xs font-semibold text-blue-300">
                            📊 {pollCount} {pollCount === 1 ? t("admin.engagement.campaigns.summaryPoll") : t("admin.engagement.campaigns.summaryPollPlural")}
                          </span>
                        )}
                        {infoCount > 0 && (
                          <span className="rounded-full bg-slate-800 border border-slate-600 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                            📄 {infoCount} {infoCount === 1 ? t("admin.engagement.campaigns.summaryInfoCard") : t("admin.engagement.campaigns.summaryInfoCardPlural")}
                          </span>
                        )}
                        {hasDonation && (
                          <span className="rounded-full bg-amber-950/60 border border-amber-700 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                            💛 {t("admin.engagement.campaigns.summaryDonation")}
                          </span>
                        )}
                        {rewardCount > 0 && (
                          <span className="rounded-full bg-fuchsia-950/60 border border-fuchsia-700 px-2.5 py-0.5 text-xs font-semibold text-fuchsia-300">
                            🎁 {rewardCount} {rewardCount === 1 ? t("admin.engagement.campaigns.summaryReward") : t("admin.engagement.campaigns.summaryRewardPlural")}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {false && <div className="mt-2 flex flex-wrap items-center gap-2">
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

                  {false && <details className="mt-3 rounded border border-slate-700">
                    <summary className="cursor-pointer p-2 text-sm font-semibold">
                      {t("admin.engagement.campaigns.itemsOnQr", { count: itemsForCampaign(campaign.id).length })}
                    </summary>
                    <div className="space-y-4 p-3">
                      <p className="text-xs text-slate-400">
                        {t("admin.engagement.campaigns.itemsHint")}
                      </p>

                      {/* INFO */}
                      <div className="rounded-lg border border-slate-600 bg-slate-800/20 p-3">
                        <p className="text-sm font-bold text-slate-200">📄 {t("admin.engagement.items.sectionInfo")}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{t("admin.engagement.items.sectionInfoHint")}</p>

                        {(() => {
                          const infoItems = itemsForCampaign(campaign.id).filter((item) => item.item_type === "info");
                          return infoItems.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {infoItems.map((item, index, all) => (
                                <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950/60 p-2 text-sm">
                                  <div className="min-w-0">
                                    <p className="truncate">{item.title}{item.link_url ? ` · ${item.link_label || t("admin.engagement.items.link")}` : ""}</p>
                                    {item.accessibility_tags?.length > 0 && (
                                      <p className="truncate text-xs text-slate-400">
                                        {item.accessibility_tags.map((tag) => ACCESSIBILITY_TAGS.find((entry) => entry.value === tag)?.icon).filter(Boolean).join(" ")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "info", "up")} disabled={index === 0} className="rounded px-2 py-1 disabled:opacity-30">↑</button>
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "info", "down")} disabled={index === all.length - 1} className="rounded px-2 py-1 disabled:opacity-30">↓</button>
                                    <button type="button" onClick={() => handleRemoveItem(item.id)} className="rounded px-2 py-1 font-semibold text-red-400">{t("admin.engagement.items.remove")}</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <input
                            value={itemFormCampaignId === campaign.id ? itemTitle : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemTitle(event.target.value); }}
                            maxLength={120}
                            className="border p-2 rounded text-black"
                            placeholder={t("admin.engagement.items.infoTitlePlaceholder")}
                          />
                          <input
                            value={itemFormCampaignId === campaign.id ? itemLinkUrl : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemLinkUrl(event.target.value); }}
                            className="border p-2 rounded text-black"
                            placeholder={t("admin.engagement.items.linkUrlPlaceholder")}
                          />
                          <textarea
                            value={itemFormCampaignId === campaign.id ? itemBody : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemBody(event.target.value); }}
                            maxLength={2000}
                            rows="2"
                            className="border p-2 rounded text-black md:col-span-2"
                            placeholder={t("admin.engagement.items.infoBodyPlaceholder")}
                          />
                          <input
                            value={itemFormCampaignId === campaign.id ? itemLinkLabel : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemLinkLabel(event.target.value); }}
                            maxLength={60}
                            className="border p-2 rounded text-black"
                            placeholder={t("admin.engagement.items.linkLabelPlaceholder")}
                          />
                          <input
                            value={itemFormCampaignId === campaign.id ? itemImageUrl : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemImageUrl(event.target.value); }}
                            className="border p-2 rounded text-black md:col-span-2"
                            placeholder={t("admin.engagement.items.imageUrlPlaceholder")}
                          />
                          <fieldset className="md:col-span-2 rounded border border-slate-700 p-2">
                            <legend className="text-xs font-semibold text-slate-300 px-1">{t("admin.engagement.items.accessibilityLegend")}</legend>
                            <div className="flex flex-wrap gap-3 pt-1">
                              {ACCESSIBILITY_TAGS.map((tag) => (
                                <label key={tag.value} className="flex items-center gap-1 text-sm text-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={itemFormCampaignId === campaign.id && itemAccessibilityTags.includes(tag.value)}
                                    onChange={() => { setItemFormCampaignId(campaign.id); toggleItemAccessibilityTag(tag.value); }}
                                  />
                                  <span aria-hidden="true">{tag.icon}</span> {t(tag.labelKey)}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <button type="button" onClick={() => handleAddInfoItem(campaign.id)} className="bg-slate-600 text-white px-3 py-2 rounded font-semibold">{t("admin.engagement.items.addInfoCard")}</button>
                        </div>
                      </div>

                      {/* POLLS */}
                      <div className="rounded-lg border border-blue-800 bg-blue-950/10 p-3">
                        <p className="text-sm font-bold text-blue-300">📊 {t("admin.engagement.items.sectionPolls")}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{t("admin.engagement.items.sectionPollsHint")}</p>

                        {campaign.poll_id && !itemsForCampaign(campaign.id).some((item) => item.item_type === "poll" && item.poll_id === campaign.poll_id) && (
                          <button
                            type="button"
                            onClick={() => handleAddCurrentPollAsItem(campaign)}
                            className="mt-2 text-xs font-semibold text-blue-300 underline"
                          >
                            {t("admin.engagement.items.addCurrentPoll", { id: campaign.poll_id })}
                          </button>
                        )}

                        {(() => {
                          const pollItems = itemsForCampaign(campaign.id).filter((item) => item.item_type === "poll");
                          return pollItems.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {pollItems.map((item, index, all) => (
                                <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950/60 p-2 text-sm">
                                  <p className="min-w-0 truncate">
                                    <button type="button" onClick={() => goToPoll(item.poll_id)} className="font-semibold text-teal-300 underline">{t("admin.polls.card.pollNumber", { id: item.poll_id })}</button>
                                    {" - "}{polls.find((poll) => poll.id === item.poll_id)?.question || t("admin.engagement.items.unknownPoll")}
                                  </p>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "poll", "up")} disabled={index === 0} title="Move poll up" aria-label="Move poll up" className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">↑</button>
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "poll", "down")} disabled={index === all.length - 1} title="Move poll down" aria-label="Move poll down" className="rounded border border-slate-600 px-2 py-1 disabled:opacity-30">↓</button>
                                    <button type="button" onClick={() => handleRemoveItem(item.id)} className="rounded px-2 py-1 font-semibold text-red-400">{t("admin.engagement.items.remove")}</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <select
                            value={itemFormCampaignId === campaign.id ? itemPollId : ""}
                            onChange={(event) => { setItemFormCampaignId(campaign.id); setItemPollId(event.target.value); }}
                            className="w-full min-w-0 border p-2 rounded text-black md:col-span-2"
                          >
                            <option value="">{t("admin.engagement.items.addPollOption")}</option>
                            {polls.map((poll) => <option key={poll.id} value={String(poll.id)}>#{poll.id} - {poll.question}</option>)}
                          </select>
                          <button type="button" onClick={() => handleAddPollItem(campaign.id)} className="bg-blue-700 text-white px-3 py-2 rounded font-semibold">{t("admin.engagement.items.addPoll")}</button>
                        </div>
                      </div>

                      {/* DONATION */}
                      {DONATION_FEATURE_ENABLED && (
                      <div className="rounded-lg border border-amber-700 bg-amber-950/10 p-3">
                        <p className="text-sm font-bold text-amber-300">💛 {t("admin.engagement.items.sectionDonation")}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{t("admin.engagement.items.sectionDonationHint")}</p>

                        {(() => {
                          const donationItems = itemsForCampaign(campaign.id).filter((item) => item.item_type === "donation");
                          return donationItems.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {donationItems.map((item) => (
                                <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950/60 p-2 text-sm">
                                  <p className="truncate">{item.title ? item.title : t("admin.engagement.items.default")}</p>
                                  <button type="button" onClick={() => handleRemoveItem(item.id)} className="rounded px-2 py-1 font-semibold text-red-400">{t("admin.engagement.items.remove")}</button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {DONATION_FEATURE_ENABLED && donationSettings.is_enabled ? (
                          itemsForCampaign(campaign.id).some((item) => item.item_type === "donation") ? null : (
                            <button type="button" onClick={() => handleAddDonationItem(campaign.id)} className="mt-2 bg-amber-500 text-slate-950 px-3 py-2 rounded font-semibold">
                              {t("admin.engagement.items.addDonationOption")}
                            </button>
                          )
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">
                            {DONATION_FEATURE_ENABLED
                              ? t("admin.engagement.items.enableDonationsNote")
                              : t("admin.engagement.donations.notEnabled")}
                          </p>
                        )}
                      </div>
                      )}

                      {/* REWARD & PRIZE */}
                      <div className="rounded-lg border border-fuchsia-700 bg-fuchsia-950/10 p-3">
                        <p className="text-sm font-bold text-fuchsia-300">🎁 {t("admin.engagement.items.sectionReward")}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{t("admin.engagement.items.sectionRewardHint")}</p>

                        {(() => {
                          const rewardItems = itemsForCampaign(campaign.id).filter((item) => item.item_type === "reward");
                          return rewardItems.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {rewardItems.map((item, index, all) => (
                                <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950/60 p-2 text-sm">
                                  <div className="min-w-0">
                                    <p className="truncate">{item.title}{item.reward_code ? ` · ${t("admin.engagement.items.rewardCodeLabel", { code: item.reward_code })}` : ""}</p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "reward", "up")} disabled={index === 0} className="rounded px-2 py-1 disabled:opacity-30">↑</button>
                                    <button type="button" onClick={() => handleMoveItemWithinType(campaign.id, item.id, "reward", "down")} disabled={index === all.length - 1} className="rounded px-2 py-1 disabled:opacity-30">↓</button>
                                    <button type="button" onClick={() => handleRemoveItem(item.id)} className="rounded px-2 py-1 font-semibold text-red-400">{t("admin.engagement.items.remove")}</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                      </div>
                    </div>
                  </details>}
                </div>
              );
            })}
          </div>

          <div className="mt-6 border-t border-slate-800 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("admin.engagement.campaigns.advancedTitle")}</p>
            <p className="mb-3 text-xs text-slate-500">{t("admin.engagement.campaigns.advancedDescription")}</p>
          </div>
        </div>
      </details>
      )}

      {activeTab === "engagement" && (
      <div className="mb-6 border rounded bg-gray-900 p-4">
        <h2 className="text-xl font-bold">{t("admin.engagement.scanner.title")}</h2>
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
          <button onClick={() => lookUpScannedQr(scanLookupValue)} className="bg-slate-700 text-white px-4 py-2 rounded font-semibold">
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
      </div>
      )}

      {qrModifier && (() => {
        const generatedStyle = generateQrStyle(qrModifier.seed, qrModifier.preset);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="modify-qr-title">
            <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1a33] p-5 text-white shadow-2xl">
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
                <div className="rounded-xl bg-cover bg-center p-4 text-center shadow-lg" style={{ backgroundImage: generatedStyle.background }}>
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
      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.settings.workspace.title")}</summary>
        <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-slate-400">{t("admin.settings.workspace.subtitle")}</p>
          <span className="text-xs uppercase tracking-wide text-gray-300">{t("admin.settings.workspace.roleLabel", { role: workspaceProfile.role })}</span>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <input
            type="text"
            value={workspaceProfile.companyName}
            onChange={(event) => setWorkspaceProfile((current) => ({ ...current, companyName: event.target.value }))}
            className="border p-2 rounded text-black"
            placeholder={t("admin.settings.workspace.companyNamePlaceholder")}
          />
          <select
            value={workspaceProfile.role}
            className="border p-2 rounded text-black"
            disabled
          >
            <option value="owner">{t("admin.settings.workspace.roles.owner")}</option>
            <option value="editor">{t("admin.settings.workspace.roles.editor")}</option>
            <option value="viewer">{t("admin.settings.workspace.roles.viewer")}</option>
          </select>
          <input
            type="url"
            value={workspaceProfile.logoUrl}
            onChange={(event) => setWorkspaceProfile((current) => ({ ...current, logoUrl: event.target.value }))}
            className="border p-2 rounded text-black md:col-span-2"
            placeholder={t("admin.settings.workspace.logoUrlPlaceholder")}
          />
          <input
            type="url"
            value={workspaceProfile.webhookUrl}
            onChange={(event) => setWorkspaceProfile((current) => ({ ...current, webhookUrl: event.target.value }))}
            className="border p-2 rounded text-black md:col-span-2 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={entitlements.webhooks ? t("admin.settings.workspace.webhookUrlPlaceholder") : t("admin.settings.workspace.webhookUrlLocked")}
            disabled={!entitlements.webhooks}
          />
          <label className="block font-semibold md:col-span-2">
            {t("admin.settings.workspace.autoDeleteLabel")}
            <input
              type="number"
              min="7"
              max="3650"
              value={workspaceProfile.voteRetentionDays}
              onChange={(event) => setWorkspaceProfile((current) => ({ ...current, voteRetentionDays: event.target.value }))}
              className="mt-1 w-full border p-2 rounded text-black"
              placeholder={t("admin.settings.workspace.autoDeletePlaceholder")}
            />
          </label>
        </div>

        {!entitlements.webhooks && (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t("admin.settings.workspace.webhooksUpgradeNote")} · <Link to="/admin/billing" className="underline">{t("admin.overview.upgrade")}</Link>
          </p>
        )}

        <div className="mt-4">
          <button
            onClick={saveWorkspaceSettings}
            disabled={!permission.canManageWorkspace}
            className={`px-4 py-2 rounded font-semibold ${
              permission.canManageWorkspace ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-300 cursor-not-allowed"
            }`}
          >
            {t("admin.settings.workspace.saveButton")}
          </button>
        </div>

        <div className="mt-6 border-t border-slate-700 pt-4">
          <p className="font-semibold">{t("admin.settings.googleBusiness.title")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("admin.settings.googleBusiness.subtitle")}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>{t("admin.settings.googleBusiness.step1Prefix")} <strong>{t("admin.settings.googleBusiness.step1Cta")}</strong> {t("admin.settings.googleBusiness.step1Suffix")}</li>
            <li>{t("admin.settings.googleBusiness.step2")}</li>
            <li>{t("admin.settings.googleBusiness.step3Prefix")} <strong>{t("admin.settings.googleBusiness.step3PlaceId")}</strong> {t("admin.settings.googleBusiness.step3Suffix")} <code>ChIJN1t_tDeuEmsRUsoyG83frY4</code>).</li>
            <li>{t("admin.settings.googleBusiness.step4Prefix")} <strong>{t("admin.settings.googleBusiness.step4Cta")}</strong>.</li>
          </ol>
          <a
            href="https://developers.google.com/maps/documentation/places/web-service/place-id"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            {t("admin.settings.googleBusiness.findLink")} ↗
          </a>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={workspaceProfile.googlePlaceId || ""}
              onChange={(event) => setWorkspaceProfile((current) => ({ ...current, googlePlaceId: event.target.value }))}
              className="flex-1 border p-2 rounded text-black"
              placeholder={t("admin.settings.googleBusiness.placeIdPlaceholder")}
            />
            <button
              onClick={saveWorkspaceSettings}
              disabled={!permission.canManageWorkspace}
              className={`shrink-0 rounded px-4 py-2 font-semibold ${
                permission.canManageWorkspace ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-300 cursor-not-allowed"
              }`}
            >
              {t("admin.settings.googleBusiness.saveButton")}
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-700 pt-4">
          <p className="font-semibold">{t("admin.settings.reputation.title")}</p>
          {entitlements.reputationMonitoring ? (
          <>
          <p className="mt-1 text-xs text-slate-400">{t("admin.settings.reputation.subtitle")}</p>
          {reputationSnapshot ? (
            <p className="mt-3 text-sm">
              <span className="text-2xl font-bold text-amber-300">{reputationSnapshot.rating ?? "-"}</span>
              <span className="ml-2 text-slate-400">{t("admin.settings.reputation.ratingSummary", { count: reputationSnapshot.rating_count ?? 0 })}</span>
              <span className="ml-2 block text-xs text-slate-500 sm:inline sm:ml-2">{t("admin.settings.reputation.asOf", { date: new Date(reputationSnapshot.captured_at).toLocaleString() })}</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-400">{t("admin.settings.reputation.noRating")}</p>
          )}
          <button onClick={refreshPublicReputation} disabled={reputationLoading || !workspaceProfile.googlePlaceId} className="mt-3 rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
            {reputationLoading ? t("admin.settings.reputation.refreshing") : t("admin.settings.reputation.refreshButton")}
          </button>
          {reputationError && <p className="mt-2 text-sm text-red-300">{reputationError}</p>}
          </>
          ) : (
            <LockedFeature
              feature="reputationMonitoring"
              title={t("admin.settings.reputation.lockedTitle")}
              description={t("admin.settings.reputation.lockedDescription")}
            />
          )}
        </div>
        </div>
      </details>

      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.settings.api.title")}</summary>
        <div className="px-4 pb-4">
          {entitlements.apiAccess ? (
          <>
          <p className="mb-3 text-sm text-slate-400">Generate a key to pull your workspace summary from <code>/api/v1-summary</code> with an <code>Authorization: Bearer &lt;key&gt;</code> header.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input value={newApiKeyLabel} onChange={(event) => setNewApiKeyLabel(event.target.value)} className="flex-1 border p-2 rounded text-black" placeholder={t("admin.settings.api.labelPlaceholder")} />
            <button onClick={handleCreateApiKey} className="bg-violet-600 text-white px-4 py-2 rounded font-semibold">{t("admin.settings.api.generateKey")}</button>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {apiKeys.length === 0 ? (
              <p className="text-gray-400">{t("admin.settings.api.noKeys")}</p>
            ) : (
              apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between border-b border-gray-700 py-1">
                  <span>{key.label || t("admin.settings.api.untitledKey")} · {t("admin.settings.api.created", { date: new Date(key.created_at).toLocaleDateString() })}{key.last_used_at ? ` · ${t("admin.settings.api.lastUsed", { date: new Date(key.last_used_at).toLocaleDateString() })}` : ""}</span>
                  <button onClick={() => handleDeleteApiKey(key.id)} className="shrink-0 text-xs text-red-300 underline">{t("admin.engagement.locations.delete")}</button>
                </div>
              ))
            )}
          </div>
          </>
          ) : (
            <LockedFeature
              feature="apiAccess"
              title={t("admin.settings.api.lockedTitle")}
              description={t("admin.settings.api.lockedDescription")}
            />
          )}
        </div>
      </details>

      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.settings.team.title")}</summary>
        <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-slate-400">{t("admin.settings.team.subtitle")}</p>
          <span className="text-xs uppercase tracking-wide text-gray-300">{t("admin.settings.team.seatCount", { current: teamMembers.length, limit: entitlements.seatLimit })}</span>
        </div>

        {teamMembers.length >= entitlements.seatLimit && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-300">
            {t("admin.settings.team.seatLimitReached", { plan: planLabel(workspaceProfile.plan) })} · <Link to="/admin/billing" className="underline">{t("admin.settings.team.upgradeForMoreSeats")}</Link>
          </p>
        )}

        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <input
            type="text"
            value={newMemberName}
            onChange={(event) => setNewMemberName(event.target.value)}
            className="border p-2 rounded text-black"
            placeholder={t("admin.settings.team.namePlaceholder")}
            disabled={teamMembers.length >= entitlements.seatLimit}
          />
          <input
            type="email"
            value={newMemberEmail}
            onChange={(event) => setNewMemberEmail(event.target.value)}
            className="border p-2 rounded text-black"
            placeholder="member@example.com"
            disabled={teamMembers.length >= entitlements.seatLimit}
          />
          <select
            value={newMemberRole}
            onChange={(event) => setNewMemberRole(event.target.value)}
            className="border p-2 rounded text-black"
            disabled={teamMembers.length >= entitlements.seatLimit}
          >
            <option value="owner">{t("admin.settings.workspace.roles.owner")}</option>
            <option value="editor">{t("admin.settings.workspace.roles.editor")}</option>
            <option value="viewer">{t("admin.settings.workspace.roles.viewer")}</option>
          </select>
        </div>

        <button
          onClick={addTeamMember}
          disabled={!permission.canManageWorkspace || invitingMember || teamMembers.length >= entitlements.seatLimit}
          className={`px-4 py-2 rounded font-semibold mb-4 ${
            permission.canManageWorkspace && teamMembers.length < entitlements.seatLimit ? "bg-indigo-600 text-white" : "bg-gray-600 text-gray-300 cursor-not-allowed"
          }`}
        >
          {invitingMember ? t("admin.settings.team.sendingInvite") : newMemberEmail.trim() ? t("admin.settings.team.sendInvite") : t("admin.settings.team.addMember")}
        </button>

        <div className="space-y-2">
          {teamMembers.length === 0 ? (
            <p className="text-gray-400">{t("admin.settings.team.noMembers")}</p>
          ) : (
            teamMembers.map((member) => (
              <div key={member.id} className="flex items-center justify-between border border-gray-700 rounded p-3">
                <div>
                  <p className="font-semibold">{member.name}</p>
                  {member.email && <p className="text-xs text-gray-400">{member.email}</p>}
                  <p className="text-xs uppercase tracking-wide text-blue-300">{member.role}</p>
                </div>
                <button
                  onClick={() => deleteTeamMember(member.id)}
                  disabled={!permission.canManageWorkspace}
                  className={`px-3 py-2 rounded font-semibold ${
                    permission.canManageWorkspace ? "bg-red-600 text-white" : "bg-gray-700 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {t("admin.engagement.items.remove")}
                </button>
              </div>
            ))
          )}
        </div>
        </div>
      </details>

      <details className="mb-6 border rounded bg-gray-900">
        <summary className="cursor-pointer p-4 text-xl font-bold">{t("admin.settings.activity.title")}</summary>
        <div className="px-4 pb-4">
        {entitlements.auditLog ? (
        <>
        <p className="mb-3 text-sm text-slate-400">{t("admin.settings.activity.subtitle")}</p>
        <div className="space-y-2 text-sm">
          {auditEntries.length === 0 ? (
            <p className="text-gray-400">{t("admin.settings.activity.noActivity")}</p>
          ) : (
            auditEntries.map((entry) => (
              <div key={entry.id} className="border-b border-gray-700 pb-2 last:border-b-0 last:pb-0">
                <p className="font-semibold text-blue-300">{entry.action}</p>
                <p className="text-gray-400">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
        </>
        ) : (
          <LockedFeature
            feature="auditLog"
            title={t("admin.settings.activity.lockedTitle")}
            description={t("admin.settings.activity.lockedDescription")}
          />
        )}
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
                        onClick={() => setActiveTab("engagement")}
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
