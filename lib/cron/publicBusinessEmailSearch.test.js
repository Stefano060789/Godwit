import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPublicBusinessEmail } from "./publicBusinessEmailSearch.js";

const originalEnv = { ...process.env };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("searchPublicBusinessEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("finds an email published in a relevant business search result", async () => {
    process.env.SERPAPI_API_KEY = "search-secret";
    const fetchMock = vi.fn(async () => jsonResponse({
      organic_results: [
        {
          title: "Another coffee shop in Kuala Lumpur",
          snippet: "Contact unrelated@example.com",
          link: "https://other.example/contact"
        },
        {
          title: "Feeka Coffee Roasters Kuala Lumpur",
          snippet: "For bookings, email reservations@feekacoffee.com",
          link: "https://feekacoffee.com/contact"
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPublicBusinessEmail({
      companyName: "Feeka Coffee Roasters",
      city: "Kuala Lumpur",
      country: "Malaysia"
    })).resolves.toEqual({
      email: "reservations@feekacoffee.com",
      status: "found",
      source: "web_search",
      sourceUrl: "https://feekacoffee.com/contact"
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestUrl.origin).toBe("https://serpapi.com");
    expect(requestUrl.searchParams.get("api_key")).toBe("search-secret");
    expect(requestUrl.searchParams.get("q")).toContain("Kuala Lumpur Malaysia");
  });

  it("does not use emails from unrelated search results", async () => {
    process.env.SERPAPI_API_KEY = "search-secret";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      organic_results: [{
        title: "A different Kuala Lumpur coffee shop",
        snippet: "info@different.example",
        link: "https://different.example"
      }]
    })));

    await expect(searchPublicBusinessEmail({
      companyName: "Feeka Coffee Roasters",
      city: "Kuala Lumpur",
      country: "Malaysia"
    })).resolves.toEqual({ email: null, status: "not_found" });
  });

  it("requires multiple distinctive business-name tokens for multiword businesses", async () => {
    process.env.SERPAPI_API_KEY = "search-secret";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      organic_results: [
        {
          title: "Netaji Subhas Place listings",
          snippet: "Contact care@magicpin.in",
          link: "https://magicpin.in/netaji-subhas-place"
        },
        {
          title: "Netaji Subhas Chandra Bose Indian Cultural Centre",
          snippet: "Contact icckl@example.my",
          link: "https://icckl.com.my/contact"
        }
      ]
    })));

    await expect(searchPublicBusinessEmail({
      companyName: "Netaji Subhas Chandra Bose Indian Cultural Centre Kuala Lumpur",
      city: "Kuala Lumpur",
      country: "Malaysia"
    })).resolves.toMatchObject({
      email: "icckl@example.my",
      status: "found",
      source: "web_search",
      sourceUrl: "https://icckl.com.my/contact"
    });
  });

  it("returns an explicit configuration status when no provider key is set", async () => {
    delete process.env.SERPAPI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPublicBusinessEmail({ companyName: "Feeka Coffee Roasters" }))
      .resolves.toEqual({ email: null, status: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider errors without exposing the API key", async () => {
    process.env.SERPAPI_API_KEY = "search-secret";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Invalid API key" }, 401)));

    await expect(searchPublicBusinessEmail({ companyName: "Feeka Coffee Roasters" }))
      .rejects.toThrow("SerpApi business email search failed (HTTP 401): Invalid API key");
  });
});
