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

- `GET /health` → `200 {"status": "ok"}` (does not touch IRSA).
- `POST /jobs` → `202 {job_id, status}`. Body: `ra` 0–360, `dec` −90–90, `fov_arcmin` 1–30 (default 6),
  `detectors` subset of `D1`…`D6` or `null` (all), `max_exposures_per_frame` ≥ 1 (default 30), and the optional
  (additive) `target_name` (1–100 chars, e.g. `"Barnard's star"`) that enables the catalog prediction. Anything
  else → `422`.
  If a job with the same parameters is running or done, its `job_id` and current `status` are returned instead
  of starting a new one (a `failed` job is never reused).
- `GET /jobs/{job_id}` → `status`, `target`, `progress`, `eta_seconds`, `seasons`, `frames` (sorted by date), `stretch`,
  `alerts`. `404` for unknown jobs. `stretch` = `{fixed_from_frame, by_detector}`: `by_detector` (additive) maps each
  detector to the frame its brightness scale was fixed on; `fixed_from_frame` is the first detector's entry.
  Additive Level 3 fields: `target.name` (the `target_name` sent, or `null`), `motion` and `motion_reason`
  (see *Measured motion* below).
- `GET /frames/{frame_id}.png` → PNG at native resolution (6.15″/px; scale it up with `image-rendering: pixelated`).
  `404` until the frame is `ready`.

Behaviour and conventions:

- Jobs run in the background in a single process; job state lives in memory, but three disk layers let warmed
  targets survive restarts and IRSA outages:
  1. **Discovery cache** (`SKYBLINK_DISCOVERY_DIR`): the merged dr1 + qr3 SIA result per (ra, dec, fov, collections).
     Younger than `SKYBLINK_DISCOVERY_TTL` hours (default 24) → used without calling SIA; if SIA fails, any cached
     discovery is used regardless of age (logged as a warning).
  2. **Cutout cache** (`SKYBLINK_CACHE_DIR`), see below.
  3. **Persisted results** (`SKYBLINK_OUTPUT_DIR/results`): when a job finishes `done` with every frame `ready`, its
     JSON and PNGs are saved under the deduplication key. A matching `POST /jobs` returns that job as `done`
     immediately — after a restart and with IRSA down — with the same `job_id` and frame URLs. Persisted results do
     not expire yet.
- At most 2 jobs build at the same time; the others stay `queued`. Finished jobs are dropped from memory (with their
  PNGs) after 6 h, or earlier when more than 200 jobs are stored.
- Build order: one frame per season of the first detector first (the first requested one; `D6` when `detectors` is
  `null`, i.e. D1–D6), then the remaining detectors one by one (D1…D5 by default), each in date order.
- Brightness scale (percentiles 1–99.5 + asinh) is fixed on the first ready frame **of each detector** and reused for
  that detector's frames; a scale is never shared across detectors (their surface brightness differs a lot).
- `eta_seconds` is a range recomputed after each frame from the job's own download + assembly time per exposure
  (×0.8 / ×1.25, and the maximum ×1.2 on top); before the first frame it uses 1–3 s per exposure. `{min: null, max: null}` while discovering.
- `progress.frames_done` counts `ready` and `failed` frames. A failed frame never fails the job.
- Dates (`start`, `end`, `mid_date`) are ISO 8601 UTC strings, e.g. `2025-08-15T20:45:11Z`.
- Alerts and severity: `NO_COVERAGE` (error, no exposure covers the target), `SINGLE_SEASON` (warning),
  `FEW_EXPOSURES` (warning, frame with < 5 exposures), `SATURATED_CORE` (info, see below).
- `SATURATED_CORE`: an exposure counts (once) when its reprojected `OVERFLOW`/`NONLINEAR`/`BLOOM` mask touches the
  3×3 box around the target; the frame gets the alert when at least 2 exposures **and** at least 25% of its exposures
  count. Why: isolated bad pixels flagged `OVERFLOW` (94% also `SUR_ERROR`/`NONFUNC` or NaN) occur at
  4.96×10⁻⁴ per pixel in 428 D6 cutouts, so "any exposure" raised false alarms on 8.5% of 20-exposure frames and
  12.5% of 30-exposure frames anywhere on the sky (it fired on WISE 0855 and Epsilon Indi B). With the new rule the
  worst case is 0.055% (8-exposure frame) and 2.6×10⁻⁸ for 20 exposures; truly saturated stars (Barnard, RW Aur,
  R Dra) have the flags in 100% of their exposures.
