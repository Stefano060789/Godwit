export function isReviewedOutreachContact(contact) {
  return contact.business_review_status === "approved" ||
    contact.message_review_status === "approved";
}

export function getOutreachContactIds(contacts) {
  return contacts.map(({ id }) => id);
}

export function filterHiddenOutreachContacts(contacts, hiddenIds) {
  return contacts.filter((contact) =>
    !hiddenIds.has(contact.id) && !isReviewedOutreachContact(contact)
  );
}

export function groupOutreachContactsByCountry(contacts) {
  const groups = new Map();
  for (const contact of contacts) {
    const country = String(contact.country || "").trim() || "Country unknown";
    if (!groups.has(country)) groups.set(country, []);
    groups.get(country).push(contact);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([country, groupedContacts]) => ({ country, contacts: groupedContacts }));
}

export function getPublicEmailLookupMessage(result) {
  const websiteStatus = result.websiteStatus || result.status;
  if (result.searchStatus === "not_configured") {
    const websiteDetail = websiteStatus === "no_website"
      ? "No website is listed"
      : websiteStatus === "not_found"
        ? "No email was published on the listed website"
        : `The listed website could not be checked (${websiteStatus})`;
    return `${websiteDetail}. Add SERPAPI_API_KEY to the deployed API to search public web results.`;
  }
  if (result.status === "not_found") {
    const websiteDetail = websiteStatus === "no_website"
      ? "No website is listed"
      : websiteStatus === "not_found"
        ? "No email was published on the listed website"
        : `The listed website could not be checked (${websiteStatus})`;
    return `${websiteDetail}, and no public email was found in web results. No address was guessed.`;
  }
  if (websiteStatus === "no_website") return "No website is listed for this business.";
  if (websiteStatus === "not_found") return "No public email was found on the listed website.";
  return `The listed website could not be checked (${websiteStatus}).`;
}

export function getPublicEmailSearchUrl(contact) {
  const query = [
    contact.company_name,
    contact.city,
    contact.country,
    "business contact email"
  ].filter(Boolean).join(" ");
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", query);
  return url.href;
}
