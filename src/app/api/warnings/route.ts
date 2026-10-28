import { getWarnings } from "@/lib/warnings";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (sp.get("lat") === null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "위치(lat, lng)가 올바르지 않습니다." }, { status: 400 });
  }
  return Response.json(await getWarnings(lat, lng));
}
