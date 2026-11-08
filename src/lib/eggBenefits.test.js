import { describe, expect, it } from "vitest";
import { normalizeEggEmailBenefit } from "./eggBenefits";

describe("Egg email thank-you", () => {
  it("clears stale fields when no benefit is selected", () => {
    expect(normalizeEggEmailBenefit({ type: "none", value: "OLD", url: "https://example.com" }))
      .toEqual({ email_benefit_type: "none", email_benefit_value: null, email_benefit_url: null });
  });
  it("normalizes a business-supplied code and optional HTTPS link", () => {
    expect(normalizeEggEmailBenefit({ type: "discount_code", value: " THANKS10 ", url: " https://example.com/redeem " }))
      .toEqual({ email_benefit_type: "discount_code", email_benefit_value: "THANKS10", email_benefit_url: "https://example.com/redeem" });
  });
  it.each([
    { type: "public_review_reward" },
    { type: "voucher" },
    { type: "voucher", url: "javascript:alert(1)" },
    { type: "voucher", url: "http://example.com" },
    { type: "voucher", url: "https://user:password@example.com" },
    { type: "voucher", value: "x".repeat(201) }
  ])("rejects invalid benefit %j", (benefit) => {
    expect(() => normalizeEggEmailBenefit(benefit)).toThrow();
  });
});
