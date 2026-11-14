import { encodeId } from "../mock";

export async function POST(req: Request) {
  const { ra, dec, fov_arcmin = 6 } = await req.json().catch(() => ({}));
  const ok =
    typeof ra === "number" && ra >= 0 && ra <= 360 &&
    typeof dec === "number" && dec >= -90 && dec <= 90 &&
    typeof fov_arcmin === "number" && fov_arcmin >= 1 && fov_arcmin <= 30;
  if (!ok) return Response.json({ detail: "invalid input" }, { status: 422 });
  const job_id = encodeId({ ra, dec, fov: fov_arcmin, t: Date.now() });
  return Response.json({ job_id, status: "queued" }, { status: 202 });
}
