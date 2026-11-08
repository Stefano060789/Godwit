export function normalizeEggEmailBenefit(benefit = {}) {
  const type = benefit.type || "none";
  if (!["none", "voucher", "discount_code"].includes(type)) {
    throw new Error("Choose a valid customer benefit.");
  }
  if (type === "none") {
    return { email_benefit_type: "none", email_benefit_value: null, email_benefit_url: null };
  }
  const value = String(benefit.value || "").trim();
  const url = String(benefit.url || "").trim();
  if ((!value && !url) || value.length > 200 || url.length > 500) {
    throw new Error("Enter a voucher, discount code, or redemption link.");
  }
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Use a valid HTTPS redemption link.");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      throw new Error("Use a valid HTTPS redemption link.");
    }
  }
  return {
    email_benefit_type: type,
    email_benefit_value: value || null,
    email_benefit_url: url || null
  };
}
