import { afterEach, describe, expect, it, vi } from "vitest";
import {
  refreshStripeConnectStatus,
  saveDonationSettings,
  startStripeConnectOnboarding
} from "./donationSettings";
import { startDonationCheckout } from "./donationCheckout";
import { addQrCampaignDonationItem } from "./qrCampaignItems";
import { supabase } from "./supabase";

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn()
  }
}));

describe("client-side donation feature gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("rejects checkout locally without contacting the API while donations are disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(startDonationCheckout({
      campaignToken: "campaign-token",
      itemId: 10,
      amount: 5
    })).rejects.toThrow("Donations are not enabled yet.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks Connect onboarding and status requests before reading the session", async () => {
    await expect(startStripeConnectOnboarding()).rejects.toThrow("Donations are not enabled yet.");
    await expect(refreshStripeConnectStatus()).rejects.toThrow("Donations are not enabled yet.");

    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it("blocks donation settings saves and QR item creation before database writes", async () => {
    await expect(saveDonationSettings("workspace-1", {})).rejects.toThrow("Donations are not enabled yet.");
    await expect(addQrCampaignDonationItem(12)).rejects.toThrow("Donations are not enabled yet.");

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
