import { RESEARCH_BUSINESS_TYPES, RESEARCH_COUNTRIES } from "./researchOptions.js";
import {
  GOOGLE_PLACES_DISABLED_CODE,
  GOOGLE_PLACES_DISABLED_MESSAGE,
  logGooglePlacesDisabled
} from "../googlePlacesRestriction.js";

export { RESEARCH_BUSINESS_TYPES, RESEARCH_COUNTRIES } from "./researchOptions.js";
export const TARGET_PER_COUNTRY = 10;

export async function runResearchGodwitProspects() {
  logGooglePlacesDisabled("prospect_research");
  return {
    researched: 0,
    inserted: 0,
    countries: {},
    disabled: true,
    code: GOOGLE_PLACES_DISABLED_CODE,
    message: GOOGLE_PLACES_DISABLED_MESSAGE
  };
}
