import test from "node:test";
import assert from "node:assert/strict";
import { classifyWater, nearestCoast } from "./water.ts";
import { rateDay } from "./score.ts";
import { buildDays } from "./forecast.ts";
import { mockSources } from "./mock.ts";
import { kstToday, addDays } from "./dates.ts";
import { lunarDay, mulddae } from "./lunar.ts";

const SOYANG = { lat: 37.948, lng: 127.818 };
const HAEUNDAE = { lat: 35.1587, lng: 129.1604 };
const DAECHEON = { lat: 36.3155, lng: 126.5136 };
const HYEOPJAE = { lat: 33.394, lng: 126.2397 };

test("바다 해안·섬·내륙 물가 구분", () => {
  // 내륙 호수·강: 해안선에서 멀고 바다 예보(파고)가 없다
  assert.equal(classifyWater(SOYANG.lat, SOYANG.lng, false).kind, "inland");
  assert.equal(classifyWater(36.99, 128.03, false).kind, "inland"); // 충주호
  assert.equal(classifyWater(37.528, 126.933, false).kind, "inland"); // 한강 여의도
  // 바다: 해운대(남해), 대천(서해), 협재(제주 섬 → 남해), 경포(동해), 울릉도(동해 섬)
  assert.deepEqual(pick(classifyWater(HAEUNDAE.lat, HAEUNDAE.lng, false)), { kind: "coast", sea: "south" });
  assert.deepEqual(pick(classifyWater(DAECHEON.lat, DAECHEON.lng, false)), { kind: "coast", sea: "west" });
  assert.deepEqual(pick(classifyWater(HYEOPJAE.lat, HYEOPJAE.lng, false)), { kind: "island", sea: "south" });
  assert.deepEqual(pick(classifyWater(37.8055, 128.9086, false)), { kind: "coast", sea: "east" });
  assert.deepEqual(pick(classifyWater(37.48, 130.9, false)), { kind: "island", sea: "east" });
  // 해안선에서 멀어도 파고가 나오면 먼바다 → 바다
  assert.equal(classifyWater(36.2, 125.9, true).kind, "coast");
  assert.ok(nearestCoast(HAEUNDAE.lat, HAEUNDAE.lng).km < 2);
});

const pick = (w: { kind: string; sea: string | null }) => ({ kind: w.kind, sea: w.sea });

test("사리 무게: 서해 > 남해, 동해는 판정에서 뺀다", () => {
  const calm = { windMax: 2, waveMax: 0.2, precipSum: 0, seaTemp: 22, sari: true };
  const west = rateDay({ ...calm, sea: "west" });
  const south = rateDay({ ...calm, sea: "south" });
  const east = rateDay({ ...calm, sea: "east" });
  assert.equal(west.rating, "caution");
  assert.equal(south.rating, "caution");
  assert.ok(west.score < south.score);
  assert.equal(east.rating, "good");
  assert.deepEqual(east.reasonTags, []);
});

test("내륙 물가: 사리 날에도 물때·파도·수온 없이 날씨로만 판정", () => {
  // 앞으로 16일 안의 사리 날짜를 고른다
  const today = kstToday();
  const dates = Array.from({ length: 16 }, (_, i) => addDays(today, i));
  const sariDate = dates.find((d) => mulddae(lunarDay(d)).sari) ?? today;
  const src = mockSources(SOYANG.lat, SOYANG.lng, [sariDate]);
  assert.equal(src.water?.kind, "inland");
  const [day] = buildDays(SOYANG.lat, SOYANG.lng, [sariDate], src, {
    tides: [{ type: "high", time: `${sariDate}T09:00`, height: 2 }],
  });
  assert.equal(day.waveMax, null);
  assert.equal(day.seaTemp, null);
  assert.deepEqual(day.tides, []);
  assert.ok(day.mulddae.startsWith("해당 없음"));
  assert.ok(!(day.reasonTags ?? []).some((t) => t.includes("사리") || t.includes("파도") || t.includes("수온")));
  // 바다(대천)는 같은 날 사리가 판정에 들어간다
  const sea = buildDays(DAECHEON.lat, DAECHEON.lng, [sariDate], mockSources(DAECHEON.lat, DAECHEON.lng, [sariDate]))[0];
  if (mulddae(lunarDay(sariDate)).sari) assert.ok((sea.reasonTags ?? []).some((t) => t.includes("사리")));
});
