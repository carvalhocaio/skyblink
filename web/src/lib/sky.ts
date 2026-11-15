// Sky coordinates for a point in a SkyBlink image (north up, east left, centred on ra/dec).
// ponytail: flat-sky approximation, fine for fields under 15′; a real WCS when fields grow.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** RA in degrees → "17h 57m 48.5s", the way Wikipedia writes it. */
export function formatRA(deg: number) {
  const tenths = Math.round((((deg % 360) + 360) % 360) * 2400); // 0.1 s of time
  const h = Math.floor(tenths / 36000) % 24, m = Math.floor(tenths / 600) % 60, s = (tenths % 600) / 10;
  return `${h}h ${pad(m)}m ${s.toFixed(1).padStart(4, "0")}s`;
}

/** Dec in degrees → "+4° 41′ 36″". */
export function formatDec(deg: number) {
  const total = Math.round(Math.abs(deg) * 3600);
  const d = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return `${deg < 0 ? "−" : "+"}${d}° ${pad(m)}′ ${pad(s)}″`;
}

/** Point (fx, fy as 0–1 across the image) in an image spanning `span` arcmin → RA/Dec in degrees. */
export function skyAt(center: { ra: number; dec: number }, span: number, fx: number, fy: number) {
  const east = (0.5 - fx) * span, north = (0.5 - fy) * span; // arcmin
  const dec = center.dec + north / 60;
  const ra = center.ra + east / 60 / Math.cos((center.dec * Math.PI) / 180);
  return { ra: ((ra % 360) + 360) % 360, dec };
}
