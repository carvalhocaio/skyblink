import type { Motion } from "./api";

export type Verdict = "agree" | "close" | "disagree" | "tiny" | "noCatalog";

// |residual| in sigmas: ≤2 agree, ≤3 close, else disagree. A rate within 2σ of zero reads as "doesn't visibly move".
export function verdict(m: Motion): Verdict {
  const { value, error } = m.rate_arcsec_yr;
  if (value < 2 * error) return "tiny";
  if (!m.catalog) return "noCatalog";
  const s = Math.abs(m.catalog.rate_residual_sigma);
  return s <= 2 ? "agree" : s <= 3 ? "close" : "disagree";
}

export type Reason = "faint" | "centroid" | "exposures" | "alignment" | "seasons" | "other";

// Maps the backend's technical motion_reason to a plain-language key.
export function reasonKey(reason: string | null | undefined): Reason {
  const r = reason ?? "";
  if (r.includes("too faint")) return "faint";
  if (r.includes("centroid")) return "centroid";
  if (r.includes("exposures")) return "exposures";
  if (r.includes("reference stars")) return "alignment";
  if (r.includes("two seasons")) return "seasons";
  return "other";
}
