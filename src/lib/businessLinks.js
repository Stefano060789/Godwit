export function safeBusinessUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !host.includes(".") || host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function buildBusinessLinks(sources) {
  const seen = new Set();
  return sources.flatMap((source) => {
    const url = safeBusinessUrl(source.source_url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      url,
      title: source.source_type === "instagram" ? "Instagram"
        : source.source_type === "facebook" ? "Facebook"
          : String(source.title || new URL(url).hostname).slice(0, 120)
    }];
  }).slice(0, 8);
}
