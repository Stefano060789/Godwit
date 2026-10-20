import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { searchPublicBusinessEmail } from "./publicBusinessEmailSearch.js";

const MAX_HTML_BYTES = 1_000_000;
const MAX_PAGES = 6;
const PAGE_TIMEOUT_MS = 2_500;
const CONTACT_LINK_PATTERN = /contact|kontakt|contatt|impressum|imprint|about|azienda|chi-siamo|contato|contacto/i;
const BUSINESS_CONTENT_LINK_PATTERN =
  /about|service|menu|room|stay|event|experience|tour|activity|activities|property|properties|listing|shop|product|gallery|exhibition|visit|angebot|zimmer|speisekarte|erlebnis|veranstaltung|immobilien|wohnung|camere|esperienza|attivita|eventi|negozio|prodotti|visita|tour|menu/i;
const EMAIL_PATTERN = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const COMMON_CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/kontakt",
  "/impressum",
  "/imprint",
  "/contatti",
  "/contato",
  "/contacto",
  "/about",
  "/about-us",
  "/azienda",
  "/chi-siamo"
];
const COUNTRY_CONTACT_PATHS = {
  Austria: ["/kontakt", "/impressum"],
  Italy: ["/contatti", "/contatto", "/azienda", "/chi-siamo"],
  Malaysia: ["/contact", "/contact-us"]
};

function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [first, second, third] = octets;
    return !(
      first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }
  if (version === 6) {
    const firstGroup = Number.parseInt(address.split(":")[0] || "0", 16);
    return firstGroup >= 0x2000 && firstGroup <= 0x3fff && !address.toLowerCase().startsWith("2001:db8:");
  }
  return false;
}

function decodeEntities(value) {
  return value
    .replace(/&commat;|&#0*64;|&#x0*40;/gi, "@")
    .replace(/&period;|&#0*46;|&#x0*2e;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function normalizeEmailCandidates(text) {
  const normalized = decodeEntities(text)
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\sat\s)\s*/gi, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\sdot\s)\s*/gi, ".");
  return [...new Set(normalized.match(EMAIL_PATTERN) || [])]
    .map((email) => email.toLowerCase())
    .filter((email) => !/^(?:noreply|no-reply|donotreply|privacy|dpo)@/.test(email));
}

function rankEmail(email) {
  const localPart = email.split("@")[0];
  if (/^(info|contact|hello|office|reception|booking|reservations|hotel|guest|sales|welcome|frontdesk)$/.test(localPart)) return 0;
  if (/^(admin|support|mail|service|enquiries|inquiries)$/.test(localPart)) return 1;
  return 2;
}

function getContactLinks(html, baseUrl) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const [, , href, innerText] = match;
    const searchable = decodeEntities(`${href} ${innerText.replace(/<[^>]*>/g, " ")}`);
    if (!CONTACT_LINK_PATTERN.test(searchable)) continue;
    try {
      const url = new URL(decodeEntities(href), baseUrl);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.hostname === new URL(baseUrl).hostname &&
        !url.username && !url.password
      ) {
        url.hash = "";
        links.push(url.href);
      }
    } catch {
      continue;
    }
  }
  return [...new Set(links)];
}

function getBusinessContentLinks(html, baseUrl) {
  const links = [];
  const base = new URL(baseUrl);
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const [, , href, innerText] = match;
    const searchable = decodeEntities(`${href} ${innerText.replace(/<[^>]*>/g, " ")}`);
    if (!BUSINESS_CONTENT_LINK_PATTERN.test(searchable)) continue;
    try {
      const url = new URL(decodeEntities(href), baseUrl);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.hostname !== base.hostname ||
        url.username || url.password
      ) {
        continue;
      }
      url.hash = "";
      links.push(url.href);
    } catch {
      continue;
    }
  }
  return [...new Set(links)];
}

function getCommonContactLinks(baseUrl, country) {
  const base = new URL(baseUrl);
  const countryPaths = COUNTRY_CONTACT_PATHS[country] || [];
  return [...new Set([...countryPaths, ...COMMON_CONTACT_PATHS])]
    .map((path) => new URL(path, base.origin).href);
}

function isSameWebsiteHost(expectedHostname, candidateHostname) {
  const withoutWww = (hostname) => hostname.toLowerCase().replace(/^www\./, "");
  return expectedHostname === candidateHostname ||
    withoutWww(expectedHostname) === withoutWww(candidateHostname);
}

function isAllowedWebsiteUrl(value, expectedHostname) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    (url.port && url.port !== "80" && url.port !== "443") ||
    url.username || url.password ||
    hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") ||
    isIP(hostname) ||
    (expectedHostname && !isSameWebsiteHost(expectedHostname, hostname))
  ) {
    return null;
  }
  return url;
}

