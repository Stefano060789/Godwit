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
    label: "Hospitality",
    pitch: "Help guests find useful information and share feedback about their visit.",
    steps: [
      {
        title: "Answer common guest questions",
        detail: "Add your website or FAQs, such as opening hours, amenities, or services.",
        tab: "engagement"
      },
      {
        title: "Ask one feedback question",
        detail: "Create a short poll about the guest experience.",
        route: "/create"
      },
      {
        title: "Place an Egg where guests need help",
        detail: "Share the same experience with a QR code, an NFC tag, or both.",
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
        route: "/create"
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
        route: "/create"
      }
    ]
  }
];

const LEGACY_PERSONA_KEYS = {
  artist: "arts-culture",
  "small-business": "shops-services",
  "large-org": "tourism-places"
};

export function findPersona(key) {
  const personaKey = LEGACY_PERSONA_KEYS[key] ?? key;
  return PERSONAS.find((persona) => persona.key === personaKey) || null;
}
