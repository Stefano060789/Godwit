import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EggMessageHistory from "./EggMessageHistory";

const preview = [{ id: 1, message: "A useful customer suggestion", created_at: "2026-11-08T12:00:00Z" }];
const t = (_, options) => options.defaultValue;
describe("messages inside Results", () => {
  it("keeps older feedback accessible without a separate inbox", () => {
    const markup = renderToStaticMarkup(createElement(EggMessageHistory, { campaignId: 4, preview, total: 20, t }));
    expect(markup).toContain("A useful customer suggestion");
    expect(markup).toContain("Read more messages");
    expect(markup).not.toContain("inbox");
  });
  it("does not show load-more when every message is already visible", () => {
    const markup = renderToStaticMarkup(createElement(EggMessageHistory, { campaignId: 4, preview, total: 1, t }));
    expect(markup).not.toContain("Read more messages");
  });
});
