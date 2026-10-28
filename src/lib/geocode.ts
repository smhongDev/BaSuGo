import type { GeoCandidate, GeocodeResponse } from "./types.ts";

const NOMINATIM = "https://nominatim.openstreetmap.org";
// Nominatim 이용 정책: 앱을 식별할 수 있는 User-Agent가 필요하고 초당 1회 이하로 호출해야 한다.
const HEADERS = { "User-Agent": "BaSuGo/0.1 (basugo.myfinder.co.kr)", "Accept-Language": "ko" };

type NominatimItem = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
};

async function search(q: string): Promise<GeoCandidate[]> {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&countrycodes=kr&addressdetails=1`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const items = (await res.json()) as NominatimItem[];
  return items.map((it) => {
    const parts = it.display_name.split(",").map((s) => s.trim());
    return {
      name: it.name || parts[0],
      detail: parts.slice(1, 4).join(" "),
      lat: Number(it.lat),
      lng: Number(it.lon),
    };
  });
}

/** 입력과 같은 이름이 없으면 해수욕장·해변·항 같은 말을 붙여서 가까운 후보를 찾는다. */
export async function geocode(q: string): Promise<GeocodeResponse> {
  const direct = await search(q);
  const exact = direct.filter((c) => c.name.includes(q) || q.includes(c.name));
  if (exact.length > 0) return { query: q, approximate: false, candidates: exact };

  for (const suffix of ["해수욕장", "해변", "항"]) {
    if (q.endsWith(suffix)) continue;
    const found = await search(`${q} ${suffix}`);
    if (found.length > 0) return { query: q, approximate: true, candidates: found };
  }
  return { query: q, approximate: true, candidates: direct };
}

export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string }> {
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=14&accept-language=ko`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const j = (await res.json()) as NominatimItem;
  const a = j.address ?? {};
  const name = j.name || a.suburb || a.village || a.town || a.city || j.display_name?.split(",")[0];
  return { name: name || `선택한 위치 (${lat.toFixed(3)}, ${lng.toFixed(3)})` };
}
