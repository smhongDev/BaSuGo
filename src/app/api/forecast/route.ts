import { getForecast } from "@/lib/forecast";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const start = sp.get("start") ?? "";
  const days = Number(sp.get("days") ?? "1");

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "위치(lat, lng)가 올바르지 않습니다." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) {
    return Response.json({ error: "시작 날짜(start)는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
  }
  if (!Number.isInteger(days) || days < 1 || days > 42) {
    return Response.json({ error: "days는 1~42 사이여야 합니다." }, { status: 400 });
  }

  try {
    return Response.json(await getForecast(lat, lng, start, days));
  } catch (e) {
    console.error("forecast failed", e);
    return Response.json(
      { error: "날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
