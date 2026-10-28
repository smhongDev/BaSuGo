import { RATING_LABEL } from "@/lib/score";
import { formatKoDate, weekday } from "@/lib/dates";
import { hhmm } from "@/lib/tides";
import type { DayInfo, ForecastResponse, Place, Rating, TideFlow } from "@/lib/types";

export function dayHref(place: Place, date: string): string {
  const q = new URLSearchParams({ lat: String(place.lat), lng: String(place.lng), name: place.name, date });
  return `/day?${q.toString()}`;
}

export function RatingBadge({ rating }: { rating: Rating }) {
  return <span className={`badge badge-${rating}`}>{RATING_LABEL[rating]}</span>;
}

/** 그날과 겹치는 밀물·썰물 구간. 전날·다음날에 걸치면 그쪽 시각은 비워 둔다 ("~09:41", "22:01~") */
export function flowRanges(day: DayInfo, kind: TideFlow["kind"]): string[] {
  const t = (local: string) => (local.startsWith(day.date) ? hhmm(local) : "");
  return day.flows.filter((f) => f.kind === kind).map((f) => `${t(f.from)}~${t(f.to)}`);
}

/** 그날 시작하는 밀물·썰물 시각 (달력 칸처럼 좁은 곳에서 쓴다) */
function flowStarts(day: DayInfo, kind: TideFlow["kind"]): string[] {
  return day.flows.filter((f) => f.kind === kind && f.from.startsWith(day.date)).map((f) => hhmm(f.from));
}

const temp = (day: DayInfo) =>
  day.tMax !== null && day.tMin !== null ? `${Math.round(day.tMin)}~${Math.round(day.tMax)}℃` : null;
const wind = (day: DayInfo) => (day.windMax !== null ? `${day.windMax.toFixed(1)}m/s` : null);

const hasWhy = (day: DayInfo) => day.rating === "caution" || day.rating === "bad";

