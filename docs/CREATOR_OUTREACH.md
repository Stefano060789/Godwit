# Creator outreach and prospect research

Google Places prospect research and public-rating refresh are disabled in code. The Creator research action and scheduled research job return an explicit disabled response; they do not call Google Places or write new prospect records. Existing prospect records, Google Place IDs, and reputation snapshots are not deleted. The settings UI no longer reads or displays reputation history, and saving other workspace settings leaves an existing Place ID untouched.

The Creator queue may still contain previously researched records. For those records, a user can request a public-email lookup: the app checks the listed business website and, when configured, can query public Google results through SerpApi. It stores only an email present in a relevant result; it does not construct or guess addresses. These lookups and their external-provider use are not part of the disabled Google Places research path.

Set `SERPAPI_API_KEY` as a server-only Vercel environment variable only if that remaining lookup feature is intentionally enabled. Do not use a `VITE_` prefix. Search requests may incur provider usage charges and transfer business search terms to SerpApi.

Existing outreach drafts are not reprocessed automatically when the key is added. In the Creator queue, **Search next 5 blank emails** checks existing records in small batches. Google Places will not automatically research or refresh new locations.

Generated email subjects can be edited and saved on each draft. **Clear unsent research** removes only the current unsent draft queue while preserving sent messages and rejected locations.

Creator prospect email delivery currently uses Gmail SMTP, not Resend. This change only gates Resend purposes and does not disable that separate sending path; the owner must make any separate decision about Creator prospect outreach before launch.
