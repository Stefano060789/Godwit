import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { rpc, from } }));

import { saveIssueAlertSettings, submitEggIssue } from "./issueReports";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

describe("Egg issue reports", () => {
  it("persists a report and dispatches alerts using the server-issued token", async () => {
    rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { issue_id: 17, notification_token: "dispatch-token" },
        error: null
      })
    });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ email: { enabled: false, sent: false }, sms: { enabled: false, sent: false } })
    });

    const result = await submitEggIssue({
      campaignId: 42,
      category: "safety",
      description: "A step is loose near the entrance.",
      sessionId: "visitor-session"
    });

    expect(rpc).toHaveBeenCalledWith("report_egg_issue", {
      target_campaign_id: 42,
      issue_category: "safety",
      issue_description: "A step is loose near the entrance.",
      target_session_id: "visitor-session"
    });
    expect(fetch).toHaveBeenCalledWith("/api/notify", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ type: "egg_issue", issueId: 17, dispatchToken: "dispatch-token" })
    }));
    expect(result.email.enabled).toBe(false);
  });

  it("does not dispatch alerts if the report could not be saved", async () => {
    rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "Invalid campaign" } })
    });

    await expect(submitEggIssue({
      campaignId: 42,
      category: "safety",
      description: "A step is loose near the entrance.",
      sessionId: "visitor-session"
    })).rejects.toThrow("Invalid campaign");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires valid recipients before enabling external alert channels", async () => {
    await expect(saveIssueAlertSettings({
      workspace_id: "workspace-1",
      email_enabled: true,
      sms_enabled: false,
      recipient_email: "not-an-email"
    })).rejects.toThrow("Enter a valid alert email address.");
    await expect(saveIssueAlertSettings({
      workspace_id: "workspace-1",
      email_enabled: false,
      sms_enabled: true,
      recipient_phone: "5551234567"
    })).rejects.toThrow("Enter a phone number in international format");
    expect(from).not.toHaveBeenCalled();
  });
});
