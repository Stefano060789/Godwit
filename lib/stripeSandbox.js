// Public test catalogue identifiers only. Never put API keys or signing secrets here.
export const STRIPE_SANDBOX_ACCOUNT = "acct_1UQsxxC5ufGRzg9R";
export const STRIPE_SANDBOX_PLANS = {
  starter: { label: "Starter", priceId: "price_1UYp5jC5ufGRzg9RpDhQdAl5", productId: "prod_VZz3nie3Csda5A", amount: 2900 },
  growth: { label: "Growth", priceId: "price_1UYp7CC5ufGRzg9RnA4pt2On", productId: "prod_VZz5Z2tJToSc6N", amount: 7900 }
};

export function requireStripeSandbox() {
  if (process.env.BILLING_ENABLED !== "1" || process.env.STRIPE_SANDBOX_ENABLED !== "1") {
    throw new Error("Stripe sandbox billing is disabled.");
  }
  const storageUrl = process.env.STRIPE_SANDBOX_SUPABASE_URL;
  const appStorageUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (process.env.STRIPE_SANDBOX_ISOLATED_STORAGE_ACK !== "1" || !storageUrl
    || storageUrl !== appStorageUrl) {
    throw new Error("Stripe sandbox requires acknowledged isolated billing storage.");
  }
  let parsedStorageUrl;
  try {
    parsedStorageUrl = new URL(storageUrl);
  } catch {
    throw new Error("Stripe sandbox storage URL is invalid.");
  }
  if (parsedStorageUrl.protocol !== "https:" || parsedStorageUrl.username || parsedStorageUrl.password) {
    throw new Error("Stripe sandbox storage requires an HTTPS project URL.");
  }
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key)) {
    throw new Error("Stripe sandbox requires a test API key.");
  }
  return key;
}

export function requireTestStripeObject(object) {
  if (!object || object.livemode !== false) {
    throw new Error("Stripe sandbox rejected a non-test response.");
  }
  return object;
}

export async function stripeSandboxRequest(path, { form, method = "GET" } = {}) {
  const key = requireStripeSandbox();
  const response = await fetch(`https://api.stripe.com/v1/${path.replace(/^\//, "")}`, {
    method,
    headers: {
      Authorization: ["Bearer", key].join(" "),
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: method === "GET" ? undefined : form
  });
  if (!response.ok) throw new Error(`Stripe sandbox request failed (${response.status}).`);
  const object = await response.json();
  // Stripe's Account object has no livemode field; validate its identity instead.
  if (path.replace(/^\//, "") === "account") {
    if (object.id !== STRIPE_SANDBOX_ACCOUNT || object.livemode === true) {
      throw new Error("Stripe sandbox account does not match.");
    }
    return object;
  }
  return requireTestStripeObject(object);
}

export function validateSandboxPrice(price, planKey) {
  const plan = STRIPE_SANDBOX_PLANS[planKey];
  requireTestStripeObject(price);
  if (!plan?.priceId || !plan.productId || price.id !== plan.priceId
    || (price.product?.id || price.product) !== plan.productId
    || price.currency !== "eur" || price.unit_amount !== plan.amount
    || price.type !== "recurring" || price.recurring?.interval !== "month"
    || price.recurring?.interval_count !== 1) {
    throw new Error("Stripe sandbox price does not match the Godwit catalogue.");
  }
  return plan;
}

export function hasGodwitSandboxMetadata(object) {
  return object?.metadata?.app === "godwit"
    && object.metadata.billing_environment === "sandbox";
}

export function validateSandboxSubscription(subscription, expectedMetadata) {
  requireTestStripeObject(subscription);
  const metadata = subscription.metadata;
  if (!/^sub_[A-Za-z0-9]+$/.test(subscription.id || "")
    || !/^cus_[A-Za-z0-9]+$/.test(subscription.customer || "")
    || !hasGodwitSandboxMetadata(subscription) || typeof metadata.workspace_id !== "string"
    || !metadata.workspace_id.trim()
    || !Object.hasOwn(STRIPE_SANDBOX_PLANS, metadata.plan)
    || (expectedMetadata && ["app", "billing_environment", "workspace_id", "plan"]
      .some((key) => metadata[key] !== expectedMetadata[key]))) {
    throw new Error("Stripe sandbox subscription metadata does not match.");
  }
  const items = subscription.items;
  if (!Array.isArray(items?.data) || items.has_more || items.data.length !== 1
    || items.data[0].quantity !== 1) {
    throw new Error("Stripe sandbox subscription items do not match.");
  }
  validateSandboxPrice(items.data[0].price, metadata.plan);
  return subscription;
}