/** 주의·불가일 때 왜 그런지 */
export function WhyRating({ day, compact = false }: { day: DayInfo; compact?: boolean }) {
  if (!hasWhy(day)) return null;
  if (compact) {
    const tags = day.reasonTags ?? [];
    return tags.length > 0 ? <span className={`cal-why why-${day.rating}`}>⚠ {tags.join(" · ")}</span> : null;
  }
  return (
    <div className={`why why-${day.rating}`}>
      <strong>왜 {RATING_LABEL[day.rating]}인가요?</strong>
      <ul>
        {day.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

export function DayCard({ day, onSelect }: { day: DayInfo; onSelect: (date: string) => void }) {
  const highs = day.tides.filter((t) => t.type === "high").map((t) => hhmm(t.time));
  const flood = flowRanges(day, "flood");
  const ebb = flowRanges(day, "ebb");
  return (
    <button type="button" className={`daycard rating-${day.rating}`} onClick={() => onSelect(day.date)}>
      <div className="daycard-head">
        <strong>{formatKoDate(day.date)}</strong>
        <RatingBadge rating={day.rating} />
      </div>
      <div className="daycard-weather">
        <span className="big-icon" aria-hidden>
          {day.weatherIcon}
        </span>
        <span>{day.weatherText}</span>
      </div>
      <WhyRating day={day} />
      <dl className="facts">
        <div>
          <dt>기온</dt>
          <dd>{temp(day) ?? "–"}</dd>
        </div>
        <div>
          <dt>풍속</dt>
          <dd>{wind(day) ?? "–"}</dd>
        </div>
        <div>
          <dt>물때</dt>
          <dd>{day.mulddae}</dd>
        </div>
      </dl>
      <dl className="tide-list">
        <div>
          <dt>🌊 만조</dt>
          <dd>{highs.length > 0 ? highs.join(" · ") : "정보 없음"}</dd>
        </div>
        {flood.length > 0 && (
          <div>
            <dt>↗ 밀물</dt>
            <dd>{flood.join(" · ")}</dd>
          </div>
        )}
        {ebb.length > 0 && (
          <div>
            <dt>↘ 썰물</dt>
            <dd>{ebb.join(" · ")}</dd>
          </div>
        )}
        <div>
          <dt>🌅 일출</dt>
          <dd>
            {day.sunrise} <span className="muted">· 🌇 일몰 {day.sunset}</span>
          </dd>
        </div>
      </dl>
    </button>
  );
}

/** 정보마다 어느 지역 기준인지, 가까운 지역 정보를 대신 쓰면 그 안내 */
export function SourceInfo({ data }: { data: Pick<ForecastResponse, "sources" | "fallbacks"> }) {
  if (!data.sources) return null;
  const fb = data.fallbacks ?? [];
  return (
    <div className={`source-info${fb.length > 0 ? " fallback" : ""}`}>
      {fb.map((f) => (
        <p key={f}>ℹ️ {f}</p>
      ))}
      <p className="hint-inline">
        📍 정보 기준 — 날씨: {data.sources.weather} · 파도·수온: {data.sources.sea} · 만조·간조: {data.sources.tide}
      </p>
    </div>
  );
}

/** 달력 칸 (2주·1달 공용). 넓은 화면은 7칸 달력, 좁은 화면은 날짜별 목록으로 보인다. */
export function CalendarGrid({
  days,
  onSelect,
  disabledBefore,
  month,
}: {
  days: DayInfo[];
  onSelect: (date: string) => void;
  /** 이 날짜보다 이전 칸은 누를 수 없다 */
  disabledBefore: string;
  /** 1달 보기에서 해당 월(YYYY-MM)만 그린다 */
  month?: string;
}) {
  const shown = month ? days.filter((d) => d.date.startsWith(month)) : days;
  const pad = shown.length > 0 ? weekday(shown[0].date) : 0;
  return (
    <div className="calendar" role="grid" aria-label="바수 달력">
      {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
        <div key={w} className={`cal-dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} role="columnheader">
          {w}
        </div>
      ))}
      {Array.from({ length: pad }, (_, i) => (
        <div key={`pad-${i}`} className="cal-pad" aria-hidden />
      ))}
      {shown.map((d) => {
        const past = d.date < disabledBefore;
        const wd = weekday(d.date);
        const highs = d.tides.filter((t) => t.type === "high").map((t) => hhmm(t.time));
        const flood = flowStarts(d, "flood");
        const ebb = flowStarts(d, "ebb");
        const tw = [temp(d), d.windMax !== null ? `${d.windMax.toFixed(0)}m/s` : null].filter(Boolean).join(" · ");
        return (
          <button
            key={d.date}
            type="button"
            role="gridcell"
            disabled={past}
            className={`cal-cell rating-${d.rating}`}
            onClick={() => onSelect(d.date)}
            aria-label={`${formatKoDate(d.date)} ${RATING_LABEL[d.rating]}`}
          >
            <span className="cal-top">
              <span className={`cal-date${wd === 0 ? " sun" : wd === 6 ? " sat" : ""}`}>
                {Number(d.date.slice(8))}
                <small className="cal-wd">{"일월화수목금토"[wd]}</small>
              </span>
              <span className="cal-icon" aria-hidden>
                {past ? "" : d.weatherIcon}
              </span>
              <span className={`cal-dot dot-${d.rating}`} aria-hidden />
            </span>
            {!past && (
              <span className="cal-info">
                {d.forecastAvailable && <span className="cal-weather">{d.weatherText}</span>}
                <WhyRating day={d} compact />
                {tw && <span>{tw}</span>}
                {highs.length > 0 && <span>만조 {highs.join(" ")}</span>}
                {flood.length > 0 && <span>밀물 {flood.join(" ")}</span>}
                {ebb.length > 0 && <span>썰물 {ebb.join(" ")}</span>}
                <span>일출 {d.sunrise}</span>
                <span>일몰 {d.sunset}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
