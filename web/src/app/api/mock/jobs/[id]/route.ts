import { buildJob, mockDisabled } from "../../mock";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = mockDisabled();
  if (disabled) return disabled;
  try {
    return Response.json(buildJob((await params).id, new URL(req.url).origin));
  } catch {
    return Response.json({ detail: "job not found" }, { status: 404 });
  }
}