async function fetchPublicHtml(initialUrl) {
  const initial = isAllowedWebsiteUrl(initialUrl);
  if (!initial) return { status: "unsafe_website", html: "", finalUrl: null };

  let currentUrl = initial;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    let addresses;
    try {
      addresses = await lookup(currentUrl.hostname, { all: true, verbatim: true });
    } catch {
      return { status: "website_unavailable", html: "", finalUrl: null };
    }
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
      return { status: "unsafe_website", html: "", finalUrl: null };
    }

    let response;
    try {
      response = await fetch(currentUrl, {
        headers: { Accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
      });
    } catch {
      return { status: "website_unavailable", html: "", finalUrl: null };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) return { status: "website_unavailable", html: "", finalUrl: null };
      let redirectUrl;
      try {
        redirectUrl = new URL(location, currentUrl).href;
      } catch {
        return { status: "website_unavailable", html: "", finalUrl: null };
      }
      const nextUrl = isAllowedWebsiteUrl(redirectUrl, initial.hostname);
      if (!nextUrl) return { status: "unsafe_website", html: "", finalUrl: null };
      currentUrl = nextUrl;
      continue;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) {
      return { status: "website_unavailable", html: "", finalUrl: null };
    }

    const reader = response.body?.getReader();
    if (!reader) return { status: "website_unavailable", html: "", finalUrl: null };
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_HTML_BYTES) {
          await reader.cancel();
          return { status: "website_too_large", html: "", finalUrl: currentUrl.href };
        }
        chunks.push(value);
      }
    } catch {
      return { status: "website_unavailable", html: "", finalUrl: null };
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: "ok",
      html: new TextDecoder().decode(bytes),
      finalUrl: currentUrl.href
    };
  }
  return { status: "website_unavailable", html: "", finalUrl: null };
}

export async function getPublicBusinessWebsiteContext(websiteUri) {
  if (!websiteUri) return { text: "", status: "no_website" };
  const page = await fetchPublicHtml(websiteUri);
  if (page.status !== "ok") return { text: "", status: page.status };

  const getPageText = (html) => {
    const metaDescriptions = [...html.matchAll(/<meta\b[^>]*>/gi)]
      .map(([tag]) => {
        const descriptionTag = /\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag);
        return descriptionTag ? tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] : null;
      })
      .filter(Boolean);
    const metadata = [
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1],
      ...metaDescriptions
    ];
    const visibleText = html
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ");
    return decodeEntities([...metadata, visibleText]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " "))
      .trim();
  };

  const linkedUrls = getBusinessContentLinks(page.html, page.finalUrl).slice(0, MAX_PAGES - 1);
  const linkedPages = await Promise.all(linkedUrls.map((url) => fetchPublicHtml(url)));
  const pageSections = [
    { url: page.finalUrl, text: getPageText(page.html) },
    ...linkedPages
      .filter(({ status }) => status === "ok")
      .map(({ finalUrl, html }) => ({ url: finalUrl, text: getPageText(html) }))
  ];
  const text = pageSections
    .filter(({ text: sectionText }) => sectionText)
    .map(({ url, text: sectionText }) => `${url}: ${sectionText}`)
    .join(" ")
    .slice(0, 6000);

  return { text, status: text ? "found" : "no_page_text", sourceUrl: page.finalUrl };
}

function findEmail(html) {
  const visibleText = decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " "));
  const candidates = [
    ...normalizeEmailCandidates(html.match(/mailto:\s*[^"'?\s<>]+/gi)?.join(" ") || ""),
    ...normalizeEmailCandidates(html),
    ...normalizeEmailCandidates(visibleText)
  ];
  return [...new Set(candidates)].sort((left, right) => rankEmail(left) - rankEmail(right))[0] || null;
}

export async function findPublicBusinessEmail(websiteUri, businessContext) {
  let websiteResult = { email: null, status: "no_website" };
  if (websiteUri) {
    const home = await fetchPublicHtml(websiteUri);
    websiteResult = { email: null, status: home.status };
    if (home.status === "ok") {
      const foundOnHome = findEmail(home.html);
      if (foundOnHome) {
        return { email: foundOnHome, status: "found", source: "website", sourceUrl: home.finalUrl };
      }

      const contactUrls = [...new Set([
        ...getContactLinks(home.html, home.finalUrl),
        ...getCommonContactLinks(home.finalUrl, businessContext?.country)
      ])].slice(0, MAX_PAGES - 1);
      for (const contactUrl of contactUrls) {
        const page = await fetchPublicHtml(contactUrl);
        if (page.status !== "ok") continue;
        const email = findEmail(page.html);
        if (email) return { email, status: "found", source: "website", sourceUrl: page.finalUrl };
      }
      websiteResult = { email: null, status: "not_found" };
    }
  }

  if (!businessContext) return websiteResult;
  const searchResult = await searchPublicBusinessEmail(businessContext);
  if (searchResult.email) return searchResult;
  if (searchResult.status === "not_configured") {
    return { ...websiteResult, searchStatus: searchResult.status };
  }
  return { email: null, status: searchResult.status, websiteStatus: websiteResult.status };
}
