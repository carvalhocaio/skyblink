import { buildJob } from "../../mock";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(buildJob((await params).id, new URL(req.url).origin));
  } catch {
    return Response.json({ detail: "job not found" }, { status: 404 });
  }
}
