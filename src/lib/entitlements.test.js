import { describe, it, expect } from "vitest";
import { getEntitlements, planLabel, minPlanLabelFor, PLAN_FEATURES } from "./entitlements";

describe("getEntitlements", () => {
  it("returns the free plan for an unknown or missing plan", () => {
    expect(getEntitlements(undefined)).toEqual(PLAN_FEATURES.free);
    expect(getEntitlements("not-a-real-plan")).toEqual(PLAN_FEATURES.free);
  });

  it("free plan has one QR campaign, no seats beyond the owner, and no automation", () => {
    const free = getEntitlements("free");
    expect(free.campaignLimit).toBe(1);
    expect(free.seatLimit).toBe(1);
    expect(free.automatedNurture).toBe(false);
    expect(free.webhooks).toBe(false);
    expect(free.apiAccess).toBe(false);
  });

  it("starter plan unlocks basics but not growth-only automation", () => {
    const starter = getEntitlements("starter");
    expect(starter.csvExport).toBe(true);
    expect(starter.rewardMessage).toBe(true);
    expect(starter.redemptionTracking).toBe(false);
    expect(starter.prizeDraws).toBe(false);
    expect(starter.automatedNurture).toBe(false);
  });

  it("growth plan unlocks available features but not disabled reputation monitoring", () => {
    const growth = getEntitlements("growth");
    Object.entries(growth).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        expect(value, `${key} should match the growth feature set`).toBe(
          key === "reputationMonitoring" ? false : true
        );
      }
    });
  });

  it("keeps Google Places reputation monitoring unavailable on every plan", () => {
    for (const plan of ["free", "starter", "growth"]) {
      expect(getEntitlements(plan).reputationMonitoring).toBe(false);
    }
  });

  it("plan limits increase monotonically from free to starter to growth", () => {
    const free = getEntitlements("free");
    const starter = getEntitlements("starter");
    const growth = getEntitlements("growth");
    expect(starter.pollLimit).toBeGreaterThan(free.pollLimit);
    expect(growth.pollLimit).toBeGreaterThan(starter.pollLimit);
    expect(starter.seatLimit).toBeGreaterThan(free.seatLimit);
    expect(growth.seatLimit).toBeGreaterThan(starter.seatLimit);
  });
});

describe("planLabel", () => {
  it("returns a human label for each known plan", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("starter")).toBe("Starter");
    expect(planLabel("growth")).toBe("Growth");
  });

  it("falls back to the Free label for an unknown plan", () => {
    expect(planLabel("bogus")).toBe("Free");
  });
});

describe("minPlanLabelFor", () => {
  it("reports the correct minimum plan for a growth-only feature", () => {
    expect(minPlanLabelFor("webhooks")).toBe("Growth");
    expect(minPlanLabelFor("apiAccess")).toBe("Growth");
  });

  it("reports the correct minimum plan for a starter feature", () => {
    expect(minPlanLabelFor("csvExport")).toBe("Starter");
  });
});
