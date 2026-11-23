import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BusinessData from "./BusinessData";

const t = (_key, options) => options.defaultValue;

describe("BusinessData", () => {
  it("offers shared information and explains Instagram is not imported", () => {
    const markup = renderToStaticMarkup(createElement(BusinessData, { workspaceId: "workspace", canManage: true, t }));
    expect(markup).toContain("Business notes");
    expect(markup).toContain("Import website");
    expect(markup).toContain("Save link without importing");
    expect(markup).toContain("weekly request limits");
    expect(markup).toContain("not saved, imported, or reused");
    expect(markup).toContain("Upload saved webpage");
    expect(markup).toContain("website owner");
    expect(markup).toContain("will not update automatically");
    expect(markup).toContain("Instagram content is not imported");
    expect(markup).toContain("Facebook page or profile link");
    expect(markup).toContain("Facebook content is not imported");
    expect(markup).toContain("Every Egg can use it");
  });

  it("does not offer management controls to non-managers", () => {
    const markup = renderToStaticMarkup(createElement(BusinessData, { workspaceId: "workspace", canManage: false, t }));
    expect(markup).toContain("A workspace manager");
    expect(markup).not.toContain("<form");
  });
});
