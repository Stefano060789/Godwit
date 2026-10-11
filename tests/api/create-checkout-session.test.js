import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/create-checkout-session.js";

const originalEnv = { ...process.env };

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {}
  };
}

function makeRequest(body) {
  return { method: "POST", headers: {}, body };
}

describe("create-checkout-session donation feature gate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it.each(["donation", "connect-onboarding", "connect-status"])(
    "rejects %s before making network requests while donations are disabled",
    async (mode) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = makeResponse();
      await handler(makeRequest({ mode }), response);

      expect(response.statusCode).toBe(503);
      expect(response.body.error).toBe("Donations are not enabled yet.");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("keeps subscription checkout behind its independent billing gate", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.BILLING_ENABLED = "0";

    const response = makeResponse();
    await handler(makeRequest({ mode: "subscription" }), response);

    expect(response.statusCode).toBe(503);
    expect(response.body.error).toBe("Paid subscriptions are unavailable during the free pilot.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
