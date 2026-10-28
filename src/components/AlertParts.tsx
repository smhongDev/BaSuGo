"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dayHref } from "@/components/DayParts";
import { fetchForecast, fetchWarnings } from "@/lib/api";
import { addDays, formatKoDate, kstToday } from "@/lib/dates";
import { disablePush, enablePush, pushState, syncPushTrips, type PushState } from "@/lib/pushClient";
import { RATING_LABEL } from "@/lib/score";
import { loadTrips, TRIPS_EVENT } from "@/lib/storage";
import type { Rating, SavedTrip } from "@/lib/types";
import type { WarningsResult } from "@/lib/warnings";

/** 관리자 화면에서 쓴 사이트 공지 (모든 화면 위쪽) */
export function NoticeBanner() {
  const [notice, setNotice] = useState<{ text: string | null; level?: string } | null>(null);
  useEffect(() => {
    fetch("/api/notice")
      .then((r) => r.json())
      .then(setNotice)
      .catch(() => undefined);
  }, []);
  if (!notice?.text) return null;
  return (
    <div className={`notice notice-${notice.level === "warning" ? "warning" : "info"}`} role="status">
      {notice.level === "warning" ? "⚠️ " : "📢 "}
      {notice.text}
    </div>
  );
}

/** 저장한 날짜가 바뀌면 푸시 알림 일정도 맞춘다 (모든 화면에서 동작) */
export function PushSync() {
  useEffect(() => {
    const on = () => void syncPushTrips();
    window.addEventListener(TRIPS_EVENT, on);
    return () => window.removeEventListener(TRIPS_EVENT, on);
  }, []);
  return null;
}

/** 위치의 기상특보 (기상청) */
export function WarningBox({ lat, lng, compact = false }: { lat: number; lng: number; compact?: boolean }) {
  const [w, setW] = useState<WarningsResult | null>(null);
  useEffect(() => {
    let cancelled = false;
    setW(null);
    fetchWarnings(lat, lng)
      .then((r) => !cancelled && setW(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (!w) return null;
  if (!w.available) {
    return compact ? null : <p className="hint">기상특보: {w.message ?? "정보 없음"} 입수 전 기상청 특보를 확인해 주세요.</p>;
  }
  const direct = w.alerts.filter((a) => a.match === "exact");
  const nearby = w.alerts.filter((a) => a.match === "province");
  if (direct.length === 0 && nearby.length === 0) {
    return (
      <p className="warn-none">
        ✅ 현재 {w.region ? `${w.region} 부근에 ` : ""}바다수영과 관련된 기상특보가 없어요.
        <span className="hint-inline"> (기상청 {w.issuedAt ?? ""} 발표)</span>
        {w.regionNote && <span className="hint-inline"> {w.regionNote}</span>}
      </p>
    );
  }
  return (
    <div className={`warn-box${direct.some((a) => a.level !== "예비특보") ? " warn-strong" : ""}`} role="alert">
      <strong>⚠️ 기상특보 {w.region ? `· ${w.region} 부근` : ""}</strong>
      <ul>
        {direct.map((a) => (
          <li key={`${a.kind}-${a.areas}`}>
            <b>{a.kind}</b> — {a.areas}
          </li>
        ))}
        {nearby.map((a) => (
          <li key={`${a.kind}-${a.areas}`} className="muted">
            {a.kind} — 같은 시·도의 다른 지역 ({a.areas})
          </li>
        ))}
      </ul>
      <span className="hint-inline">기상청 {w.issuedAt ?? ""} 발표 · 특보 중에는 입수하지 마세요.</span>
      {w.regionNote && <span className="hint-inline"> {w.regionNote}</span>}
    </div>
  );
}

type Upcoming = { trip: SavedTrip; label: string; rating: Rating | null; reason: string | null; warnings: string[] };

/** 오늘·내일 저장한 일정의 특보와 예보 변화 (사이트 안 알림) */
export function UpcomingAlerts() {
  const [items, setItems] = useState<Upcoming[]>([]);

  useEffect(() => {
    const today = kstToday();
    const tomorrow = addDays(today, 1);
    const trips = loadTrips().filter((t) => t.date === today || t.date === tomorrow);
    if (trips.length === 0) return;
    let cancelled = false;
    Promise.all(
      trips.map(async (trip) => {
        const [f, w] = await Promise.all([
          fetchForecast(trip.place.lat, trip.place.lng, trip.date, 1).catch(() => null),
          fetchWarnings(trip.place.lat, trip.place.lng).catch(() => null),
        ]);
        const day = f?.days[0];
        return {
          trip,
          label: trip.date === today ? "오늘" : "내일",
          rating: day ? day.rating : null,
          reason: day?.reasons[0] ?? null,
          warnings: (w?.alerts ?? []).filter((a) => a.match === "exact").map((a) => a.kind),
        };
      }),
    ).then((r) => !cancelled && setItems(r));
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <section className="panel upcoming" aria-labelledby="upcoming">
      <h2 id="upcoming">🔔 다가오는 바수</h2>
      <ul className="list">
        {items.map((it) => {
          const changed = it.rating && it.trip.rating !== "unknown" && it.rating !== it.trip.rating;
          return (
            <li key={it.trip.id} className={`list-item${it.warnings.length > 0 || changed ? " alert" : ""}`}>
              <Link className="list-main" href={dayHref(it.trip.place, it.trip.date)}>
                <strong>
                  {it.label} · {it.trip.place.name}
                </strong>
                <span>
                  {formatKoDate(it.trip.date)}
                  {it.rating ? ` · 지금 판정 ${RATING_LABEL[it.rating]}` : ""}
                  {changed ? ` (저장할 때 ${RATING_LABEL[it.trip.rating]} → 바뀜)` : ""}
                  {it.reason ? ` · ${it.reason}` : ""}
                </span>
                {it.warnings.length > 0 && <span className="warn-text">⚠️ {it.warnings.join(", ")} 발효 중</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "이 브라우저는 푸시 알림을 지원하지 않아요. 사이트에 들어오면 위의 ‘다가오는 바수’에서 확인할 수 있어요.",
  "ios-needs-install": "아이폰은 Safari 공유 버튼 → ‘홈 화면에 추가’ 한 뒤, 홈 화면의 바수고에서 알림을 켤 수 있어요 (iOS 16.4 이상).",
  denied: "알림이 차단되어 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.",
  off: "저장한 날짜 하루 전·당일에 기상특보가 있거나 예보 판정이 바뀌면 알려 드려요.",
  on: "알림을 받고 있어요. 저장한 날짜 하루 전·당일에 특보나 예보 변화가 있으면 알려 드려요.",
};

/** 푸시 알림 켜기/끄기 */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (state === "on") await disablePush();
      else await enablePush();
      setState(await pushState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "알림 설정에 실패했어요.");
      setState(await pushState().catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  return (
    <div className="push-box">
      <div className="row between wrap">
        <strong>🔔 기상 알림</strong>
        {(state === "on" || state === "off") && (
          <button type="button" className={`btn ${state === "on" ? "btn-ghost" : "btn-accent"}`} onClick={toggle} disabled={busy}>
            {busy ? "설정 중…" : state === "on" ? "알림 끄기" : "알림 받기"}
          </button>
        )}
      </div>
      <p className="hint">{PUSH_TEXT[state]}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
