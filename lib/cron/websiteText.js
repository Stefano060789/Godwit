export function extractWebsiteText(html) {
  const descriptions = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => {
      const descriptionTag = /\b(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag);
      return descriptionTag ? tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] : null;
    })
    .filter(Boolean);
  const visibleText = html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return [html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], ...descriptions, visibleText]
    .filter(Boolean)
    .join(" ")
    .replace(/&commat;|&#0*64;|&#x0*40;/gi, "@")
    .replace(/&period;|&#0*46;|&#x0*2e;/gi, ".")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
