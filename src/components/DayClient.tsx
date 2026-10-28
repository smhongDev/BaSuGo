"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MapView } from "@/components/MapView";
import { RatingBadge, SourceInfo, WhyRating } from "@/components/DayParts";
import { WarningBox } from "@/components/AlertParts";
import { fetchForecast } from "@/lib/api";
import { addDays, formatKoDate, kstToday } from "@/lib/dates";
import { saveTrip } from "@/lib/storage";
import { hhmm } from "@/lib/tides";
import type { DayInfo, ForecastResponse, Place } from "@/lib/types";

const num = (v: number | null, unit: string, digits = 1) => (v === null ? "–" : `${v.toFixed(digits)}${unit}`);

export function DayClient() {
  const sp = useSearchParams();
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const date = sp.get("date") ?? "";
  const name = sp.get("name") ?? "선택한 위치";
  const valid = sp.get("lat") !== null && Number.isFinite(lat) && Number.isFinite(lng) && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const place: Place = useMemo(() => ({ name, lat, lng }), [name, lat, lng]);

  const [day, setDay] = useState<DayInfo | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sources, setSources] = useState<Pick<ForecastResponse, "sources" | "fallbacks" | "water">>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setDay(null);
    setError(null);
    fetchForecast(lat, lng, date, 1)
      .then((r) => {
        if (cancelled) return;
        setDay(r.days[0]);
        setNotes(r.notes);
        setSources({ sources: r.sources, fallbacks: r.fallbacks, water: r.water });
        saveTrip(place, date, r.days[0]); // 상세를 열면 저장되어 있도록 보장
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "정보를 가져오지 못했어요."));
    return () => {
      cancelled = true;
    };
  }, [valid, lat, lng, date, place]);

  if (!valid) {
    return (
      <div className="panel">
        <p className="error">위치나 날짜 정보가 없어요. 처음 화면에서 다시 골라 주세요.</p>
        <Link className="btn" href="/">
          처음으로
        </Link>
      </div>
    );
  }

  const today = kstToday();
  const homeQuery = new URLSearchParams({ lat: String(lat), lng: String(lng), name }).toString();

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h2 className="detail-title">{name}</h2>
          <p className="sub">{formatKoDate(date)}</p>
        </div>
        <Link className="btn btn-ghost" href={`/?${homeQuery}`}>
          ← 다른 날짜 고르기
        </Link>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!day && !error && (
        <p className="hint" role="status">
          불러오는 중…
        </p>
      )}

      <MapView center={[lat, lng]} marker={[lat, lng]} zoom={13} height={260} label={`${name} 위치 지도`} />

      {date >= today && date <= addDays(today, 2) && <WarningBox lat={lat} lng={lng} />}

      {day && (
        <>
          <section className="panel" aria-label="바수 판단">
            <div className="row between">
              <h2>
                {day.weatherIcon} {day.weatherText}
              </h2>
              <RatingBadge rating={day.rating} />
            </div>
            {day.rating === "caution" || day.rating === "bad" ? (
              <WhyRating day={day} />
            ) : (
              <ul className="reasons">
                {day.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <dl className="facts big">
              <div>
                <dt>기온</dt>
                <dd>{day.tMax !== null && day.tMin !== null ? `${Math.round(day.tMin)}~${Math.round(day.tMax)}℃` : "–"}</dd>
              </div>
              {!day.inland && (
                <div>
                  <dt>수온</dt>
                  <dd>{num(day.seaTemp, "℃")}</dd>
                </div>
              )}
              <div>
                <dt>풍속(최대)</dt>
                <dd>{num(day.windMax, "m/s")}</dd>
              </div>
              {!day.inland && (
                <div>
                  <dt>파고(최대)</dt>
                  <dd>{num(day.waveMax, "m")}</dd>
                </div>
              )}
              <div>
                <dt>강수량</dt>
                <dd>{num(day.precipSum, "mm")}</dd>
              </div>
              {!day.inland && (
                <div>
                  <dt>물때</dt>
                  <dd>{day.mulddae}</dd>
                </div>
              )}
            </dl>
          </section>

          {!day.inland && (
            <section className="panel" aria-label="물때">
              <h2>만조 · 간조 · 밀물 · 썰물</h2>
              {day.tides.length === 0 ? (
                <p className="hint">이 위치는 물때 정보를 받지 못했어요. (바다에서 너무 멀거나 예보 기간 밖일 수 있어요.)</p>
              ) : (
                <>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>구분</th>
                        <th>시각</th>
                        <th>높이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.tides.map((t) => (
                        <tr key={t.time}>
                          <td>{t.type === "high" ? "만조 ▲" : "간조 ▼"}</td>
                          <td>{hhmm(t.time)}</td>
                          <td>{t.height.toFixed(2)}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="flows">
                    {day.flows.map((f) => (
                      <li key={f.from}>
                        {f.kind === "flood" ? "밀물 (물이 들어옴)" : "썰물 (물이 빠짐)"}: {flowTime(f.from, date)} →{" "}
                        {flowTime(f.to, date)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <section className="panel" aria-label="일출 일몰">
            <h2>일출 · 일몰</h2>
            <dl className="facts big">
              <div>
                <dt>일출</dt>
                <dd>🌅 {day.sunrise}</dd>
              </div>
              <div>
                <dt>일몰</dt>
                <dd>🌇 {day.sunset}</dd>
              </div>
            </dl>
          </section>

          <SourceInfo data={sources} />

          <p className="hint">
            ‘나의 바수’에 저장되어 있어요. {date < today ? "지난 날짜라 예보는 없어요." : ""}{" "}
            <Link href="/my">나의 바수 보기</Link>
          </p>
          <ul className="notes">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 다른 날짜의 시각은 '(내일) 03:18'처럼 날짜 표시를 붙인다. */
function flowTime(local: string, date: string): string {
  const day = local.slice(0, 10);
  if (day === date) return hhmm(local);
  if (day === addDays(date, 1)) return `다음날 ${hhmm(local)}`;
  if (day === addDays(date, -1)) return `전날 ${hhmm(local)}`;
  return `${day.slice(5)} ${hhmm(local)}`;
}
