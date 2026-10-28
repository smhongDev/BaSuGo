import test from "node:test";
import assert from "node:assert/strict";
import { alertsFor, formatTmFc, matchRegions, splitLines } from "./warnings.ts";
import { COAST_POINTS, nearestCoastPoint, nearestTideStation } from "./regions.ts";
import { parseKhoaItems } from "./khoa.ts";
import { rateDay, THRESHOLDS } from "./score.ts";
import { validateThresholds } from "./server/settings.ts";
import { decideAlert, isAllowedEndpoint } from "./server/push.ts";
import { buildDays } from "./forecast.ts";
import { mockSources } from "./mock.ts";
import { kstToday } from "./dates.ts";

const point = (name: string) => COAST_POINTS.find((p) => p.name === name)!;

test("특보 문구를 종류와 지역으로 나눈다", () => {
  const lines = splitLines("o 풍랑주의보 : 동해중부앞바다, 남해동부앞바다(부산앞바다)\r\no 강풍주의보 : 강원도(강릉시평지)");
  assert.deepEqual(
    lines.map((l) => l.kind),
    ["풍랑주의보", "강풍주의보"],
  );
  const pre = splitLines("(1) 강풍 예비특보 : 10월 29일 새벽(00시~06시) : 제주도(제주도북부)");
  assert.equal(pre[0].kind, "강풍 예비특보");
  assert.equal(pre[0].regions, "제주도(제주도북부)");
});

test("특보 지역 매칭: 바다 구역, 시·군, 같은 시·도", () => {
  assert.equal(matchRegions("동해중부앞바다, 남해동부앞바다", point("강릉"))?.match, "exact");
  assert.equal(matchRegions("강원도(강릉시평지, 동해시평지)", point("강릉"))?.match, "exact");
  assert.equal(matchRegions("강원도(속초시평지)", point("강릉"))?.match, "province");
  assert.equal(matchRegions("부산, 울산", point("해운대"))?.match, "exact");
  assert.equal(matchRegions("경상북도(울릉도.독도)", point("울릉도"))?.match, "exact");
  assert.equal(matchRegions("전라남도(여수)", point("강릉")), null);
});

test("관련 없는 특보(건조)는 빼고, 직접 해당이 먼저 온다", () => {
  const alerts = alertsFor(
    {
      tmFc: "202610281000",
      t6: "o 건조주의보 : 강원도(강릉)\no 강풍주의보 : 강원도(속초시평지)\no 풍랑경보 : 동해중부앞바다",
      t7: "",
    },
    point("강릉"),
  );
  assert.deepEqual(
    alerts.map((a) => [a.kind, a.match, a.level]),
    [
      ["풍랑경보", "exact", "경보"],
      ["강풍주의보", "province", "주의보"],
    ],
  );
  assert.equal(formatTmFc("202610281000"), "2026-10-28 10:00");
});

test("가까운 해안 기준점·조위관측소, 내륙은 없음", () => {
  assert.equal(nearestCoastPoint(35.1587, 129.1604)?.item.name, "해운대");
  assert.equal(nearestTideStation(35.1587, 129.1604)?.item.code, "DT_0005");
  assert.equal(nearestCoastPoint(36.35, 127.38), null); // 대전
});

test("조석예보 응답 → 만조·간조 (cm → m, 고저 판단)", () => {
  const ev = parseKhoaItems([
    { predcDt: "2026-10-28 09:41", predcTdlvVl: 112 },
    { predcDt: "2026-10-28 03:20", predcTdlvVl: 15 },
    { predcDt: "2026-10-28 15:55", predcTdlvVl: 20 },
    { predcDt: "2026-10-28 22:01", predcTdlvVl: 118 },
  ]);
  assert.deepEqual(
    ev.map((e) => [e.type, e.time, e.height]),
    [
      ["low", "2026-10-28T03:20", 0.15],
      ["high", "2026-10-28T09:41", 1.12],
      ["low", "2026-10-28T15:55", 0.2],
      ["high", "2026-10-28T22:01", 1.18],
    ],
  );
  assert.equal(parseKhoaItems([{ tph_time: "2026-10-28 04:00", tph_level: 50, hl_code: "고조" }])[0].type, "high");
});

test("관리자 기준값을 바꾸면 판정이 바뀐다", () => {
  const input = { windMax: 6, waveMax: 0.2, precipSum: 0, seaTemp: 20, sari: false };
  assert.equal(rateDay(input).rating, "caution");
  assert.equal(rateDay(input, { ...THRESHOLDS, windGood: 7 }).rating, "good");
  const today = kstToday();
  const src = mockSources(35, 129, [today]);
  const strict = buildDays(35, 129, [today], src, { thresholds: { ...THRESHOLDS, windGood: 0, windCaution: 0.1 } });
  assert.equal(strict[0].rating, "bad");
});

test("기준값 검사", () => {
  assert.equal(validateThresholds({ ...THRESHOLDS }).ok, true);
  assert.equal(validateThresholds({ ...THRESHOLDS, windGood: 9 }).ok, false); // 가능 > 주의
  assert.equal(validateThresholds({ ...THRESHOLDS, waveCaution: 99 }).ok, false);
  assert.equal(validateThresholds({ ...THRESHOLDS, seaTempMin: "x" }).ok, false);
});

test("푸시 주소는 브라우저 푸시 서버만 허용", () => {
  assert.equal(isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isAllowedEndpoint("https://web.push.apple.com/QGx"), true);
  assert.equal(isAllowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isAllowedEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedEndpoint("https://127.0.0.1/x"), false);
  assert.equal(isAllowedEndpoint("https://evil.example.com/fcm.googleapis.com"), false);
});

test("알림 판단: 특보·판정 변화가 있을 때만", () => {
  const trip = { id: "t1", place: { name: "해운대", lat: 35.16, lng: 129.16 }, date: "2026-10-29", rating: "good" as const };
  assert.equal(decideAlert(trip, { rating: "good", reasons: [] }, [], "내일"), null);
  const changed = decideAlert(trip, { rating: "bad", reasons: ["바람이 강해요"] }, [], "내일");
  assert.ok(changed && changed.body.includes("가능 → 불가"));
  const warned = decideAlert(
    trip,
    { rating: "good", reasons: [] },
    [{ kind: "풍랑주의보", level: "주의보", match: "exact", areas: "부산앞바다" }],
    "내일",
  );
  assert.ok(warned && warned.title.includes("풍랑주의보"));
  // 같은 시·도의 다른 곳 특보만 있으면 푸시하지 않는다
  assert.equal(
    decideAlert(trip, { rating: "good", reasons: [] }, [{ kind: "강풍주의보", level: "주의보", match: "province", areas: "부산" }], "내일"),
    null,
  );
});
