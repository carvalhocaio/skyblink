import { crc32, deflateSync } from "node:zlib";
import type { Frame, Job } from "@/lib/api";

// Contract-following fake API: a job goes queued → done in ~20 s, releasing 3 D6 frames.
const SEASONS = [
  { id: 0, start: "2025-08-15T20:45:11Z", end: "2025-08-27T11:37:04Z", n_exposures: 17 },
  { id: 1, start: "2026-03-19T07:25:17Z", end: "2026-05-05T01:59:28Z", n_exposures: 24 },
  { id: 2, start: "2026-08-16T15:06:13Z", end: "2026-09-22T05:15:10Z", n_exposures: 19 },
];
const QUEUED_S = 3;
const DISCOVER_S = 8;
const FRAME_S = 4;

type Target = { ra: number; dec: number; fov: number; t: number };

export const encodeId = (t: Target) => Buffer.from(JSON.stringify(t)).toString("base64url");
export const decodeId = (id: string): Target => JSON.parse(Buffer.from(id, "base64url").toString());

const mid = (a: string, b: string) =>
  new Date((Date.parse(a) + Date.parse(b)) / 2).toISOString().replace(/\.\d+Z$/, "Z");

export function buildJob(id: string, origin: string): Job {
  const { ra, dec, fov, t } = decodeId(id);
  const elapsed = (Date.now() - t) / 1000;
  const ready = Math.max(0, Math.min(3, Math.floor((elapsed - DISCOVER_S) / FRAME_S)));
  const done = ready === 3;
  const status = elapsed < QUEUED_S ? "queued" : elapsed < DISCOVER_S ? "discovering" : done ? "done" : "building";
  const searching = status === "queued" || status === "discovering";
  const remaining = Math.max(0, DISCOVER_S + 3 * FRAME_S - elapsed);
  const hash = id.slice(-12);

  const frames: Frame[] = searching
    ? []
    : SEASONS.map((s, i) => ({
        id: `${hash}-s${i}-D6`,
        season_id: s.id,
        detector: "D6",
        wavelength_um: [4.4115, 5.0096],
        mid_date: mid(s.start, s.end),
        status: i < ready ? "ready" : "pending",
        n_exposures_used: s.n_exposures,
        n_exposures_available: s.n_exposures,
        image_url: i < ready ? `${origin}/api/mock/frames/${hash}-s${i}-D6.png` : null,
        alerts: [{ code: "SATURATED_CORE", severity: "info" }],
        exposures: Array.from({ length: s.n_exposures }, (_, k) => ({
          obs_id: `mock-${s.id}-${k}`,
          collection: "spherex_dr1",
          date: s.start,
          wavelength_um: [4.4115, 5.0096] as [number, number],
          access_url: "https://irsa.ipac.caltech.edu/Missions/spherex.html",
        })),
      }));

  return {
    status,
    target: { ra, dec, fov_arcmin: fov },
    progress: { frames_done: ready, frames_total: searching ? 0 : 3, percent: Math.round((ready / 3) * 100) },
    eta_seconds: searching ? { min: null, max: null } : { min: Math.floor(remaining * 0.8), max: Math.ceil(remaining * 1.5) },
    seasons: searching ? [] : SEASONS,
    frames,
    stretch: { fixed_from_frame: searching ? null : `${hash}-s0-D6` },
    alerts: [],
    motion: done
      ? {
          detector: "D6",
          reference_season_id: 0,
          // Same drift the mock PNGs draw: the central star moves ~1.5 px north per season.
          seasons: frames.map((f, i) => ({
            season_id: i,
            frame_id: f.id,
            mid_date: f.mid_date,
            offset: {
              dx_px: 0,
              dy_px: 1.5 * i,
              east_arcsec: 0,
              north_arcsec: 1.5 * i * 6.15,
              total_arcsec: 1.5 * i * 6.15,
              total_err_arcsec: i ? 0.35 : 0,
              east_err_arcsec: i ? 0.3 : 0,
              north_err_arcsec: i ? 0.35 : 0,
            },
            // The mock star sits at row 29 − 1.5·season from the top of a 59 px image: y from the bottom is 29 + 1.5·season.
            position_px: [29, 29 + 1.5 * i] as [number, number],
            position_err_px: [0.05, 0.06] as [number, number],
            predicted_offset: { dx_px: (-0.4 * i) / 6.15, dy_px: (9.4 * i) / 6.15, east_arcsec: 0.4 * i, north_arcsec: 9.4 * i, total_arcsec: Math.hypot(0.4 * i, 9.4 * i) },
            residual_sigma: i ? -0.5 : null,
            peak_snr: 120,
            drift_corrected: true,
          })),
          rate_arcsec_yr: { value: 10.47, error: 0.34 },
          catalog: { name: "SIMBAD", object: "NAME Barnard's star", predicted_rate_arcsec_yr: 10.65, rate_residual_sigma: -0.53 },
          catalog_reason: null,
        }
      : null,
    motion_reason: null,
  };
}

const SIZE = 59;

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Background stars stay put; the central star drifts north ~1.5 px per season.
export function framePng(season: number): Buffer {
  const img = new Float32Array(SIZE * SIZE);
  const noise = rng(1000 + season);
  for (let i = 0; i < img.length; i++) img[i] = 20 + noise() * 12;

  const star = (cx: number, cy: number, amp: number, sigma: number) => {
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++)
        img[y * SIZE + x] += amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma ** 2));
  };
  const bg = rng(42);
  for (let i = 0; i < 14; i++) star(bg() * SIZE, bg() * SIZE, 40 + bg() * 160, 0.9 + bg() * 0.4);
  star(29, 29 - 1.5 * season, 900, 1.3);

  const raw = Buffer.alloc(SIZE * (SIZE + 1));
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) raw[y * (SIZE + 1) + 1 + x] = Math.min(255, img[y * SIZE + x]);

  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth; color type 0 = grayscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The mock answers 404 in production, so its made-up results can never pass for real ones. */
export const mockDisabled = () => (process.env.VERCEL_ENV === "production" ? new Response(null, { status: 404 }) : null);
