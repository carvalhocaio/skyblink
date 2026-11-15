import { framePng, mockDisabled } from "../../mock";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const disabled = mockDisabled();
  if (disabled) return disabled;
  const season = Number((await params).file.match(/-s(\d+)-D6\.png$/)?.[1] ?? 0);
  return new Response(new Uint8Array(framePng(season)), { headers: { "Content-Type": "image/png" } });
}
