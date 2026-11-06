import {
  GOOGLE_PLACES_DISABLED_CODE,
  GOOGLE_PLACES_DISABLED_MESSAGE,
  logGooglePlacesDisabled
} from "../../lib/googlePlacesRestriction.js";

function throwGooglePlacesDisabled(action) {
  logGooglePlacesDisabled(action);
  const error = new Error(GOOGLE_PLACES_DISABLED_MESSAGE);
  error.code = GOOGLE_PLACES_DISABLED_CODE;
  throw error;
}

export async function loadLatestReputationSnapshot() {
  throwGooglePlacesDisabled("reputation_snapshot_read");
}

export async function loadReputationHistory() {
  throwGooglePlacesDisabled("reputation_history_read");
}

export async function refreshReputationSnapshot() {
  throwGooglePlacesDisabled("reputation_refresh");
}
