import {
  GOOGLE_PLACES_DISABLED_CODE,
  logGooglePlacesDisabled
} from "../lib/googlePlacesRestriction.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  logGooglePlacesDisabled("reputation_refresh");
  return response.status(503).json({
    error: "Google Places reputation refresh is disabled.",
    code: GOOGLE_PLACES_DISABLED_CODE
  });
}
