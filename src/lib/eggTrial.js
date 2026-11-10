const TRIAL_SESSION_PREFIX = "godwit-egg-trial-session";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fallbackSessionIds = new Map();

export function isValidEggTrialSessionId(value) {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function getEggTrialSessionId({ preview = false } = {}) {
  const storageKey = `${TRIAL_SESSION_PREFIX}${preview ? "-preview" : ""}`;
  try {
    const storedId = sessionStorage.getItem(storageKey);
    if (isValidEggTrialSessionId(storedId)) return storedId;
  } catch {
    const fallbackId = fallbackSessionIds.get(storageKey);
    if (fallbackId) return fallbackId;
  }

  const sessionId = globalThis.crypto?.randomUUID?.();
  if (!isValidEggTrialSessionId(sessionId)) {
    throw new Error("A secure browser session identifier could not be created.");
  }

  try {
    sessionStorage.setItem(storageKey, sessionId);
  } catch {
    fallbackSessionIds.set(storageKey, sessionId);
  }
  return sessionId;
}
