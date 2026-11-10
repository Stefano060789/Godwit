export const PERSONAS = [
  {
    key: "arts-culture",
    audienceKey: "arts",
    icon: "\ud83c\udfa8",
    label: "Arts and culture",
    pitch: "Share stories, answer visitor questions, and invite feedback or enquiries.",
    steps: [
      {
        title: "Add your story and links",
        detail: "Use an information card for your bio, exhibition, artwork, or visitor details.",
        tab: "engagement"
      },
      {
        title: "Let Godwit answer questions",
        detail: "Add your website or FAQs as the assistant's information source.",
        tab: "engagement"
      },
      {
        title: "Invite an enquiry",
        detail: "Add your contact or booking link to an information card on the Egg.",
        tab: "engagement"
      }
    ]
  },
  {
    key: "hospitality",
    audienceKey: "hospitality",
    icon: "\u2615",
    label: "Cafes, pubs and hospitality",
    pitch: "Help guests explore menus and event details, find booking information, and share feedback.",
    steps: [
      {
        title: "Share menus and answer guest questions",
        detail: "Add your website or FAQs for opening hours, menus, events, amenities, or services.",
        tab: "engagement"
      },
      {
        title: "Ask one feedback question",
        detail: "Create a short poll about the guest experience.",
        tab: "engagement"
      },
      {
        title: "Place an Egg where guests make decisions",
        detail: "Add it to a menu, counter, entrance, or event display and share it by QR code, NFC tag, or both.",
        tab: "engagement"
      }
    ]
  },
  {
    key: "tourism-places",
    audienceKey: "places",
    icon: "\ud83d\uddfa\ufe0f",
    label: "Tourism and places",
    pitch: "Share local knowledge and help visitors discover what to do next.",
    steps: [
      {
        title: "Share local information",
        detail: "Add practical details, directions, or links to an information card.",
        tab: "engagement"
      },
      {
        title: "Answer visitor questions",
        detail: "Give Godwit your website or FAQs so it can answer using your information.",
        tab: "engagement"
      },
      {
        title: "Place an Egg at the point of interest",
        detail: "Use a QR code or NFC tag where visitors are deciding what to do.",
        tab: "engagement"
      }
    ]
  },
  {
    key: "events-communities",
    audienceKey: "events",
    icon: "\ud83c\udf89",
    label: "Events and communities",
    pitch: "Share updates, gather feedback, and make it easy to get involved.",
    steps: [
      {
        title: "Share event or community details",
        detail: "Add the schedule, venue information, or useful links to an information card.",
        tab: "engagement"
      },
      {
        title: "Ask attendees what matters",
        detail: "Create a short poll to gather feedback during or after the event.",
        tab: "engagement"
      },
      {
        title: "Put an Egg where people gather",
        detail: "Place a QR code or NFC tag at the entrance, activity, or information point.",
        tab: "engagement"
      }
    ]
  },
  {
    key: "shops-services",
    audienceKey: "shops",
    icon: "\ud83d\uded2",
    label: "Shops and services",
    pitch: "Explain what you offer, answer questions, and hear from your customers.",
    steps: [
      {
        title: "Show what you offer",
        detail: "Add product or service details, a photo, and useful links to an information card.",
        tab: "engagement"
      },
      {
        title: "Answer common questions",
        detail: "Add your website or FAQs so Godwit can answer from your business information.",
        tab: "engagement"
      },
      {
        title: "Ask for customer feedback",
        detail: "Create a short poll and add it to an Egg customers can scan or tap.",
        tab: "engagement"
      }
    ]
  }
];

export const BUSINESS_TYPES = [
  {
    key: "cafe-pub",
    label: "Cafe or pub",
    description: "Cafe, coffee shop, pub, bar, or neighborhood gathering place.",
    aiContext: "a cafe, coffee shop, pub, or bar",
    aiGuidance: "For a cafe or pub, help with menu and drink information, opening hours, events, accessibility, and existing booking or contact links. Never invent availability, prices, or policies."
  },
  {
    key: "restaurant-food",
    label: "Restaurant or food venue",
    description: "Restaurant, bakery, food hall, takeaway, or other food business.",
    aiContext: "a restaurant or food venue",
    aiGuidance: "For a restaurant or food venue, help with menus, dietary information when supplied, opening hours, ordering, and reservations. Use existing information and links; never infer ingredients, allergens, prices, or availability."
  },
  {
    key: "accommodation",
    label: "Hotel or accommodation",
    description: "Hotel, guest house, holiday rental, campsite, or other accommodation.",
    aiContext: "a hotel or accommodation business",
    aiGuidance: "For accommodation, help with supplied check-in details, amenities, accessibility, local information, and existing booking or contact links. Do not invent availability, prices, or policies."
  },
  {
    key: "arts-culture",
    label: "Arts, culture, or museum",
    description: "Museum, gallery, studio, heritage site, or cultural organization.",
    aiContext: "an arts, culture, or museum venue",
    aiGuidance: "For an arts, culture, or museum venue, help visitors explore exhibitions, stories, tours, opening times, accessibility, and supplied visitor information. Use only facts in the business sources."
  },
  {
    key: "visitor-attraction",
    label: "Tourist attraction or destination",
    description: "Visitor attraction, landmark, destination, or tourism organization.",
    aiContext: "a tourist attraction or destination",
    aiGuidance: "For an attraction or destination, help visitors with supplied directions, opening times, tickets, accessibility, nearby activities, and practical local information. Do not invent conditions or availability."
  },
  {
    key: "event-venue",
    label: "Event or venue",
    description: "Festival, conference, performance venue, club, or community event.",
    aiContext: "an event or venue",
    aiGuidance: "For an event or venue, help with supplied schedules, entry information, facilities, accessibility, participation, and relevant existing action links. Do not invent event details."
  },
  {
    key: "retail-market",
    label: "Shop or market",
    description: "Retail shop, market stall, artisan shop, or product business.",
    aiContext: "a retail shop or market",
    aiGuidance: "For a shop or market, help customers understand supplied product information, opening times, and existing purchase or contact links. Never invent stock, prices, return policies, or product claims."
  },
  {
    key: "local-service",
    label: "Local or appointment-based service",
    description: "Salon, repair shop, professional practice, or appointment-based business.",
    aiContext: "a local or appointment-based service business",
    aiGuidance: "For a local service, explain supplied services, appointment preparation, accessibility, and existing booking or enquiry links. Do not promise outcomes, prices, or appointment availability."
  },
  {
    key: "community-space",
    label: "Community or public space",
    description: "Community center, library, public space, nonprofit, or civic service.",
    aiContext: "a community organization or public space",
    aiGuidance: "For a community organization or public space, help with supplied public services, programs, opening times, accessibility, and ways to participate. Use only the information provided by the organization."
  },
  {
    key: "other",
    label: "Other business or organisation",
    description: "Describe your business or organisation if none of the categories fit.",
    aiContext: "another kind of business or organization",
    aiGuidance: "Use the supplied description to understand the organization. Rely only on the business information provided and do not invent facts, policies, prices, or availability."
  }
];

export function isBusinessType(key) {
  return BUSINESS_TYPES.some((business) => business.key === key);
}

const LEGACY_PERSONA_KEYS = {
  artist: "arts-culture",
  "small-business": "shops-services",
  "large-org": "tourism-places"
};

export function findPersona(key) {
  const personaKey = LEGACY_PERSONA_KEYS[key] ?? key;
  return PERSONAS.find((persona) => persona.key === personaKey) || null;
}
