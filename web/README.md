# SkyBlink web

The SkyBlink interface: Next.js 16 (App Router), React 19, Tailwind 4, deployed on Vercel. One page that plays real
SPHEREx frames as a time-lapse and explains what changed. Project overview, science and validation:
[`../README.md`](../README.md).

## Run

Requires [pnpm](https://pnpm.io/).

```fish
pnpm install
pnpm dev                                                    # built-in mock API, made-up data
env NEXT_PUBLIC_API_URL=https://skyblink-api.fly.dev pnpm dev  # real data from the public API
env NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev        # your local backend (see ../api)
```

Open <http://localhost:3000>. The public API accepts `http://localhost:3000` as a CORS origin; use that port.

Checks before a pull request: `pnpm lint` and `pnpm build`. There are no frontend tests: try the five featured
targets, a custom RA/Dec, `?lang=pt`, a 375 px wide window, keyboard only, and reduced motion.

## Environment

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL. Unset: the mock at `/api/mock` (never in production, see below). |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL for share images and canonical links outside Vercel. |

## Data honesty rules

- **The mock never reaches production.** Its motion numbers would look like real measurements, so on a Vercel
  production build a missing `NEXT_PUBLIC_API_URL` shows the "server busy" error instead (`src/lib/api.ts`), and the
  mock routes answer 404 (`src/app/api/mock/mock.ts`).
- **Real data and illustrations are labelled.** The player and the hero carry a *Real SPHEREx data* badge; the
  How-it-works scenes, the life-of-stars scrubber and the Blink Hunter game are marked as illustration or simulation.
- **Every number shown comes from the API.** The per-picture shift reads `motion.seasons[].offset`; the
  Investigate panel reads the job's `alerts` and `motion`. Nothing is computed from pixels in the browser.
- The hero frames in `public/demo/` are the real D6 frames of Barnard's Star saved from the production API.

## Where things are

| Path | What it is |
|---|---|
| `src/app/home.tsx` | The page: nav, hero, sections, footer, and the target → job → player flow |
| `src/lib/api.ts` | API types (subset of `api/src/skyblink/api/schemas.py`), fetch helpers, formatting |
| `src/lib/use-job.ts` | Creates a job and polls it, with retries and stall detection |
| `src/components/player.tsx` | The time-lapse player: timeline, speeds, First ↔ last, shift readout, crosshair |
| `src/components/motion-card.tsx` | Measured motion vs the catalog prediction |
| `src/components/motion-path.tsx` | "Where did it go?": measured path per season vs the catalog prediction (SVG) |
| `src/components/data-drawer.tsx` | "Show the data": every API field as tables, plus JSON and CSV downloads |
| `src/components/investigate.tsx` | "Can we trust what we see?": three questions answered from the job |
| `src/components/hero-blink.tsx` | The hero's real Barnard's Star loop |
| `src/components/target-form.tsx` | Featured targets and the custom RA/Dec form |
| `src/lib/i18n.ts` | All copy, English and Portuguese (`pt` must match `en`'s shape) |
| `src/lib/glossary.ts` | Jargon explained in place by `<Gloss>` |
| `src/lib/eggs.tsx` | Hidden extras (physicists, Blink Hunter game), loaded lazily |

The components `ClickSpark`, `Counter`, `Crosshair`, `FlipCard` and `StarBorder` come from
[React Bits](https://reactbits.dev) under MIT + Commons Clause, not this repository's MIT license.
