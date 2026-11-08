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
    expect(markup).toContain("Instagram content is not imported");
    expect(markup).toContain("Every Egg can use it");
  });

  it("does not offer management controls to non-managers", () => {
    const markup = renderToStaticMarkup(createElement(BusinessData, { workspaceId: "workspace", canManage: false, t }));
    expect(markup).toContain("A workspace manager");
    expect(markup).not.toContain("<form");
  });
});
