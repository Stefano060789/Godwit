import { afterEach, describe, expect, it } from "vitest";
import handler from "../../api/cron.js";

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

describe("cron system-status route", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.APP_URL;
  });

  it("requires the cron secret", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    const response = makeResponse();

    await handler({ method: "GET", query: { job: "system-status" }, headers: {} }, response);

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized." });
  });

  it("returns integration configuration without revealing secret values", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-be-returned";
    process.env.APP_URL = "https://hellogodwit.com";
    const response = makeResponse();

    await handler({
      method: "GET",
      query: { job: "system-status" },
      headers: { authorization: "Bearer cron-test-secret" }
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.core).toEqual({ supabase: true, appUrl: true });
    expect(response.body.reputation).toEqual({ googlePlacesEnabled: false });
    expect(JSON.stringify(response.body)).not.toContain("must-not-be-returned");
  });
});
