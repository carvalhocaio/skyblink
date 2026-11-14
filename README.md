# Skyblink

NASA Space Apps Challenge 2026 — *Planet X and SPHEREx*.

## Backend (`api/`)

FastAPI service that, given RA/Dec and a field of view, finds SPHEREx exposures (IRSA SIA2, collections
`spherex_dr1` + `spherex_qr3`), groups them into seasons, and builds one co-added frame per
detector × season, rendered as PNGs with a shared brightness scale.

Requirements: [uv](https://docs.astral.sh/uv/) (Python 3.12 is installed by uv).

```fish
cd api
uv sync
uv run pytest
```

Useful scripts:

```fish
# median time of real SPHEREx cutouts around Barnard's Star (epoch ~2026 position)
uv run python scripts/measure_cutout.py

# extensions and flag bits of downloaded cutouts
uv run python scripts/inspect_cutout.py path/to/cutout.fits

# one co-added frame per season (shared stretch) + GIF, defaults to Barnard's Star in D6
uv run python scripts/build_frame.py --detector D6
```

Frame recipe (one frame = detector × season; seasons split on gaps > 30 days, computed over all detectors):
ZODI subtraction → local background (sigma-clipped median, `SOURCE` pixels ignored) → mask of
`SUR_ERROR, NONFUNC, MISSING_DATA, HOT, COLD, PERSIST, BLOOM, SNOWBALL, HALO` (saturation kept) →
reprojection to a target-centred 6.15″ grid → inverse-variance mean with outlier rejection where a pixel
has ≥ 5 exposures → percentile + asinh stretch computed on the first frame and reused.

Configuration (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `SKYBLINK_CACHE_DIR` | `.cache/cutouts` | Disk cache of cutouts |
| `SKYBLINK_OUTPUT_DIR` | `out` | Rendered PNGs |
| `SKYBLINK_MAX_CONCURRENCY` | `4` | Simultaneous requests to IRSA |
| `SKYBLINK_RETRY_ATTEMPTS` | `5` | Attempts per request (503/504/timeouts) |
| `SKYBLINK_RETRY_BASE_DELAY_S` | `2` | Base of the exponential backoff |
| `SKYBLINK_REQUEST_TIMEOUT_S` | `60` | Total time limit per request |
| `SKYBLINK_CORS_ORIGINS` | `*` | Comma-separated allowed origins |

Data notes (verified against real IRSA responses):

- Cutouts: `access_url?center=RA,Dec&size=DEG` → FITS with `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `EPSF`, `WCS-WAVE`.
  The `EPSF` table is ~3.9 MB of the ~4 MB response.
- Flag bits are defined in the `FLAGS` header by `MSKNnnnn` (name) / `MSKMnnnn` (mask) cards; the code reads them at runtime.
- A cutout outside the exposure footprint returns HTTP 422 `Arrays do not overlap.` and is treated as "no data".
- IRSA often answers HTTP 503 transiently; requests are retried with exponential backoff.
- Barnard's Star moves ~10.4″/yr: use its epoch ~2026 position (RA 269.4464, Dec 4.7668), not J2000.

## Use of Super Intelligence (SI)

The backend code in `api/` was generated with AI assistance (Claude Code, Anthropic), under the direction and
review of the team. Data-format decisions were checked against real IRSA responses and FITS headers before
being coded.
