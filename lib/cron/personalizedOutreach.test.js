import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePersonalizedOutreach, OUTREACH_AI_REQUIRED_ERROR } from "./personalizedOutreach.js";
import { getPublicBusinessWebsiteContext } from "./publicBusinessEmail.js";

vi.mock("./publicBusinessEmail.js", () => ({
  getPublicBusinessWebsiteContext: vi.fn()
}));

const originalEnv = { ...process.env };

describe("generatePersonalizedOutreach", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getPublicBusinessWebsiteContext).mockReset();
    process.env = { ...originalEnv };
  });

  it("does not silently substitute a template when AI is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(generatePersonalizedOutreach({
      companyName: "Example Realty",
      businessType: "real_estate_agency",
      country: "Malaysia",
      city: "Kuala Lumpur",
      language: "en"
    })).rejects.toThrow(OUTREACH_AI_REQUIRED_ERROR);
    expect(getPublicBusinessWebsiteContext).not.toHaveBeenCalled();
  });

  it("uses Gemini and specific website evidence to infer a business need", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    delete process.env.OPENAI_API_KEY;
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({
      text: "Family-run hotel near the old town with guided garden tours.",
      status: "found",
      sourceUrl: "https://example.org"
    });
    const previousMessage = "The previous draft";
    const generatedCopy = {
      subject: "A guest feedback idea for Example Hotel",
      message: "Dear Example Hotel team, your garden tours sound distinctive. Godwit could gather guest feedback with a QR poll. A subscription can keep this feedback loop going over time. https://hellogodwit.com\n\nStefano and Mariia",
      personalizationReason: "The website mentions guided garden tours."
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(generatedCopy) } }]
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generatePersonalizedOutreach({
      companyName: "Example Hotel",
      businessType: "hotel",
      country: "Austria",
      city: "Vienna",
      website: "https://example.org",
      language: "de",
      previousMessage
    });

    expect(fetchMock.mock.calls[0][0])
      .toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-gemini-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("gemini-3.8-flash");
    expect(getPublicBusinessWebsiteContext).toHaveBeenCalledWith("https://example.org");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content)
      .toContain("guided garden tours");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content)
      .toContain("category-specific scenario");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content)
      .toContain("Avoid generic praise and interchangeable category-level copy");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content)
      .toContain("Persuade through a clear chain");
    expect(result).toEqual(generatedCopy);
  });

  it("keeps OpenAI as a fallback and retries with a new angle when it repeats the previous message", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    const previousMessage = [
      "Dear Example Hotel team,",
      "A stay has several important touchpoints from arrival to checkout. Godwit lets you place a QR code and ask a short poll.",
      "We would be glad to offer your team a complimentary guided two-week pilot.",
      "https://hellogodwit.com",
      "Kind regards, Stefano and Mariia"
    ].join("\n");
    vi.mocked(getPublicBusinessWebsiteContext).mockResolvedValue({
      text: "",
      status: "not_found",
      sourceUrl: "https://example.org"
    });
    const repeatedDraft = {
      subject: "A guest feedback idea for Example Hotel",
      message: `${previousMessage}\n\nA subscription can continue this feedback loop.`,
      personalizationReason: "The business category suggests a guest feedback use case."
    };
    const distinctDraft = {
      subject: "A different idea for Example Hotel's garden tours",
      message: "Hello Example Hotel, your website mentions guided garden tours near the old town. One idea is to place a Godwit QR poll at the end of a tour and ask which stops guests found most memorable or confusing. The responses could help your team decide what to clarify for future visitors. We can explore this in a complimentary guided two-week pilot. If the feedback proves useful, a subscription can keep the learning going across visits. Would you be open to a 15-minute introduction? https://hellogodwit.com\n\nStefano and Mariia",
      personalizationReason: "The website highlights guided garden tours; asking visitors about memorable or unclear stops could help refine the experience."
    };
    const fetchMock = vi.fn(async (_url, options) => {
      const requestBody = JSON.parse(options.body);
      const request = JSON.parse(requestBody.messages[1].content);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(
          request.rejectedDraft ? distinctDraft : repeatedDraft
        ) } }]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generatePersonalizedOutreach({
      companyName: "Example Hotel",
      businessType: "hotel",
      country: "Malaysia",
      city: "Kuala Lumpur",
      website: "https://example.org",
      language: "en",
      previousMessage,
      variation: 2
    });

    expect(result).toEqual(distinctDraft);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getPublicBusinessWebsiteContext).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages[1].content)
      .toContain('"rejectedDraft":"' + repeatedDraft.message.replaceAll("\n", "\\n"));
  });
});
