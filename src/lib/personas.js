// Robin's persona guide: three common ways people use Godwit, each with a short, ordered set
// of recommended next steps built entirely from features that already exist in the product.
// Shown on the Admin Overview tab once a workspace picks "what are you using Godwit for?".
//
// Each step points at either an Admin tab (`tab`) or a direct route (`route`) to jump to. A
// step can optionally declare a `feature` key (matching entitlements.js/FEATURE_COPY) if it
// needs a paid plan - Robin's guide then shows an inline "Available on X · Upgrade" note
// before the admin clicks through, instead of only relying on the destination tab's own
// LockedFeature prompt to break the news.

export const PERSONAS = [
  {
    key: "artist",
    icon: "\ud83c\udfa8",
    label: "Artist or creator",
    pitch: "Turn a show, exhibition, or busking spot into a way to meet the people who came to see you.",
    steps: [
      {
        title: "Create a reaction poll",
        detail: "One quick question after a set or show - what should I play/show next time?",
        route: "/create"
      },
      {
        title: "Add an info card with your links and a photo",
        detail: "Show your bio, socials, and streaming links - and now a photo - right in the QR menu.",
        tab: "engagement"
      },
      {
        title: "Turn on tips from fans",
        detail: "Let people support you directly with a card or wallet payment. Godwit keeps a 9% platform fee, you keep the rest.",
        tab: "engagement",
        featureFlag: "donations"
      },
      {
        title: "Build your fan list",
        detail: "Invite fans to share an email for new show announcements, with clear consent - never bundled with voting.",
        tab: "connection",
        feature: "leadCapture"
      },
      {
        title: "Give something away",
        detail: "Run a free-to-enter prize draw for a signed print, a free ticket, or a shoutout.",
        tab: "engagement",
        feature: "prizeDraws"
      }
    ]
  },
  {
    key: "small-business",
    icon: "\u2615",
    label: "Cafe, restaurant, or small shop",
    pitch: "Turn one table QR code into better reviews, repeat visits, and honest feedback.",
    steps: [
      {
        title: "Create your first feedback poll",
        detail: "One simple question: how was their visit today?",
        route: "/create"
      },
      {
        title: "Print your QR code",
        detail: "Put it on a table tent, receipt, or counter card - reusable, so you can swap the question later.",
        tab: "polls"
      },
      {
        title: "Set up honest review requests",
        detail: "Every voter gets the same Google/Tripadvisor link, regardless of their answer - never gated by sentiment.",
        tab: "connection"
      },
      {
        title: "Reward returning customers",
        detail: "Recognize regulars automatically and offer a small thank-you after a few visits.",
        tab: "engagement",
        feature: "redemptionTracking"
      },
      {
        title: "Watch your public reputation",
        detail: "See your Google rating trend in one place, without checking multiple apps.",
        tab: "settings",
        feature: "reputationMonitoring"
      }
    ]
  },
  {
    key: "large-org",
    icon: "\ud83c\udfdb\ufe0f",
    label: "Hotel, museum, city, or large venue",
    pitch: "Coordinate feedback across many rooms, departments, or locations from one dashboard.",
    steps: [
      {
        title: "Create reusable QR locations",
        detail: "One durable code per hotel room, museum floor, or landmark - swap the active poll anytime without reprinting.",
        tab: "engagement"
      },
      {
        title: "Invite your team",
        detail: "Give each department or staff member - front desk, housekeeping, a museum wing - their own login and role.",
        tab: "settings"
      },
      {
        title: "Track analytics across every location",
        detail: "Compare engagement location by location, not just poll by poll.",
        route: "/admin/analytics"
      },
      {
        title: "Add wayfinding, exhibit, or amenity info cards",
        detail: "Show opening hours, spa or restaurant hours, accessibility info, or an exhibit photo right in the QR menu.",
        tab: "engagement"
      },
      {
        title: "Connect the developer API or webhooks",
        detail: "Feed results into your own dashboards or public data systems.",
        tab: "settings",
        feature: "apiAccess"
      }
    ]
  }
];

export function findPersona(key) {
  return PERSONAS.find((persona) => persona.key === key) || null;
}
