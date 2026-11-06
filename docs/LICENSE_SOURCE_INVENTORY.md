# Product license and source inventory

## Scope

This inventory records direct dependencies declared in `package.json` and verifies the installed package version and `license` metadata in `node_modules`; the corresponding installed license files were read locally. It is a point-in-time source inventory, not a legal opinion or a complete open-source clearance. No packages were installed for this review.

The repository package is marked `"private": true`. No product-level `LICENSE`, `NOTICE`, or `COPYING` file was found at the repository root. That does not establish ownership or licensing of the application source or artwork.

## Direct installed dependencies

| Use | Package | Installed version | Declared package license | Installed license file |
| --- | --- | ---: | --- | --- |
| Runtime | `@sentry/node` | 10.73.0 | MIT | `LICENSE` |
| Runtime | `@sentry/react` | 10.73.0 | MIT | `LICENSE` |
| Runtime | `@supabase/supabase-js` | 2.112.4 | MIT | `LICENSE` |
| Runtime | `chart.js` | 4.5.1 | MIT | `LICENSE.md` |
| Runtime | `i18next` | 26.4.2 | MIT | `LICENSE` |
| Runtime | `i18next-browser-languagedetector` | 8.2.1 | MIT | `LICENSE` |
| Runtime | `imapflow` | 2.2.2 | MIT | `LICENSE.txt` |
| Runtime | `jsqr` | 1.4.0 | Apache-2.0 | `LICENSE` |
| Runtime | `mailparser` | 3.9.33 | MIT | `LICENSE` |
| Runtime | `nodemailer` | 10.0.13 | MIT-0 | `LICENSE` |
| Runtime | `qrcode` | 1.5.4 | MIT | `LICENSE` |
| Runtime | `react` | 19.2.8 | MIT | `LICENSE` |
| Runtime | `react-chartjs-2` | 5.3.1 | MIT | `LICENSE`, `LICENSE.md` |
| Runtime | `react-dom` | 19.2.8 | MIT | `LICENSE` |
| Runtime | `react-i18next` | 17.0.13 | MIT | `LICENSE` |
| Runtime | `react-router-dom` | 7.18.3 | MIT | `LICENSE.md` |
| Development | `autoprefixer` | 10.5.4 | MIT | `LICENSE` |
| Development | `postcss` | 8.5.26 | MIT | `LICENSE` |
| Development | `tailwindcss` | 3.4.17 | MIT | `LICENSE` |
| Development | `typescript` | 6.0.3 | Apache-2.0 | `LICENSE.txt` |
| Development | `vite` | 8.2.2 | MIT | `LICENSE.md` |
| Development | `vitest` | 5.0.0 | MIT | `LICENSE.md` |

## First-party and shipped-source review

- Application code, API routes, database migrations, the public widget/service worker, and translations are maintained in this repository; authorship/assignment records were not reviewed.
- Local graphics include Godwit marks/lockups, bird illustrations, an egg illustration, `hero.png`, public favicon/icons, and Vite/TypeScript SVGs in `src/assets`. The repository does not document the creator, source, or commercial-use rights for the artwork; the owner must confirm provenance and retain source/permission records.
- `src/assets/vite.svg` and `src/assets/typescript.svg` appear to be starter-project assets. Their inclusion/usage in release bundles should be checked and they should be removed if unused and not intentionally shipped.
- No font files are bundled; CSS uses system font stacks.
- The full transitive dependency graph, generated `dist` artifacts, and external brand/media content were not independently license-scanned. Re-run a complete dependency and asset inventory against the release lockfile and deployment bundle.

## Clearance limitations and owner actions

Package metadata and local license-file presence do not prove compliance with notice, attribution, patent, trademark, or distribution obligations. Verify the full license texts and applicable notices, resolve artwork/source ownership, review the complete transitive dependency tree, and confirm any required third-party notices before commercial distribution. This inventory does not claim complete clearance.
