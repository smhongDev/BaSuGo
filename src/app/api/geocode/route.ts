import { geocode, reverseGeocode } from "@/lib/geocode";
import { mockGeocode } from "@/lib/mock";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mock = process.env.BASUGO_MOCK === "1";

  const latParam = sp.get("lat");
  const lngParam = sp.get("lng");
  if (latParam !== null && lngParam !== null) {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "위치가 올바르지 않습니다." }, { status: 400 });
    }
    if (mock) return Response.json({ name: `선택한 위치 (${lat.toFixed(3)}, ${lng.toFixed(3)})` });
    try {
      return Response.json(await reverseGeocode(lat, lng));
    } catch {
      return Response.json({ name: `선택한 위치 (${lat.toFixed(3)}, ${lng.toFixed(3)})` });
    }
  }

  const q = (sp.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 60) {
    return Response.json({ error: "검색어를 1~60자로 입력해 주세요." }, { status: 400 });
  }
  if (mock) return Response.json(mockGeocode(q));
  try {
    return Response.json(await geocode(q));
  } catch (e) {
    console.error("geocode failed", e);
    return Response.json({ error: "장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
