import { describe, expect, it } from "vitest";
import { buildEggUrl, normalizeEggAccessMethod } from "./eggs";

describe("Egg access URLs", () => {
  it("builds a QR URL for the stable Egg destination", () => {
    expect(buildEggUrl("https://godwit.example", "egg-token"))
      .toBe("https://godwit.example/qr/egg-token?via=qr");
  });

  it("builds an NFC URL to the same destination with tap attribution", () => {
    expect(buildEggUrl("https://godwit.example", "egg-token", "nfc"))
      .toBe("https://godwit.example/qr/egg-token?via=nfc");
  });

  it("encodes tokens and treats unknown access methods as QR", () => {
    expect(buildEggUrl("https://godwit.example", "a token", "image"))
      .toBe("https://godwit.example/qr/a%20token?via=qr");
    expect(normalizeEggAccessMethod("image")).toBe("qr");
    expect(normalizeEggAccessMethod("nfc")).toBe("nfc");
  });
});
