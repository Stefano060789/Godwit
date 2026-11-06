export const GOOGLE_PLACES_DISABLED_CODE = "google_places_disabled";
export const GOOGLE_PLACES_DISABLED_MESSAGE = "Google Places features are disabled.";

export function logGooglePlacesDisabled(action) {
  console.warn("Google Places feature disabled.", {
    action,
    code: GOOGLE_PLACES_DISABLED_CODE
  });
}
