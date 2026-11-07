# Godwit brand style reference

This file records the palette and typography currently used by the Godwit
application, QR portal, and printable business cards. Hex values are the
source-of-truth values from `src/style.css` and the brand assets.

## Typography

| Role | Font stack | Weight and treatment | Use |
| --- | --- | --- | --- |
| Interface and body | `"Trebuchet MS", "Segoe UI", sans-serif` | 400 by default; 600-800 for labels, buttons, and navigation | Application screens, forms, explanatory copy, business-card body text |
| Editorial display | `Georgia, "Times New Roman", serif` | 700 where emphasis is needed | Wordmark, QR portal headings, large editorial headings |
| QR export fallback | `Arial, sans-serif` | Regular or bold as specified by the export | Canvas-generated QR artwork where predictable browser rendering is useful |

The application does not bundle font files. The first available font in each
stack is used, with the following fonts as platform fallbacks.

## Core palette

| Token | Hex | Color name | Primary use |
| --- | --- | --- | --- |
| `--ink` | `#172B2B` | Deep ink | Main light-theme text |
| `--muted` | `#607170` | Muted sage gray | Secondary text and supporting information |
| `--canvas` | `#F4F7F5` | Cool canvas | Base application background token |
| `--surface` | `#FFFFFF` | White | Cards, panels, and elevated surfaces |
| `--line` | `#D6E2DE` | Pale sage border | Dividers and light-theme borders |
| `--teal` / `--action-primary` | `#0F766E` | Godwit teal | Primary actions, links, accents, and focus states |
| `--action-primary-hover` | `#0B5F59` | Deep teal | Hover and pressed primary actions |
| `--teal-soft` | `#D9F3ED` | Soft teal | Tinted panels, badges, and supporting emphasis |
| `--blue-soft` | `#E3F0F4` | Soft blue | Informational backgrounds |
| `--navy` | `#0B1A33` | Brand navy | Dashboard and dark branded surfaces |
| `--navy-deep` | `#071021` | Deep navy | Navigation and high-contrast dark backgrounds |
| `--navy-soft` | `#12274A` | Soft navy | Secondary dashboard surfaces |
| `--gold` / `--action-accent` | `#F2C744` | Godwit gold | Accent actions, highlights, and active navigation |
| `--action-accent-hover` | `#B58416` | Deep gold | Hover and pressed accent actions |
| `--gold-soft` | `#FBE9AE` | Soft gold | Highlighted or advisory backgrounds |
| `--gold-deep` | `#C9971E` | Deep gold | Small print accents and business-card details |
| `--action-danger` | `#B91C1C` | Alert red | Destructive actions and error states |

Use white text on teal, navy, or deep-gold controls. Use `--navy-deep` or
`--ink` text on the gold accent.

## Logo and print palette

The Godwit mark uses a gold diagonal gradient:

| Gradient stop | Hex |
| --- | --- |
| 0% | `#C08A26` |
| 50% | `#E8BC55` |
| 100% | `#F7DA8A` |

The business cards add these print-oriented supporting colors:

| Color | Hex | Use |
| --- | --- | --- |
| Warm paper | `#FFFDF8` | Card background |
| Paper highlight | `#F8F5ED` | Card gradient start |
| Sage | `#E5F0E9` | Card gradient midpoint |
| Sage-teal | `#D9EBE5` | Card gradient end |
| Deep green | `#123B36` | Wordmark and primary card text |
| Card teal text | `#315C55` | Benefits and supporting copy |
| Tagline green | `#416B64` | Small tagline text |

The printed cards use a subtle teal border (`rgba(15, 118, 110, 0.28)`) and a
subtle gold glow (`rgba(203, 151, 30, 0.18)`) rather than additional solid
brand colors.

## Light and dark themes

### Light theme

The light experience is warm and editorial:

- Page background: `#F7F5EF`
- Main panel: translucent `#FFFDF8`
- Input surface: `#FFFEFB`
- Input border: `#CBD5C4`
- Secondary panel: `#F0F1E9`
- Supporting text: `#5F6C65`
- Teal and gold remain the primary accents.

