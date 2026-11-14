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
uv run pytest                 # unit tests (no network)
uv run pytest -m e2e -s       # real Barnard job against IRSA (a few minutes)
```

### Running the API

```fish
cd api
env SKYBLINK_CORS_ORIGINS=http://localhost:3000 uv run uvicorn skyblink.api.app:app --host 0.0.0.0 --port 8000
```

Example (fish, needs `jq`):

```fish
set job (curl -s -X POST http://localhost:8000/jobs \
    -H 'content-type: application/json' \
    -d '{"ra": 269.4462, "dec": 4.7682, "fov_arcmin": 6, "detectors": ["D6"]}' | jq -r .job_id)
curl -s http://localhost:8000/jobs/$job | jq '{status, progress, eta_seconds}'
curl -s -o frame.png (curl -s http://localhost:8000/jobs/$job | jq -r '.frames[0].image_url')
```

Endpoints:

- `POST /jobs` → `202 {job_id, status: "queued"}`. Body: `ra` 0–360, `dec` −90–90, `fov_arcmin` 1–30 (default 6),
  `detectors` subset of `D1`…`D6` or `null` (all), `max_exposures_per_frame` ≥ 1 (default 30). Anything else → `422`.
- `GET /jobs/{job_id}` → `status`, `target`, `progress`, `eta_seconds`, `seasons`, `frames` (sorted by date), `stretch`,
  `alerts`. `404` for unknown jobs.
- `GET /frames/{frame_id}.png` → PNG at native resolution (6.15″/px; scale it up with `image-rendering: pixelated`).
  `404` until the frame is `ready`.

Behaviour and conventions:

- Jobs run in the background in a single process; state lives in memory (lost on restart). Cutouts are cached on disk.
- Build order: one frame per season first (first requested detector, or the detector with most exposures when
  `detectors` is `null`), then the other detectors.
- Brightness scale (percentiles 1–99.5 + asinh) is fixed on the first ready frame and reused for every frame of the job.
- `eta_seconds` is a range recomputed after each frame from the job's own download + assembly time per exposure
  (×0.8 / ×1.25); before the first frame it uses 1–3 s per exposure. `{min: null, max: null}` while discovering.
- `progress.frames_done` counts `ready` and `failed` frames. A failed frame never fails the job.
- Dates (`start`, `end`, `mid_date`) are ISO 8601 UTC strings, e.g. `2025-08-15T20:45:11Z`.
- Alerts and severity: `NO_COVERAGE` (error, no exposure covers the target), `SINGLE_SEASON` (warning),
  `FEW_EXPOSURES` (warning, frame with < 5 exposures), `SATURATED_CORE` (info, `OVERFLOW`/`NONLINEAR`/`BLOOM`
  within 1 px of the target).
- Download concurrency starts at 8; after ≥ 20 cutout requests, if more than 20% were HTTP 503 it drops to 6.
  The 503 count is logged after every frame.

Useful scripts:

```fish
# median time of real SPHEREx cutouts around Barnard's Star (epoch ~2026 position)
uv run python scripts/measure_cutout.py

# extensions and flag bits of downloaded cutouts
uv run python scripts/inspect_cutout.py path/to/cutout.fits

# one co-added frame per season (shared stretch) + GIF, defaults to Barnard's Star in D6
uv run python scripts/build_frame.py --detector D6

# Barnard's motion between first and last season: per-exposure centroids with bootstrap
# error bars, coadd centroid, Gaia DR3 prediction and background-star stability
uv run python scripts/measure_motion.py
```

Frame recipe (one frame = detector × season; seasons split on gaps > 30 days, computed over all detectors):
ZODI subtraction → local background (sigma-clipped median, `SOURCE` pixels ignored) → mask of
`SUR_ERROR, NONFUNC, MISSING_DATA, HOT, COLD, PERSIST, SNOWBALL, HALO` (saturation bits `OVERFLOW, NONLINEAR, BLOOM` kept
in the image and counted for `SATURATED_CORE`) →
reprojection to a target-centred 6.15″ grid → inverse-variance mean with outlier rejection where a pixel
has ≥ 5 exposures → percentile + asinh stretch computed on the first frame and reused.

Configuration (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `SKYBLINK_CACHE_DIR` | `.cache/cutouts` | Disk cache of cutouts |
| `SKYBLINK_OUTPUT_DIR` | `out` | Rendered PNGs (API jobs under `out/jobs/`) |
| `SKYBLINK_MAX_CONCURRENCY` | `8` | Simultaneous cutout requests to IRSA |
| `SKYBLINK_FALLBACK_CONCURRENCY` | `6` | Concurrency after too many HTTP 503 |
| `SKYBLINK_MAX_503_RATIO` | `0.2` | 503 share that triggers the fallback |
| `SKYBLINK_MIN_REQUESTS_FOR_FALLBACK` | `20` | Requests observed before judging the 503 share |
| `SKYBLINK_RETRY_ATTEMPTS` | `5` | Attempts per request (503/504/timeouts) |
| `SKYBLINK_RETRY_BASE_DELAY_S` | `2` | Base of the exponential backoff |
| `SKYBLINK_REQUEST_TIMEOUT_S` | `60` | Total time limit per request |
| `SKYBLINK_CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

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