- `ALIGNMENT_DRIFT` (warning, per frame): reference stars are picked on the first ready frame of each detector —
  peak S/N ≥ 10 over the frame noise (MAD), not within 3 px of a saturated pixel, the brightest within 3 px
  (isolated), outside the 3×3 box at the centre and ≥ 4 px from the edge. Each later frame of that detector is
  compared with it: the median offset of the stars (iterative 7×7 centroids) above 0.2 px raises the alert. With
  fewer than 3 usable stars there is no alert and the log says how many were usable.
- Downloads share one global limit across all jobs: 6 simultaneous requests; after ≥ 20 cutout requests, if more
  than 20% were HTTP 503 it drops to 4. The 503 count and the errors by status (502, 504, timeouts…) are logged after
  every frame. Simultaneous requests for the same cutout share a single download.
- Cutout cache: each download is stored compacted, keeping only `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI` and `WCS-WAVE`
  with their headers (the ~3.9 MB `EPSF` table is dropped): ~4 MB → ~95–185 KB per cutout, with byte-identical kept
  extensions and identical reprojection. On startup an older cache is compacted in place (once; marker
  `.compact-v1`). The cache is capped (`SKYBLINK_CACHE_MAX_GB`, default 8 GB on the 10 GB volume): when it grows past
  the cap, least-recently-used cutouts are removed down to 90% of it (reads refresh a cutout's time).

### Measured motion (`motion`, additive)

Computed for the first detector (D6 by default) once all its season frames are finished. `motion` is `null` with a
human-readable `motion_reason` when the number can't be defended: fewer than 2 ready seasons, a season whose
**peak S/N at the centroid is below 10** (peak of the 7×7 box ÷ frame noise, MAD), or fewer than 3 exposures
(no error bar).

- Position per season: iterative 7×7 centroid on the stacked frame, corrected by that frame's reference-star median
  offset (`drift_corrected: false` when fewer than 3 reference stars were usable).
- Error bar: bootstrap of the stack — the season's exposures are resampled with replacement, restacked and
  re-centroided 200 times; σ is the spread. The seed comes from the season (id + epoch), so identical requests give
  identical numbers. With 200 resamples the rate varies by σ ≈ 0.01″/yr across seeds (0.10″/yr with 50); it costs
  ~2.6 s per job on the Fly machine.
- Epoch: each season is placed at `epoch_date`, the mean `MJD-AVG` of the exposures that went into the stack. That is
  the epoch the stacked centroid represents; the frame's `mid_date` (midpoint of first and last exposure) can be
  two weeks off when one late exposure stretches the season, which biased the rate by ~4% on Barnard.
- `offset`: from the first season (`reference_season_id`), in grid pixels (`dx_px` +x = west, `dy_px` +y = north)
  and arcsec (`east_arcsec`, `north_arcsec`; 6.15″/px), with errors; `total_arcsec` ± `total_err_arcsec`.
- `rate_arcsec_yr {value, error}`: weighted linear fit of the season positions vs time. It is the *apparent* rate
  (it includes annual parallax).
- With `target_name`: the name is resolved in SIMBAD (`scripts/simbad_position.py` logic, CDS with Harvard mirror
  fallback): position (epoch J2000), proper motion, parallax and radial velocity. The position at each season's
  `epoch_date` is propagated with `apply_space_motion`, and annual parallax is added as the offset between the star
  and a very distant object in the same direction after transforming both to GCRS at that time (aberration is
  common to every star and already absorbed by the image WCS). Each season then gets `predicted_offset` and
  `residual_sigma` = |(measured − predicted) / σ| combined over both axes; `catalog` names the source
  (`name: "SIMBAD"`, `object`, `coordinates_source` bibcode, the astrometry used), the predicted rate at the same
  epochs and `rate_residual_sigma`. If the lookup fails, `catalog` is `null` and `catalog_reason` says why; the
  measured motion is kept.
- Saturated stars (`SATURATED_CORE`) are centroided on their wings; for Barnard's Star this agrees with Gaia DR3
  within ~1σ.

Barnard's Star, D6 (`target_name: "Barnard's star"`, real dr1 + qr3 discovery, pipeline version 4):

| season | epoch_date | measured offset (E, N) ″ | predicted (E, N) ″ | residual |
|---|---|---|---|---|
| 0 | 2025-08-21 | reference | reference | – |
| 1 | 2026-03-29 | (−0.04 ± 0.61, +6.42 ± 0.37) | (+0.53, +6.18) | 1.13σ |
| 2 | 2026-08-20 | (−1.39 ± 0.60, +10.25 ± 0.35) | (−0.80, +10.36) | 1.04σ |

Rate 10.48 ± 0.33″/yr measured vs 10.69″/yr predicted at the same epochs (−0.62σ); SIMBAD total proper motion
10.39″/yr. Reference-star drift 0.095 and 0.016 px (7 stars), no `ALIGNMENT_DRIFT`. The parallax term moves the
season-1 prediction ~1″ east, but the measured east error (~±0.6″) is too large to tell it apart.

Saved results include `PIPELINE_VERSION` in their key: any change to frames, alerts or fields bumps it and old saved
results are ignored.

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

# compact an existing local cache in place (the API also does this on startup)
uv run python scripts/compact_cache.py

# warm the cache of a running API: one D6 job per demo target, one at a time
uv run python scripts/warm_cache.py https://skyblink-api.fly.dev
uv run python scripts/warm_cache.py https://skyblink-api.fly.dev --targets "WISE 0855" "Epsilon Indi B"

# position of a target on a date: SIMBAD (CDS, falling back to the Harvard mirror) ICRS position at epoch J2000,
# proper motion, parallax and radial velocity, propagated with astropy (includes parallax)
uv run python scripts/simbad_position.py "WISE J085510.83-071442.5" --date 2026-03-01
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
| `SKYBLINK_CACHE_MAX_GB` | `8` | Cache size cap; least-recently-used cutouts are evicted beyond it |
| `SKYBLINK_DISCOVERY_DIR` | `.cache/discovery` | Disk cache of SIA discovery results (`/data/discovery` on Fly) |
| `SKYBLINK_DISCOVERY_TTL` | `24` | Hours a cached discovery is used without calling SIA |
| `SKYBLINK_OUTPUT_DIR` | `out` | Rendered PNGs (`out/jobs/`) and persisted results (`out/results/`) |
| `SKYBLINK_MAX_CONCURRENCY` | `6` | Simultaneous cutout requests to IRSA (all jobs together) |
| `SKYBLINK_FALLBACK_CONCURRENCY` | `4` | Concurrency after too many HTTP 503 |
| `SKYBLINK_MAX_503_RATIO` | `0.2` | 503 share that triggers the fallback |
| `SKYBLINK_MIN_REQUESTS_FOR_FALLBACK` | `20` | Requests observed before judging the 503 share |
| `SKYBLINK_MAX_ACTIVE_JOBS` | `2` | Jobs building at the same time |
| `SKYBLINK_MAX_STORED_JOBS` | `200` | Jobs kept in memory |
| `SKYBLINK_JOB_TTL_HOURS` | `6` | Age after which finished jobs are dropped |
| `SKYBLINK_RETRY_ATTEMPTS` | `5` | Attempts per request (503/504/timeouts) |
| `SKYBLINK_RETRY_BASE_DELAY_S` | `2` | Base of the exponential backoff |
| `SKYBLINK_REQUEST_TIMEOUT_S` | `60` | Total time limit per request |
| `SKYBLINK_CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `SKYBLINK_CORS_ORIGIN_REGEX` | empty | Extra origins matching this regex (full match), e.g. every Vercel deploy |

Data notes (verified against real IRSA responses):

- Cutouts: `access_url?center=RA,Dec&size=DEG` → FITS with `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI`, `EPSF`, `WCS-WAVE`.
  The `EPSF` table is ~3.9 MB of the ~4 MB response and is not kept in the cache.
- Flag bits are defined in the `FLAGS` header by `MSKNnnnn` (name) / `MSKMnnnn` (mask) cards; the code reads them at runtime.
- A cutout outside the exposure footprint returns HTTP 422 `Arrays do not overlap.` and is treated as "no data".
- IRSA often answers HTTP 503 transiently; requests are retried with exponential backoff.
- Barnard's Star moves ~10.4″/yr: use its epoch ~2026 position (RA 269.4464, Dec 4.7668), not J2000.
- WISE 0855 moves ~8.1″/yr: its 2025–26 position is (133.7601, −7.2423) from `scripts/simbad_position.py`
  (source: SIMBAD, `WISEA J085510.74-071442.5`, Kirkpatrick et al. 2021, ApJS 253, 7). The older (133.7951, −7.2451)
  is ~2′ (20 px) off; the J2000 epoch was confirmed in the D6 coadds (S/N 12–19 at the predicted spot).

### Deploy (Fly.io)

Public API: **https://skyblink-api.fly.dev** (region `lax`, close to IRSA in Pasadena).

The image (`api/Dockerfile`) uses `python:3.12-slim` + uv, runs a single uvicorn worker (job state is in memory) on
port 8080 with `--proxy-headers`, so `image_url` comes out as `https://…` behind Fly's proxy. The entrypoint prepares
`/data` (cache in `/data/cache`, PNGs in `/data/out`) and then drops to the non-root user `nonroot`.
`api/fly.toml`: one machine, `auto_stop_machines = "off"`, `min_machines_running = 1`, volume `skyblink_data`
on `/data`, health check on `/health`, `shared-cpu-1x` with 1 GB (measured peak RSS 231–275 MB).

Local image test:

```fish
cd api
docker build -t skyblink-api .
docker run --rm -p 8080:8080 -v skyblink-data:/data skyblink-api
```

First deploy (already done) and updates, with `flyctl` (installed in `~/.fly/bin`):

```fish
cd api
fish_add_path --path ~/.fly/bin
fly apps create skyblink-api --org personal
fly volumes create skyblink_data --app skyblink-api --region lax --size 10 --yes
fly deploy --app skyblink-api --ha=false        # also for every later update
```

Seeding the volume (so the demo targets work with IRSA down): build the discovery cache, compact cutouts and saved
results locally (run the API locally and `scripts/warm_cache.py` against it), then upload and unpack them as the app
user, and restart:

```fish
tar -C api -czf seed.tgz --exclude='*.part' --transform 's,^\.cache/cutouts,cache,;s,^\.cache/discovery,discovery,' \
    .cache/cutouts .cache/discovery out/results
fly ssh sftp put seed.tgz /data/seed.tgz --app skyblink-api
fly ssh console --app skyblink-api -C "setpriv --reuid=nonroot --regid=nonroot --init-groups tar -xzf /data/seed.tgz -C /data"
fly ssh console --app skyblink-api -C "rm /data/seed.tgz"
fly machine restart 2869342f39e098 --app skyblink-api
```

Saved results only count for the `PIPELINE_VERSION` that produced them, so reseed after a version bump. Seeded on
2026-11-14 (version 4): Barnard D6 with and without `target_name`, WISE 0855, RW Aur and R Dra in D6, plus the real
discovery of the five demo targets.

Allow the frontend in CORS (restarts the machine, which clears in-memory jobs):

```fish
fly secrets set --app skyblink-api SKYBLINK_CORS_ORIGINS="http://localhost:3000,https://YOUR-FRONTEND"
```

To accept every deploy of a Vercel project without restarting the API again, set the regex once:

```fish
fly secrets set --app skyblink-api SKYBLINK_CORS_ORIGIN_REGEX='https://YOUR-PROJECT(-[a-z0-9-]+)?\.vercel\.app'
```

Measured on Fly (Barnard's Star, D6, 3 frames): cold cache 71 s, warm cache 3 s, peak memory 231–275 MB.

## Use of Super Intelligence (SI)

The backend in `api/` (code, tests, Dockerfile, Fly.io configuration and deploy) was generated with AI assistance
(Claude Code, Anthropic), under the direction and review of the team. Data-format decisions were checked against
real IRSA responses and FITS headers before being coded, and scientific results (Barnard's Star motion) were
compared with Gaia DR3 predictions.
