export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/mock";

export type Severity = "error" | "warning" | "info";
export type JobAlert = { code: string; severity: Severity };

export type Frame = {
  id: string;
  season_id: number;
  detector: string;
  wavelength_um: [number, number];
  mid_date: string;
  status: "pending" | "ready" | "failed";
  n_exposures_used: number;
  n_exposures_available: number;
  image_url: string | null;
  alerts: JobAlert[];
};

/** Where the star sat in one season, measured from the images, relative to the reference season. */
export type SeasonMotion = {
  season_id: number;
  frame_id: string;
  mid_date: string;
  offset: { dx_px: number; dy_px: number; east_arcsec: number; north_arcsec: number; total_arcsec: number };
};

export type Motion = {
  detector: string;
  seasons?: SeasonMotion[];
  rate_arcsec_yr: { value: number; error: number };
  catalog: { name: string; object: string; predicted_rate_arcsec_yr: number; rate_residual_sigma: number } | null;
  catalog_reason: string | null;
};

export type Job = {
  status: "queued" | "discovering" | "building" | "done" | "failed";
  target: { ra: number; dec: number; fov_arcmin: number };
  progress: { frames_done: number; frames_total: number; percent: number };
  eta_seconds: { min: number | null; max: number | null };
  seasons: { id: number; start: string; end: string; n_exposures: number }[];
  frames: Frame[];
  stretch: { fixed_from_frame: string | null };
  alerts: JobAlert[];
  motion?: Motion | null;
  motion_reason?: string | null;
};

export class InputError extends Error {}
export class NotFoundError extends Error {}

export async function createJob(ra: number, dec: number, fov: number, targetName?: string): Promise<string> {
  const res = await fetch(`${API_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ra, dec, fov_arcmin: fov, detectors: ["D6"], target_name: targetName }),
  });
  if (res.status === 422) {
    throw new InputError("Check the values: RA 0–360°, Dec −90–90°, field of view 1–15 arcmin.");
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).job_id;
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${API_URL}/jobs/${id}`, { cache: "no-store" });
  if (res.status === 404) throw new NotFoundError(id);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function formatEta(eta: Job["eta_seconds"], about: string): string | null {
  if (eta.min == null || eta.max == null || eta.max <= 0) return null;
  if (eta.max < 60) return `${about} ${Math.max(1, Math.round(eta.min))}–${Math.round(eta.max)} s`;
  const lo = Math.max(1, Math.round(eta.min / 60));
  const hi = Math.max(lo, Math.ceil(eta.max / 60));
  return lo === hi ? `${about} ${lo} min` : `${about} ${lo}–${hi} min`;
}

export const formatMonth = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });

// Job alerts and alerts on every frame show once; the rest keep the dates of the frames they belong to.
export function groupAlerts(job: Job, frames: Frame[]): { alert: JobAlert; dates: string[] | null }[] {
  const out = new Map(job.alerts.map((a) => [a.code, { alert: a, dates: null as string[] | null }]));
  for (const code of new Set(frames.flatMap((f) => f.alerts.map((a) => a.code)))) {
    if (out.has(code)) continue;
    const hit = frames.filter((f) => f.alerts.some((a) => a.code === code));
    const alert = hit[0].alerts.find((a) => a.code === code)!;
    out.set(code, { alert, dates: hit.length === frames.length ? null : hit.map((f) => f.mid_date) });
  }
  return [...out.values()];
}
