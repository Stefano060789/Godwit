import { describe, expect, it } from "vitest";
import { hasOptionalPollExtras } from "./InlinePollVote";

describe("optional poll response options", () => {
  it("does not offer a separate page for a standard poll", () => {
    expect(hasOptionalPollExtras({})).toBe(false);
    expect(hasOptionalPollExtras({ email_benefit_type: "none", review_benefit_type: "none" })).toBe(false);
  });

  it("keeps the separate page available when optional extras are configured", () => {
    expect(hasOptionalPollExtras({ allow_organizer_messages: true })).toBe(true);
    expect(hasOptionalPollExtras({ raffle_enabled: true })).toBe(true);
    expect(hasOptionalPollExtras({ email_benefit_type: "discount" })).toBe(true);
    expect(hasOptionalPollExtras({ review_benefit_type: "review" })).toBe(true);
  });
});