The recommended visual direction is **sunlit meadow**: warm paper, sage
surfaces, and a small amount of gold light. It should feel optimistic and
creative without turning the interface into a bright yellow theme.

### Dark theme

The dark experience uses the navy family while retaining teal and gold accents:

| Role | Hex |
| --- | --- |
| Text | `#E7ECF5` |
| Muted text | `#A9B6CB` |
| Canvas | `#081326` |
| Surface | `#101F38` |
| Border | `#2C4165` |
| Input surface | `#10223E` |
| Input border | `#385277` |
| Placeholder | `#8FA0BB` |

The recommended visual direction is **evening marsh**: deep blue-green space,
quiet blue highlights, and gold used like a small point of reflected light.
This keeps long admin sessions calm while preserving the Godwit identity.

### Audience background

The landing page's audience section uses a shared editorial stage rather
than another white card grid. Business groups, not bird characters, label the
product's main starting paths:

| Theme | Background | Soft glow |
| --- | --- | --- |
| Light | `#F3F5EE` to `#E5F0E9` | Restrained gold |
| Dark | `#071A2D` | `#102D46` |

The light audience stage uses warm paper cards with sage borders and deep green
text. Dark mode retains sky-blue and lavender glows.

Quick-start and dashboard guidance use warm-paper cards, serif display headings,
and short sans-serif labels. Selection has both a border and a check mark, not
color alone. Scoped `--guide-*` variables keep selected cards and supporting text
readable in both themes without relying on the workspace's Tailwind overrides.
In light mode, use white unselected cards, `#6F8D83` borders, and `#415C55`
supporting text. Selected cards use deep teal (`#0B5F59`) with white titles and
pale sage (`#E7F2EC`) descriptions; hover alone uses a pale sage background.
Small gold labels use dark ochre (`#765414`) on light surfaces, not bright gold.
Supporting quick-start copy is at least 0.9rem. Text contrast should meet WCAG AA
(4.5:1 for normal text); meaningful control borders should reach 3:1.

### Entry-page polish

Quick start, sign-in, and registration share generous panel padding, rounded
24px desktop surfaces (18px for the mobile guide), and serif display headings.
Dark entry panels use `#0F2028` over the navy canvas, with `#688487` control
borders. Selected dark guide cards use `#234B47`; hover is the quieter `#193137`.
Both themes use 0.9rem supporting copy and circular selection indicators.
Account forms use persistent field labels, 48px controls, autofill attributes,
and reciprocal sign-in/registration links that preserve the starting destination.
Teal actions in light mode and gold actions in dark mode share the same sizing.

### Character color associations

Each character has a memorable accent color for its avatar badge and related
feature moments. These are supporting colors, not replacements for the
primary teal/gold action system.

| Character | Association | Color | Deep companion |
| --- | --- | --- | --- |
| Robin | Welcome, warmth, first steps | `#E76F51` | `#B94F3A` |
| Tern | Speed, clarity, lightweight polls | `#4EA5D9` | `#2F719E` |
| Flamingo | Connection, delight, social confidence | `#E9789A` | `#B94D70` |
| Magpie | Curiosity, collecting, creative variety | `#8B78D6` | `#5C4CA4` |
| Redshank | Care, early warning, protective action | `#D95D39` | `#9E3E27` |
| Owl | Trust, oversight, thoughtful control | `#A78BFA` | `#6D55B8` |
| Waxwing | Insight, premium polish, momentum | `#E9B44C` | `#B7771E` |

## Usage rules

1. Prefer the CSS custom properties in `src/style.css` instead of introducing
   new one-off colors.
2. Keep teal for primary interaction and gold for secondary emphasis; do not
   use gold as the only signal for success or focus.
3. Preserve readable contrast between text and tinted surfaces, especially in
   QR portal and mobile layouts.
4. Keep the logo gradient limited to the Godwit mark; use the solid gold token
   for interface controls and navigation states.
