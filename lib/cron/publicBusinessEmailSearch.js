const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const GENERIC_NAME_WORDS = new Set([
  "and", "by", "cafe", "center", "centre", "coffee", "cultural", "gallery",
  "guest", "guesthouse", "hotel", "malaysia", "museum", "of", "restaurant",
  "roaster", "roasters", "the", "venue"
]);

function collectStrings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function getBusinessTokens(companyName) {
  return String(companyName || "")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !GENERIC_NAME_WORDS.has(token));
}

function isRelevantResult(result, companyName) {
  const identityText = collectStrings([result.title, result.link]).join(" ").toLocaleLowerCase();
  const identityTokens = new Set(identityText.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const businessTokens = getBusinessTokens(companyName);
  if (businessTokens.length > 0) {
    const matchingTokens = businessTokens.filter((token) => identityTokens.has(token));
    return matchingTokens.length >= Math.min(3, businessTokens.length);
  }
  const normalizedName = String(companyName || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return Boolean(normalizedName && identityText.includes(normalizedName));
}

function findPublishedEmail(result) {
  const searchableText = collectStrings([result.title, result.snippet, result.rich_snippet]).join(" ");
  const emails = [...new Set(searchableText.match(EMAIL_PATTERN) || [])]
    .map((email) => email.toLowerCase())
    .filter((email) => !/^(?:noreply|no-reply|donotreply|privacy|dpo)@/.test(email));
  return emails.sort((left, right) => {
    const commonMailbox = /^(info|contact|hello|office|reception|booking|reservations|sales|enquiries|inquiries)@/i;
    return Number(!commonMailbox.test(left)) - Number(!commonMailbox.test(right));
  })[0] || null;
}

export async function searchPublicBusinessEmail({ companyName, country, city } = {}) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) return { email: null, status: "not_configured" };
  if (!companyName?.trim()) return { email: null, status: "missing_business_name" };

  const query = [
    `"${companyName.trim()}"`,
    city?.trim(),
    country?.trim(),
    "contact email"
  ].filter(Boolean).join(" ");
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch {
    throw new Error("SerpApi business email search could not connect.");
  }

  const rawBody = await response.text();
  let data;
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Error(`SerpApi business email search returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || data.error) {
    const detail = (typeof data.error === "string" ? data.error : "request failed").replaceAll(apiKey, "[redacted]");
    throw new Error(`SerpApi business email search failed (HTTP ${response.status}): ${detail}`);
  }

  const results = Array.isArray(data.organic_results) ? data.organic_results : [];
  for (const result of results) {
    if (!isRelevantResult(result, companyName)) continue;
    const email = findPublishedEmail(result);
    if (email) {
      let sourceUrl;
      try {
        const url = new URL(result.link);
        if ((url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password) {
          sourceUrl = url.href;
        }
      } catch {
        sourceUrl = undefined;
      }
      return {
        email,
        status: "found",
        source: "web_search",
        ...(sourceUrl ? { sourceUrl } : {})
      };
    }
  }
  return { email: null, status: "not_found" };
}
