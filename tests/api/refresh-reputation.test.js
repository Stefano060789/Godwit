import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/refresh-reputation.js";

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

describe("refresh-reputation route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns an explicit disabled response without reading or writing Google data", async () => {
    const fetchMock = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    const response = makeResponse();

    await handler({ method: "POST", headers: {}, body: { workspaceId: "workspace-1" } }, response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: "Google Places reputation refresh is disabled.",
      code: "google_places_disabled"
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Google Places feature disabled.", {
      action: "reputation_refresh",
      code: "google_places_disabled"
    });
  });
});
