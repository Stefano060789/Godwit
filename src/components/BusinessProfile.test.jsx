import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BusinessProfile from "./BusinessProfile";
import en from "../i18n/locales/en.json";

const t = (key, options = {}) => key.split(".").reduce((value, part) => value?.[part], en) || options.defaultValue || key;

describe("Business profile setup", () => {
  it("offers detailed business and place types, including cafes and pubs", () => {
    const markup = renderToStaticMarkup(createElement(BusinessProfile, {
      workspaceId: "workspace-id",
      businessType: "cafe-pub",
      canManage: true,
      onSaved: () => {},
      t
    }));

    expect(markup.match(/type="radio"/g)).toHaveLength(9);
    expect(markup).toContain("Cafe or pub");
    expect(markup).toContain("Restaurant or food venue");
    expect(markup).toContain("Community or public space");
    expect(markup).toContain('checked="" value="cafe-pub"');
    expect(markup).toContain("Save business type");
  });

  it("does not offer saving until a business type is chosen", () => {
    const markup = renderToStaticMarkup(createElement(BusinessProfile, {
      workspaceId: "workspace-id",
      businessType: "",
      canManage: true,
      onSaved: () => {},
      t
    }));

    expect(markup).toContain('type="submit" class="goal-primary-action" disabled=""');
  });
});
