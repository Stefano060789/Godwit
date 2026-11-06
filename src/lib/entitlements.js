// Single source of truth for what each billing plan unlocks. Keep this in sync with the
// database enforcement in supabase/20260913_plan_entitlements.sql (and
// supabase/20260924_active_only_plan_limits.sql) - the UI hides/locks features based on this
// file, but the database is what actually rejects disallowed writes. pollLimit/campaignLimit
// only count currently active polls/QR codes, not the lifetime total - closing an old poll or
// pausing an old QR code frees up quota for a new one.

export const PLANS = ["free", "starter", "growth"];

export const PLAN_LABELS = {
  free: "Free",
  starter: "Starter",
  growth: "Growth"
};

export const PLAN_FEATURES = {
  free: {
    pollLimit: 3,
    campaignLimit: 1,
    seatLimit: 1,
    donations: true,
    csvExport: false,
    auditLog: false,
    weeklyReport: false,
    rewardMessage: false,
    emailBenefits: false,
    publicReviewLinks: false,
    redemptionTracking: false,
    prizeDraws: false,
    leadCapture: false,
    automatedNurture: false,
    reputationMonitoring: false,
    webhooks: false,
    apiAccess: false
  },
  starter: {
    pollLimit: 25,
    campaignLimit: 10,
    seatLimit: 3,
    donations: true,
    csvExport: true,
    auditLog: true,
    weeklyReport: true,
    rewardMessage: true,
    emailBenefits: true,
    publicReviewLinks: true,
    redemptionTracking: false,
    prizeDraws: false,
    leadCapture: true,
    automatedNurture: false,
    reputationMonitoring: false,
    webhooks: false,
    apiAccess: false
  },
  growth: {
    pollLimit: 250,
    campaignLimit: 100,
    seatLimit: 10,
    donations: true,
    csvExport: true,
    auditLog: true,
    weeklyReport: true,
    rewardMessage: true,
    emailBenefits: true,
    publicReviewLinks: true,
    redemptionTracking: true,
    prizeDraws: true,
    leadCapture: true,
    automatedNurture: true,
    reputationMonitoring: false,
    webhooks: true,
    apiAccess: true
  }
};

// Human-facing copy for locked-feature upsell prompts, keyed the same as PLAN_FEATURES.
export const FEATURE_COPY = {
  csvExport: { label: "CSV export", minPlan: "starter" },
  auditLog: { label: "Activity/audit log", minPlan: "starter" },
  weeklyReport: { label: "Weekly email reports", minPlan: "starter" },
  rewardMessage: { label: "Post-vote rewards", minPlan: "starter" },
  emailBenefits: { label: "Email-sharing benefits", minPlan: "starter" },
  publicReviewLinks: { label: "Public review invitations", minPlan: "starter" },
  redemptionTracking: { label: "Reward redemption tracking", minPlan: "growth" },
  prizeDraws: { label: "Prize draws / raffles", minPlan: "growth" },
  leadCapture: { label: "Lead capture", minPlan: "starter" },
  automatedNurture: { label: "Automated follow-up emails", minPlan: "growth" },
  webhooks: { label: "Webhooks", minPlan: "growth" },
  apiAccess: { label: "Developer API access", minPlan: "growth" }
};

export function getEntitlements(plan) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
}

export function planLabel(plan) {
  return PLAN_LABELS[plan] || PLAN_LABELS.free;
}

export function minPlanLabelFor(featureKey) {
  const minPlan = FEATURE_COPY[featureKey]?.minPlan || "growth";
  return planLabel(minPlan);
}
