import { afterEach, describe, expect, it, vi } from "vitest";
import { getEggTrialSessionId, isValidEggTrialSessionId } from "./eggTrial";

afterEach(() => vi.unstubAllGlobals());

describe("Egg trial sessions", () => {
  it("reuses a secure session id within the same browser session", () => {
    const values = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    });

    const sessionId = getEggTrialSessionId();
    expect(isValidEggTrialSessionId(sessionId)).toBe(true);
    expect(getEggTrialSessionId()).toBe(sessionId);
  });

  it("keeps authenticated staff previews separate from customer sessions", () => {
    const values = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    });

    expect(getEggTrialSessionId({ preview: true })).not.toBe(getEggTrialSessionId());
  });

  it("rejects malformed or non-UUID session values", () => {
    expect(isValidEggTrialSessionId("not-a-session")).toBe(false);
    expect(isValidEggTrialSessionId(null)).toBe(false);
  });
});
