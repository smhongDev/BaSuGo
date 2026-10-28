import { RATING_LABEL } from "@/lib/score";
import { formatKoDate, weekday } from "@/lib/dates";
import { hhmm } from "@/lib/tides";
import type { DayInfo, Place, Rating } from "@/lib/types";

export function dayHref(place: Place, date: string): string {
  const q = new URLSearchParams({ lat: String(place.lat), lng: String(place.lng), name: place.name, date });
  return `/day?${q.toString()}`;
}

export function RatingBadge({ rating }: { rating: Rating }) {
  return <span className={`badge badge-${rating}`}>{RATING_LABEL[rating]}</span>;
}

export function tideSummary(day: DayInfo): string {
  const highs = day.tides.filter((t) => t.type === "high").map((t) => hhmm(t.time));
  return highs.length > 0 ? `만조 ${highs.join(" · ")}` : "";
}

export function DayCard({ day, onSelect }: { day: DayInfo; onSelect: (date: string) => void }) {
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
      <dl className="facts">
        <div>
          <dt>기온</dt>
          <dd>{day.tMax !== null && day.tMin !== null ? `${Math.round(day.tMin)}~${Math.round(day.tMax)}℃` : "–"}</dd>
        </div>
        <div>
          <dt>풍속</dt>
          <dd>{day.windMax !== null ? `${day.windMax.toFixed(1)}m/s` : "–"}</dd>
        </div>
        <div>
          <dt>물때</dt>
          <dd>{day.mulddae}</dd>
        </div>
      </dl>
      {tideSummary(day) && <p className="tide-line">🌊 {tideSummary(day)}</p>}
    </button>
  );
}

/** 달력 칸 (2주·1달 공용) */
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
            <span className="cal-date">{Number(d.date.slice(8))}</span>
            <span className="cal-icon" aria-hidden>
              {past ? "" : d.weatherIcon}
            </span>
            <span className="cal-sub">{past ? "" : d.windMax !== null ? `${d.windMax.toFixed(0)}m/s` : ""}</span>
            <span className={`cal-dot dot-${d.rating}`} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
