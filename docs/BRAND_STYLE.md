# Godwit brand style reference

The application palette takes its direction from Botticelli's *Birth of Venus*:
blue-gray sky and sea, shell ivory, salmon-pink cloth, peach sand, and aged gold.
This is a color and editorial reference, not a reproduction of the painting.
`src/style.css` defines shared theme tokens; dashboard and guide components
inherit them. Existing customer-configured poll branding and print palettes
remain independent.

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
| `--ink` | `#34312C` | Warm charcoal | Main light-theme text |
| `--muted` | `#5B534C` | Stone | Supporting information |
| `--canvas` | `#E6EEEE` | Sea mist | Page background |
| `--surface` | `#FFF8E9` | Shell ivory | Cards and panels |
| `--surface-soft` | `#F3DFCC` | Peach sand | Secondary panels |
| `--line` | `#C7C6B8` | Shell edge | Decorative dividers |
| `--control-line` | `#7D7D70` | Deep stone | Input and selection borders |
| `--teal` / `--link` | `#31565D` | Deep sea blue | Links and selected indicators |
| `--action-primary` / `--rose` | `#84463E` | Cloak rose | Primary actions |
| `--action-primary-hover` | `#6E3832` | Deep rose | Primary hover |
| `--teal-soft` | `#D6E5E5` | Sea glass | Selected cards |
| `--blue-soft` | `#C8DDE2` | Pale sea | Informational backgrounds |
| `--sky` | `#BAD2DB` | Botticelli sky | Broad hero background |
| `--rose-soft` | `#EFC3B7` | Salmon cloth | Visible peach and rose sections |
| `--navy` | `#213D43` | Deep sea | Dark branded surfaces |
| `--navy-deep` | `#192E34` | Night sea | Night canvas and navigation |
| `--navy-soft` | `#2C4B51` | Dusk blue | Secondary dark surfaces |
| `--gold` / `--action-accent` | `#DFBA73` | Aged gold | Accent controls and bird-related emphasis |
| `--action-accent-hover` | `#CFAA62` | Antique gold | Accent hover |
| `--gold-soft` | `#F1DFB6` | Pale gold | Advisory backgrounds |
| `--gold-deep` | `#6D4D21` | Dark ochre | Small light-theme gold labels |
| `--action-danger` | `#B91C1C` | Alert red | Destructive actions and error states |

Use `--action-on-dark` on rose actions and `--action-on-accent` on gold
actions. Never use white text on the pale gold control. Semantic error and
success colors remain distinct from the decorative palette.

## Logo and print palette

### Egg dashboard hub

Keep the Egg as the visual center, not one tab among many. Business Data and
Goal are the inputs on the left; Results is the output on the right; Settings
sits below. Fine connector lines explain this relationship without extra copy.
Keep this spatial arrangement on phones, with compact labels and icons.

The hub inherits the shared sea-blue, shell, and rose theme tokens.
Its blue-to-peach frame surrounds solid ivory nodes and a sand-colored Egg.
Customer benefits sit on a rose surface; selected goals use sea glass.
Gold belongs primarily
to the Egg asset and its thin circular border. Selected nodes use a gentle
sage fill, a clear border, and keyboard focus outlines.

The selected page follows below the hub. Use a short heading, one supporting
sentence, numbered setup steps, and expandable advanced controls. Do not
restore standalone polls or actions to the main navigation.

The Godwit mark uses a gold diagonal gradient:

| Gradient stop | Hex |
| --- | --- |
| 0% | `#B8873F` |
| 50% | `#DCB66D` |
| 100% | `#EFDAB0` |

The bird remains gold in both themes. The lockup lettering uses sea green by
day and ivory by night, following the inherited CSS color scheme so it remains
readable even when the user manually switches themes.

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

The light experience is **Venus in daylight**: a visibly blue sea-and-sky hero,
an ivory curved medallion around the bird, peach and rose sections, sea-glass
selections, and aged gold. Thin offset curves evoke flowing cloth without
adding a painting or distracting ornament. Use the core
palette above. Keep forms and reading areas solid rather than putting gradients
under dense text. Cloak rose is the primary action; blue is for links and
selection; gold remains primarily associated with the bird.

### Dark theme

The dark experience is **Venus at dusk**: deep sea-blue shadows, warm ivory
text, pale blue links, and visible muted-rose undertones.

| Role | Hex |
| --- | --- |
| Text | `#FFF1DC` |
| Muted text / placeholder | `#D3C9BA` |
| Canvas | `#192E34` |
| Surface | `#213D43` |
| Secondary surface | `#2C4B51` |
| Decorative border | `#536C70` |
| Input surface | `#1D353B` |
| Control border | `#9CB2AE` |
| Links / selected icons | `#BDD8DD` |
| Selected fill | `#304E54` |
| Rose wash | `#67453F` |
| Rose action | `#895046` |

Gold primary Goal controls use dark text; rose utility controls retain ivory
text. Selected Goal cards always keep readable text, a border, and a check mark.

### Audience background

The landing page's audience section uses a shared editorial stage rather
than another white card grid. Business groups, not bird characters, label the
product's main starting paths:

| Theme | Background | Soft glow |
| --- | --- | --- |
| Light | Sky blue to sea mist | Ivory |
| Dark | Deep sea | Blue and rose |

The light audience stage uses ivory cards with stone borders and warm charcoal
text. Dark mode uses muted blue and rose glows, not electric blue or lavender.

Quick-start and dashboard guidance use clean white cards, serif display headings,
and short sans-serif labels. Selection has both a border and a check mark, not
color alone. Scoped `--guide-*` variables keep selected cards and supporting text
readable in both themes without relying on the workspace's Tailwind overrides.
The dashboard and guides share the core palette instead of maintaining separate
blue-gray themes. Small gold labels use dark ochre on light surfaces, not bright
gold. Supporting quick-start copy is at least 0.9rem. Text contrast should meet WCAG AA
(4.5:1 for normal text); meaningful control borders should reach 3:1.

### Entry-page polish

Quick start, sign-in, and registration share generous panel padding, rounded
24px desktop surfaces (18px for the mobile guide), and serif display headings.
Dark entry panels use the deep-sea surface and shared control borders. Selected
dark guide cards use the sea-blue selected fill; hover uses the secondary surface.
Both themes use 0.9rem supporting copy and circular selection indicators.
Account forms use persistent field labels, 48px controls, autofill attributes,
and reciprocal sign-in/registration links that preserve the starting destination.
Rose actions in light mode and gold Goal actions in dark mode share the same sizing.

### Character color associations

Each character has a memorable accent color for its avatar badge and related
feature moments. These are supporting colors, not replacements for the
primary rose/sea/gold system.

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
2. Use rose for primary interaction, sea blue for links, and gold for bird-related emphasis; do not
   use gold as the only signal for success or focus.
3. Preserve readable contrast between text and tinted surfaces, especially in
   QR portal and mobile layouts.
4. Keep the logo gradient limited to the Godwit mark; use the solid gold token
   for interface controls and navigation states.
