import { describe, expect, it } from "vitest";
import { createEggQrArtwork, EGG_PRINT_FORMATS, eggPrintDimensions, eggPrintDocument } from "./eggQrPrint";

describe("Egg QR artwork and printing", () => {
  it.each(Object.keys(EGG_PRINT_FORMATS))("fits the %s paper and matches reported QR dimensions", format => {
    const paper = eggPrintDimensions(format);
    expect(paper.artworkWidth).toBeLessThanOrEqual(paper.width - 16);
    expect(paper.artworkHeight).toBeLessThanOrEqual(paper.height - 16);
    expect(paper.qrWidth).toBe(paper.artworkWidth * .75);
    expect(paper.artworkHeight).toBe(paper.artworkWidth * 1.2);
  });
  it("generates a local vector QR with an Egg outline, larger logo and readable captions", async () => {
    const artwork = await createEggQrArtwork("https://hellogodwit.com/qr/example?via=qr", {
      caption: '<script>alert("x")</script>', logoDataUrl: "data:image/png;base64,abc"
    });
    const svg = decodeURIComponent(artwork.split(",").slice(1).join(","));
    expect(svg).toContain('viewBox="0 0 400 480"');
    expect(svg).toContain('x="50" y="115" width="300" height="300"');
    expect(svg).toContain('width="64" height="72"');
    expect(svg).toContain('font-size="16" font-weight="700">&lt;script&gt;');
    expect(svg).toContain('font-size="13" font-weight="700">hellogodwit.com</text>');
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("api.qrserver.com");
    const embeddedQr = decodeURIComponent(svg.match(/href="data:image\/svg\+xml;charset=utf-8,([^"]+)"/)[1]);
    expect(embeddedQr).toContain("<svg");
    expect(embeddedQr).toContain('stroke="#102e2b"');
  });
  it("provides mobile viewport, size controls and safe dashboard return in the print document", () => {
    const html = eggPrintDocument({ t: (key, options) => options.defaultValue, format: "a6", returnUrl: '/admin?tab=engagement&name="<bad>"' });
    expect(html).toContain('name="viewport"');
    expect(html).toContain('id="paper-size"');
    expect(html).toContain('value="a6" selected');
    expect(html).toContain('id="artwork-size"');
    expect(html).toContain('id="qr-size"');
    expect(html).toContain(".print-controls{position:static;grid-row:1");
    expect(html).toContain('name=&quot;&lt;bad&gt;&quot;');
    expect(html).toContain(".print-controls{display:none!important}");
  });
});
