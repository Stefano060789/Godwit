import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../src/components/EggDashboard.css", import.meta.url), "utf8");

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)]
    .map(([, name, value]) => [name, value]));
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const light = tokens(":root");
const dark = { ...light, ...tokens('[data-theme="dark"]') };

describe.each([["light", light], ["dark", dark]])("%s Venus palette", (_, palette) => {
  it.each(["--canvas", "--surface", "--surface-soft", "--teal-soft", "--rose-soft"])(
    "keeps main, supporting, and link text readable on %s",
    (background) => {
      for (const foreground of ["--ink", "--muted", "--link", "--gold-deep"]) {
        expect(contrast(palette[foreground], palette[background]), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  );

  it("keeps normal and hover action text readable", () => {
    for (const background of ["--action-primary", "--action-primary-hover"]) {
      expect(contrast(palette["--action-on-dark"], palette[background])).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ["--action-accent", "--action-accent-hover"]) {
      expect(contrast(palette["--action-on-accent"], palette[background])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps input borders and keyboard focus distinguishable", () => {
    expect(contrast(palette["--control-line"], palette["--input-surface"])).toBeGreaterThanOrEqual(3);
    for (const background of ["--surface", "--teal-soft"]) {
      expect(contrast(palette["--focus-ring"], palette[background])).toBeGreaterThanOrEqual(3);
    }
  });
});

it("shares the palette with dashboard and guide components", () => {
  expect(dashboardCss).toContain("--hub-ink: var(--ink)");
  expect(dashboardCss).toContain("--hub-active: var(--teal-soft)");
  expect(css).toContain("--guide-selection: var(--teal-soft)");
});

it("uses visibly distinct sky, peach, and rose rather than the previous sage palette", () => {
  expect(light["--sky"]).toBe("#bad2db");
  expect(light["--rose-soft"]).toBe("#efc3b7");
  expect(light["--action-primary"]).toBe("#84463e");
  expect(dark["--canvas"]).toBe("#192e34");
  expect(css).toContain("linear-gradient(150deg, var(--sky) 0%, var(--blue-soft) 48%, var(--canvas) 100%)");
  expect(css).toContain(".landing-hero-visual::before");
  expect(dashboardCss).toContain("linear-gradient(120deg, var(--blue-soft), var(--hub-background))");
});

it("preserves the label contrast on legacy utility-styled actions", () => {
  expect(css).toMatch(/:root \.workspace-page :is\(\.bg-blue-600,[^)]+\)\s*\{\s*color: var\(--action-on-accent\) !important;/);
  expect(css).toMatch(/:root \.workspace-page :is\(\.bg-violet-600,[^)]+\)\s*\{\s*color: var\(--action-on-dark\) !important;/);
});

it.each(["godwit-mark", "godwit-logo-lockup"])("preserves the golden bird in %s", (name) => {
  const svg = readFileSync(new URL(`../src/assets/${name}.svg`, import.meta.url), "utf8");
  expect(svg).toContain('stop-color="#b8873f"');
  expect(svg).toContain('stop-color="#dcb66d"');
  expect(svg).toContain('stop-color="#efdab0"');
  expect(svg).toContain('fill="url(#gold)"');
});

it("adapts the logo lettering to the explicitly selected color scheme", () => {
  const svg = readFileSync(new URL("../src/assets/godwit-logo-lockup.svg", import.meta.url), "utf8");
  expect(svg).toContain(".logo-lettering { fill: #31594e; }");
  expect(svg).toContain("@media (prefers-color-scheme: dark)");
  expect(svg).toContain(".logo-lettering { fill: #f4ebda; }");
  expect(css).toContain("color-scheme: light;");
  expect(css).toContain("color-scheme: dark;");
});
