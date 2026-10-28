import { addDays, kstToday } from "./dates.ts";
import type { RawSources } from "./forecast.ts";
import type { GeocodeResponse } from "./types.ts";
import { classifyWater, maybeInland } from "./water.ts";

/** 외부 API 없이 화면을 확인하기 위한 가짜 데이터 (BASUGO_MOCK=1 일 때만 사용) */
export function mockSources(lat: number, lng: number, dates: string[]): RawSources {
  const today = kstToday();
  const last = addDays(today, 15);
  const days = dates.filter((d) => d >= today && d <= last);
  // 해안선에서 먼 곳은 바다 예보가 없는 내륙 물가로 흉내 낸다
  const inland = maybeInland(lat, lng);
  const water = classifyWater(lat, lng, !inland);
  if (days.length === 0) return { weather: null, marine: null, water };

  const weather = {
    time: days,
    weather_code: days.map((_, i) => [0, 1, 3, 61, 0, 2, 80, 0][i % 8]),
    temperature_2m_max: days.map((_, i) => 24 + (i % 5)),
    temperature_2m_min: days.map((_, i) => 17 + (i % 4)),
    wind_speed_10m_max: days.map((_, i) => [3.2, 4.8, 6.5, 9.4, 2.1, 5.5, 7.2, 3.9][i % 8]),
    precipitation_sum: days.map((_, i) => [0, 0, 0.4, 8.2, 0, 0, 2.5, 0][i % 8]),
  };

  const start = addDays(days[0], -1);
  const end = addDays(days[days.length - 1], 1);
  const time: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, "0")}:00`);
  }
  const t0 = Date.parse(`${start}T00:00:00Z`) / 3600_000;
  const marine = {
    time,
    // 반일주조(약 12.42시간) 흉내
    sea_level_height_msl: time.map((_, i) => Number((0.9 * Math.sin(((t0 + i) / 12.42) * 2 * Math.PI)).toFixed(3))),
    sea_surface_temperature: time.map(() => 21.4),
    wave_height: time.map((_, i) => 0.2 + 0.25 * Math.abs(Math.sin(i / 40))),
  };
  return { weather, marine: inland ? null : marine, water };
}

export function mockGeocode(q: string): GeocodeResponse {
  const base = [
    { name: "해운대해수욕장", detail: "부산 해운대구", lat: 35.1587, lng: 129.1604 },
    { name: "광안리해수욕장", detail: "부산 수영구", lat: 35.1532, lng: 129.1187 },
    { name: "경포해수욕장", detail: "강원 강릉시", lat: 37.8055, lng: 128.9086 },
  ];
  const hit = base.filter((b) => b.name.includes(q) || q.includes(b.name.slice(0, 2)));
  return hit.length > 0
    ? { query: q, approximate: false, candidates: hit }
    : { query: q, approximate: true, candidates: base };
}
