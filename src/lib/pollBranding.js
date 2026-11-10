import { readPollMeta } from "./pollMeta";

export const DEFAULT_PRIMARY_COLOR = "#0f766e";
export const DEFAULT_ACCENT_COLOR = "#172b2b";

export function getContrastingTextColor(backgroundColor) {
  const hex = typeof backgroundColor === "string" ? backgroundColor.trim() : "";
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex);
  if (!match) return "#172b2b";

  const digits = match[1].length === 3
    ? [...match[1]].map((digit) => digit + digit).join("")
    : match[1];
  const channels = [0, 2, 4].map((index) => {
    const value = Number.parseInt(digits.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.179 ? "#172b2b" : "#fff8e9";
}

export function getPollBranding(poll) {
  const pollMeta = readPollMeta(poll?.id);
  return {
    brandName: poll?.brand_name ?? pollMeta.brand_name ?? "",
    logoUrl: poll?.brand_logo_url ?? pollMeta.brand_logo_url ?? "",
    primaryColor: poll?.brand_primary_color ?? pollMeta.brand_primary_color ?? DEFAULT_PRIMARY_COLOR,
    accentColor: poll?.brand_accent_color ?? pollMeta.brand_accent_color ?? DEFAULT_ACCENT_COLOR
  };
}
