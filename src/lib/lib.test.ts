import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTrack, haversineKm } from "./gpx.ts";
import { swimCalories, metForSpeed } from "./calories.ts";
import { extractTides, flowsForDay } from "./tides.ts";
import { rateDay } from "./score.ts";
import { lunarDay, mulddae } from "./lunar.ts";
import { addDays, dateRange, weekday } from "./dates.ts";
import { buildDays } from "./forecast.ts";
import { mockSources } from "./mock.ts";
import { kstToday } from "./dates.ts";

test("haversine: 위도 1도는 약 111.2km", () => {
  const d = haversineKm({ lat: 35, lng: 129 }, { lat: 36, lng: 129 });
  assert.ok(Math.abs(d - 111.2) < 0.3, String(d));
});

test("analyzeTrack: 거리와 시간, 한국 날짜", () => {
  // 위도를 0.0009도(약 100m)씩 올리며 5분 간격 5점 → 약 400m, 20분
  const t0 = Date.parse("2026-08-01T14:30:00Z"); // 한국 시각 8/1 23:30
  const pts = Array.from({ length: 5 }, (_, i) => ({ lat: 35 + i * 0.0009, lng: 129, t: t0 + i * 300_000 }));
  const s = analyzeTrack(pts);
  assert.ok(Math.abs(s.distanceKm - 0.4) < 0.01, String(s.distanceKm));
  assert.equal(Math.round(s.durationMin ?? 0), 20);
  assert.equal(s.date, "2026-08-01");
  assert.equal(s.removedJumps, 0);
});

test("analyzeTrack: GPS 튀는 점은 거리에서 제외", () => {
  const t0 = Date.parse("2026-08-01T00:00:00Z");
  const pts = [
    { lat: 35, lng: 129, t: t0 },
    { lat: 35.0009, lng: 129, t: t0 + 60_000 },
    { lat: 35.5, lng: 129, t: t0 + 120_000 }, // 55km를 1분에 — 튄 점
    { lat: 35.0018, lng: 129, t: t0 + 180_000 },
  ];
  const s = analyzeTrack(pts);
  assert.equal(s.removedJumps, 1);
  assert.ok(Math.abs(s.distanceKm - 0.2) < 0.01, String(s.distanceKm));
});

test("analyzeTrack: 시간이 없으면 durationMin·date는 null", () => {
  const s = analyzeTrack([
    { lat: 35, lng: 129, t: null },
    { lat: 35.001, lng: 129, t: null },
  ]);
  assert.equal(s.durationMin, null);
  assert.equal(s.date, null);
});

test("analyzeTrack: 점이 많으면 maxPoints로 줄이되 마지막 점은 유지", () => {
  const pts = Array.from({ length: 2000 }, (_, i) => ({ lat: 35 + i * 0.00001, lng: 129, t: null }));
  const s = analyzeTrack(pts, 100);
  assert.ok(s.points.length <= 102);
  assert.equal(s.points[s.points.length - 1][0], pts[1999].lat);
});

test("칼로리: 1시간 2km/h(MET 8) 70kg → 560kcal", () => {
  assert.equal(swimCalories(70, 2, 60), 560);
  assert.equal(metForSpeed(1), 6);
  assert.equal(metForSpeed(3), 10);
});

test("칼로리: 시간 정보가 없으면 2km/h로 가정", () => {
  // 1km → 0.5h, MET 8 × 70 × 0.5 = 280
  assert.equal(swimCalories(70, 1, null), 280);
  assert.equal(swimCalories(70, 0, null), 0);
});

test("물때: 사인파에서 만조·간조 시각을 분 단위로 찾는다", () => {
  const times: string[] = [];
  const heights: number[] = [];
  const period = 12.42;
  const peakAt = 3.3; // 만조 3시 18분
  for (let h = 0; h < 48; h++) {
    const d = h < 24 ? "2026-08-01" : "2026-08-02";
    times.push(`${d}T${String(h % 24).padStart(2, "0")}:00`);
    heights.push(Math.cos(((h - peakAt) / period) * 2 * Math.PI));
  }
  const ev = extractTides(times, heights);
  assert.equal(ev[0].type, "high");
  assert.equal(ev[0].time, "2026-08-01T03:18");
  assert.equal(ev[1].type, "low");
  assert.equal(ev[1].time.slice(0, 13), "2026-08-01T09");
  // 만조→간조는 썰물, 간조→만조는 밀물
  const flows = flowsForDay(ev, "2026-08-01");
  assert.equal(flows[0].kind, "ebb");
  assert.equal(flows[1].kind, "flood");
});

test("물때: 데이터가 비면 이벤트 없음", () => {
  assert.deepEqual(extractTides(["2026-08-01T00:00", "2026-08-01T01:00"], [null, null]), []);
});

test("바수 판단: 잔잔하면 가능, 바람 강하면 불가", () => {
  const calm = rateDay({ windMax: 3, waveMax: 0.2, precipSum: 0, seaTemp: 22, sari: false });
  assert.equal(calm.rating, "good");
  const windy = rateDay({ windMax: 10, waveMax: 0.2, precipSum: 0, seaTemp: 22, sari: false });
  assert.equal(windy.rating, "bad");
  const mid = rateDay({ windMax: 6, waveMax: 0.2, precipSum: 0, seaTemp: 22, sari: false });
  assert.equal(mid.rating, "caution");
  assert.ok(calm.score > mid.score && mid.score > windy.score);
});

test("바수 판단: 사리·낮은 수온은 주의", () => {
  assert.equal(rateDay({ windMax: 2, waveMax: 0.1, precipSum: 0, seaTemp: 22, sari: true }).rating, "caution");
  assert.equal(rateDay({ windMax: 2, waveMax: 0.1, precipSum: 0, seaTemp: 12, sari: false }).rating, "caution");
});

test("음력·물때 번호 범위", () => {
  for (const d of dateRange("2026-01-01", 60)) {
    const ld = lunarDay(d);
    assert.ok(ld >= 1 && ld <= 30, `${d} ${ld}`);
    const m = mulddae(ld);
    assert.ok(m.number >= 1 && m.number <= 15);
  }
  // 음력 1일·16일은 8물때, 음력 8일은 15물때(조금), 15일은 7물때
  assert.equal(mulddae(1).number, 8);
  assert.equal(mulddae(16).number, 8);
  assert.equal(mulddae(8).number, 15);
  assert.equal(mulddae(15).number, 7);
});

test("날짜 도우미", () => {
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(weekday("2026-08-01"), 6);
});

test("buildDays: 목 데이터로 하루 정보 조립 (예보 밖 날짜는 unknown)", () => {
  const today = kstToday();
  const dates = dateRange(today, 20);
  const days = buildDays(35.15, 129.16, dates, mockSources(35.15, 129.16, dates));
  assert.equal(days.length, 20);
  assert.equal(days[0].forecastAvailable, true);
  assert.ok(days[0].tides.length >= 3, "하루에 만조·간조가 3개 이상");
  assert.match(days[0].sunrise, /^\d\d:\d\d$/);
  assert.equal(days[19].forecastAvailable, false);
  assert.equal(days[19].rating, "unknown");
  assert.equal(days[19].score, null);
});
