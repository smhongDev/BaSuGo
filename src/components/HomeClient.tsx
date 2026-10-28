"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapView, KOREA_CENTER } from "@/components/MapView";
import { CalendarGrid, DayCard, dayHref, SourceInfo } from "@/components/DayParts";
import { UpcomingAlerts, WarningBox } from "@/components/AlertParts";
import { fetchForecast, nameForPoint, searchPlaces } from "@/lib/api";
import { addDays, dateRange, kstToday } from "@/lib/dates";
import { recentPlaces, saveTrip } from "@/lib/storage";
import type { DayInfo, ForecastResponse, GeoCandidate, Place } from "@/lib/types";

type View = "none" | "date" | "best" | "two-weeks" | "month";

/** ‘언제갈까?’는 오늘부터 이 기간(이번 주) 안에서 좋은 날을 고른다 */
const BEST_SPAN_DAYS = 7;
const BEST_COUNT = 4;
const RECENT_COUNT = 10;

function monthStart(ym: string): string {
  return `${ym}-01`;
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function HomeClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const today = useMemo(() => kstToday(), []);

  const [place, setPlace] = useState<Place | null>(() => {
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    const name = sp.get("name");
    return name && Number.isFinite(lat) && Number.isFinite(lng) && sp.get("lat") ? { name, lat, lng } : null;
  });
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<GeoCandidate[]>([]);
  const [approximate, setApproximate] = useState(false);
  const [searching, setSearching] = useState(false);
  const [pickedDate, setPickedDate] = useState(today);
  const [recent, setRecent] = useState<Place[]>([]);

  // 이전에 저장한(갔던) 장소 10곳 — localStorage 라서 화면이 뜬 뒤에 읽는다
  useEffect(() => setRecent(recentPlaces(RECENT_COUNT)), []);

  const [view, setView] = useState<View>("none");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: Place, start: string, days: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await fetchForecast(p.lat, p.lng, start, days));
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "정보를 가져오지 못했어요.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 장소가 바뀌면 지난 결과는 지운다
  useEffect(() => {
    setView("none");
    setData(null);
    setError(null);
  }, [place?.lat, place?.lng]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const r = await searchPlaces(q);
      setCandidates(r.candidates);
      setApproximate(r.approximate);
      if (r.candidates.length === 0) setError("검색 결과가 없어요. 해수욕장·항구 이름이나 지역명으로 다시 찾아보세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색에 실패했어요.");
    } finally {
      setSearching(false);
    }
  }

  function choose(c: GeoCandidate) {
    setPlace({ name: c.name, lat: c.lat, lng: c.lng });
    setCandidates([]);
    setApproximate(false);
  }

  async function onMapPick(lat: number, lng: number) {
    const rounded = { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) };
    setPlace({ name: "위치 확인 중…", ...rounded });
    try {
      const { name } = await nameForPoint(rounded.lat, rounded.lng);
      setPlace({ name, ...rounded });
    } catch {
      setPlace({ name: `선택한 위치 (${lat.toFixed(3)}, ${lng.toFixed(3)})`, ...rounded });
    }
  }

  function select(date: string, day?: DayInfo) {
    if (!place) return;
    saveTrip(place, date, day); // 날짜를 고르면 '나의 바수'에 자동 저장
    router.push(dayHref(place, date));
  }

  async function showDate() {
    if (!place) return;
    setView("date");
    await load(place, pickedDate, 1);
    saveTrip(place, pickedDate);
  }
  async function showBest() {
    if (!place) return;
    setView("best");
    await load(place, today, BEST_SPAN_DAYS);
  }
  async function showTwoWeeks() {
    if (!place) return;
    setView("two-weeks");
    await load(place, today, 14);
  }
  async function showMonth(ym: string) {
    if (!place) return;
    setView("month");
    setMonth(ym);
    const start = monthStart(ym) < today ? today : monthStart(ym);
    const last = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
    if (last < today) {
      // 지난 달: 예보가 없으므로 빈 달력만 보여 준다
      setData({ place: { lat: place.lat, lng: place.lng }, days: [], notes: [] });
      return;
    }
    const count = Math.round((Date.parse(last) - Date.parse(start)) / 86400_000) + 1;
    const res = await fetchSafe(place, start, count);
    if (res) {
      // 달 앞쪽 지난 날짜 칸도 채운다
      const before = dateRange(monthStart(ym), Math.max(0, Math.round((Date.parse(start) - Date.parse(monthStart(ym))) / 86400_000)));
      const filler = before.map((d) => pastDay(d));
      setData({ ...res, days: [...filler, ...res.days] });
    }
  }
  async function fetchSafe(p: Place, start: string, days: number) {
    setLoading(true);
    setError(null);
    try {
      return await fetchForecast(p.lat, p.lng, start, days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "정보를 가져오지 못했어요.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  const best = useMemo(() => {
    if (view !== "best" || !data) return [];
    return data.days
      .filter((d) => d.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.date < b.date ? -1 : 1))
      .slice(0, BEST_COUNT);
  }, [view, data]);

  return (
    <div className="stack">
      <UpcomingAlerts />
      <section className="panel" aria-labelledby="where">
        <h2 id="where">① 어디로 갈까요?</h2>
        <form onSubmit={onSearch} className="row">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="해수욕장·항구·지역 이름 (예: 해운대)"
            aria-label="바다수영 갈 지역 검색"
            maxLength={60}
          />
          <button type="submit" className="btn" disabled={searching || !query.trim()}>
            {searching ? "찾는 중…" : "검색"}
          </button>
        </form>

        {recent.length > 0 && candidates.length === 0 && (
          <div className="recent">
            <span className="hint">최근에 간 곳</span>
            <ul className="chips">
              {recent.map((p) => (
                <li key={`${p.lat},${p.lng}`}>
                  <button
                    type="button"
                    className={`chip${place && place.lat === p.lat && place.lng === p.lng ? " on" : ""}`}
                    onClick={() => setPlace(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {candidates.length > 0 && (
          <div className="candidates">
            <p className="hint">
              {approximate
                ? "정확히 일치하는 곳이 없어서 가장 가까운 후보를 찾았어요. 맞는 곳을 골라 주세요."
                : "찾은 곳 중에서 골라 주세요."}
            </p>
            <ul>
              {candidates.map((c) => (
                <li key={`${c.lat},${c.lng}`}>
                  <button type="button" className="candidate" onClick={() => choose(c)}>
                    <strong>{c.name}</strong>
                    <span>{c.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <MapView
          center={place ? [place.lat, place.lng] : KOREA_CENTER}
          zoom={place ? 12 : 7}
          marker={place ? [place.lat, place.lng] : null}
          onPick={onMapPick}
          label="바다수영 위치 지도. 눌러서 위치를 고를 수 있어요."
        />
        <p className="hint">
          {place ? (
            <>
              선택한 곳: <strong>{place.name}</strong> · 지도를 눌러 위치를 바꿀 수 있어요.
            </>
          ) : (
            "검색하거나 지도를 눌러서 바다수영 갈 곳을 골라 주세요."
          )}
        </p>
        {place && place.name !== "위치 확인 중…" && <WarningBox lat={place.lat} lng={place.lng} />}
      </section>

      <section className="panel" aria-labelledby="when">
        <h2 id="when">② 언제 갈까요?</h2>
        <div className="row wrap">
          <label className="date-field">
            <span>날짜</span>
            <input
              type="date"
              value={pickedDate}
              min={today}
              max={addDays(today, 365)}
              onChange={(e) => setPickedDate(e.target.value || today)}
            />
          </label>
          <button type="button" className="btn" disabled={!place || loading} onClick={showDate}>
            이 날짜 보기
          </button>
          <button type="button" className="btn btn-accent" disabled={!place || loading} onClick={showBest}>
            언제갈까?
          </button>
        </div>
        <p className="hint">{place ? "‘언제갈까?’는 오늘부터 일주일 안에서 가장 좋은 날 4일을 골라 드려요." : "먼저 위치를 골라 주세요."}</p>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="hint" role="status">
          물때와 날씨를 불러오는 중…
        </p>
      )}

      {view === "date" && data && data.days[0] && (
        <section className="panel" aria-label="선택한 날짜 정보">
          <h2>선택한 날짜</h2>
          <div className="cards one">
            <DayCard day={data.days[0]} onSelect={(d) => select(d, data.days[0])} />
          </div>
          <p className="hint">카드를 누르면 상세 정보를 볼 수 있어요. 이 날짜는 ‘나의 바수’에 저장됐어요.</p>
          <MoreDays onTwoWeeks={showTwoWeeks} onMonth={() => showMonth(pickedDate.slice(0, 7))} />
        </section>
      )}

      {view === "best" && data && (
        <section className="panel" aria-label="추천 날짜">
          <h2>오늘부터 이번 주에 가장 좋은 날 {BEST_COUNT}일</h2>
          {best.length === 0 ? (
            <p className="hint">예보가 있는 날이 없어요.</p>
          ) : (
            <div className="cards">
              {best.map((d) => (
                <DayCard key={d.date} day={d} onSelect={(date) => select(date, d)} />
              ))}
            </div>
          )}
          <MoreDays onTwoWeeks={showTwoWeeks} onMonth={() => showMonth(today.slice(0, 7))} />
        </section>
      )}

      {view === "two-weeks" && data && (
        <section className="panel" aria-label="2주 달력">
          <div className="row between wrap">
            <h2>2주 달력</h2>
            <button type="button" className="btn btn-ghost" onClick={() => showMonth(today.slice(0, 7))}>
              1달 달력
            </button>
          </div>
          <Legend />
          <p className="hint">달력의 밀물·썰물은 시작 시각이에요. 날짜를 누르면 상세 정보를 볼 수 있어요.</p>
          <CalendarGrid days={data.days} onSelect={(d) => select(d, data.days.find((x) => x.date === d))} disabledBefore={today} />
        </section>
      )}

      {view === "month" && data && (
        <section className="panel" aria-label="1달 달력">
          <div className="row between wrap">
            <div className="month-nav">
              <button
                type="button"
                className="btn btn-icon"
                aria-label="이전 달"
                onClick={() => showMonth(shiftMonth(month, -1))}
                disabled={loading}
              >
                ‹
              </button>
              <h2>
                {month.slice(0, 4)}년 {Number(month.slice(5))}월
              </h2>
              <button
                type="button"
                className="btn btn-icon"
                aria-label="다음 달"
                onClick={() => showMonth(shiftMonth(month, 1))}
                disabled={loading}
              >
                ›
              </button>
            </div>
            <button type="button" className="btn btn-ghost" onClick={showTwoWeeks}>
              2주 달력
            </button>
          </div>
          <Legend />
          <div className="cal-wrap">
            <button
              type="button"
              className="cal-side"
              aria-label="이전 달"
              onClick={() => showMonth(shiftMonth(month, -1))}
              disabled={loading}
            >
              ‹
            </button>
            <CalendarGrid
              days={data.days.length > 0 ? data.days : emptyMonth(month)}
              month={month}
              onSelect={(d) => select(d, data.days.find((x) => x.date === d))}
              disabledBefore={today}
            />
            <button
              type="button"
              className="cal-side"
              aria-label="다음 달"
              onClick={() => showMonth(shiftMonth(month, 1))}
              disabled={loading}
            >
              ›
            </button>
          </div>
          <p className="hint">
            오늘부터 약 16일 뒤까지만 날씨 예보가 있어요. 그 뒤는 ‘예보 없음’이고 물때·일출·일몰만 보여요. 달력의 밀물·썰물은 시작
            시각이에요.
          </p>
        </section>
      )}

      {data && view !== "none" && <SourceInfo data={data} />}

      {data && data.notes.length > 0 && (
        <ul className="notes">
          {data.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MoreDays({ onTwoWeeks, onMonth }: { onTwoWeeks: () => void; onMonth: () => void }) {
  return (
    <div className="row wrap more-days">
      <span className="hint">더 많은 날 보기</span>
      <button type="button" className="btn btn-ghost" onClick={onTwoWeeks}>
        📅 2주 달력
      </button>
      <button type="button" className="btn btn-ghost" onClick={onMonth}>
        🗓️ 1달 달력
      </button>
    </div>
  );
}

function Legend() {
  return (
    <p className="legend" aria-label="범례">
      <span className="dot dot-good" /> 가능 <span className="dot dot-caution" /> 주의 <span className="dot dot-bad" /> 불가{" "}
      <span className="dot dot-unknown" /> 예보 없음
    </p>
  );
}

function pastDay(date: string): DayInfo {
  return {
    date,
    forecastAvailable: false,
    weatherCode: null,
    weatherText: "",
    weatherIcon: "",
    tMax: null,
    tMin: null,
    windMax: null,
    waveMax: null,
    seaTemp: null,
    precipSum: null,
    tides: [],
    flows: [],
    lunarDay: 0,
    mulddae: "",
    sunrise: "",
    sunset: "",
    rating: "unknown",
    score: null,
    reasons: [],
  };
}

function emptyMonth(ym: string): DayInfo[] {
  return dateRange(monthStart(ym), daysInMonth(ym)).map(pastDay);
}
