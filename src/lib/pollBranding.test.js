import { describe, expect, it } from "vitest";
import { getContrastingTextColor } from "./pollBranding";

describe("getContrastingTextColor", () => {
  it("uses dark text on a light green brand color", () => {
    expect(getContrastingTextColor("#a8d5a2")).toBe("#172b2b");
  });

  it("uses light text on a dark brand color", () => {
    expect(getContrastingTextColor("#176f68")).toBe("#fff8e9");
  });

  it("accepts three-digit hex colors", () => {
    expect(getContrastingTextColor("#fff")).toBe("#172b2b");
  });

  it("falls back to a readable dark foreground for invalid colors", () => {
    expect(getContrastingTextColor("not-a-color")).toBe("#172b2b");
  });
});
