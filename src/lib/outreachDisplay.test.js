import { describe, expect, it } from "vitest";
import {
  filterHiddenOutreachContacts,
  getPublicEmailLookupMessage,
  getPublicEmailSearchUrl,
  getOutreachContactIds,
  groupOutreachContactsByCountry,
  isReviewedOutreachContact
} from "./outreachDisplay.js";

describe("outreach display filtering", () => {
  it("counts either approved review as reviewed", () => {
    expect(isReviewedOutreachContact({ business_review_status: "approved" })).toBe(true);
    expect(isReviewedOutreachContact({ message_review_status: "approved" })).toBe(true);
    expect(isReviewedOutreachContact({
      business_review_status: "pending",
      message_review_status: "pending"
    })).toBe(false);
  });

  describe("public email discovery helpers", () => {
    it("explains when web search is unavailable rather than saying no email exists", () => {
      expect(getPublicEmailLookupMessage({
        email: null,
        status: "not_found",
        websiteStatus: "not_found",
        searchStatus: "not_configured"
      })).toContain("Add SERPAPI_API_KEY");
    });

    it("summarizes an unsuccessful lookup without implying the email is guessed", () => {
      expect(getPublicEmailLookupMessage({
        email: null,
        status: "not_found",
        websiteStatus: "no_website"
      })).toContain("No address was guessed");
    });

    it("builds a direct web search for a business and its location", () => {
      const url = new URL(getPublicEmailSearchUrl({
        company_name: "Example Hotel",
        city: "Vienna",
        country: "Austria"
      }));
      expect(url.origin).toBe("https://www.google.com");
      expect(url.searchParams.get("q")).toBe("Example Hotel Vienna Austria business contact email");
    });
  });

  it("always hides reviewed items and filters locally cleaned prospects", () => {
    const contacts = [
      { id: "pending", business_review_status: "pending", message_review_status: "pending" },
      { id: "business-reviewed", business_review_status: "approved", message_review_status: "pending" },
      { id: "message-reviewed", business_review_status: "pending", message_review_status: "approved" }
    ];

    expect(getOutreachContactIds(contacts)).toEqual(["pending", "business-reviewed", "message-reviewed"]);
    expect(filterHiddenOutreachContacts(contacts, new Set()))
      .toEqual([contacts[0]]);
    expect(filterHiddenOutreachContacts(contacts, new Set(["pending"]))).toEqual([]);
  });

  it("groups prospects by country and keeps unclassified prospects together", () => {
    const contacts = [
      { id: "italy", country: "Italy" },
      { id: "unknown", country: null },
      { id: "austria", country: "Austria" },
      { id: "italy-2", country: "Italy" }
    ];

    expect(groupOutreachContactsByCountry(contacts)).toEqual([
      { country: "Austria", contacts: [contacts[2]] },
      { country: "Country unknown", contacts: [contacts[1]] },
      { country: "Italy", contacts: [contacts[0], contacts[3]] }
    ]);
  });
});
