"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MapView, KOREA_CENTER } from "@/components/MapView";
import { RatingBadge, dayHref } from "@/components/DayParts";
import { PushToggle, UpcomingAlerts } from "@/components/AlertParts";
import { DEFAULT_WEIGHT_KG, swimCalories } from "@/lib/calories";
import { formatKoDate } from "@/lib/dates";
import { analyzeTrack, parseGpxText } from "@/lib/gpx";
import {
  addRecord,
  clearTrips,
  deleteRecords,
  deleteTrips,
  loadRecords,
  loadTrips,
  loadWeight,
  saveWeight,
} from "@/lib/storage";
import type { SavedTrip, SwimRecord } from "@/lib/types";

const MAX_GPX_BYTES = 20 * 1024 * 1024;

function fmtDuration(min: number | null): string {
  if (min === null) return "시간 정보 없음";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function MyClient() {
  const [ready, setReady] = useState(false);
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [records, setRecords] = useState<SwimRecord[]>([]);
  const [weight, setWeight] = useState(DEFAULT_WEIGHT_KG);
  const [pickedTrips, setPickedTrips] = useState<Set<string>>(new Set());
  const [pickedRecords, setPickedRecords] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [gpxNotice, setGpxNotice] = useState<string | null>(null);

  useEffect(() => {
    setTrips(loadTrips());
    const recs = loadRecords();
    setRecords(recs);
    setActive(recs[0]?.id ?? null);
    setWeight(loadWeight());
    setReady(true);
  }, []);

  const activeRecord = records.find((r) => r.id === active) ?? null;
  const linked = useMemo(
    () => (activeRecord?.date ? trips.filter((t) => t.date === activeRecord.date) : []),
    [activeRecord, trips],
  );

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function removeTrips() {
    deleteTrips([...pickedTrips]);
    setTrips(loadTrips());
    setPickedTrips(new Set());
  }
  function removeAllTrips() {
    clearTrips();
    setTrips([]);
    setPickedTrips(new Set());
    setConfirmAll(false);
  }
  function removeRecords() {
    deleteRecords([...pickedRecords]);
    const next = loadRecords();
    setRecords(next);
    setPickedRecords(new Set());
    if (!next.some((r) => r.id === active)) setActive(next[0]?.id ?? null);
  }

  async function onGpx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setGpxError(null);
    setGpxNotice(null);
    if (!/\.gpx$/i.test(file.name)) {
      setGpxError("GPX 파일(.gpx)만 올릴 수 있어요.");
      return;
    }
    if (file.size > MAX_GPX_BYTES) {
      setGpxError("파일이 너무 커요. 20MB 이하만 올릴 수 있어요.");
      return;
    }
    try {
      const stats = analyzeTrack(parseGpxText(await file.text()));
      const rec: SwimRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.gpx$/i, ""),
        date: stats.date,
        distanceKm: stats.distanceKm,
        durationMin: stats.durationMin,
        points: stats.points,
        addedAt: new Date().toISOString(),
      };
      addRecord(rec);
      setRecords(loadRecords());
      setActive(rec.id);
      if (stats.removedJumps > 0) setGpxNotice(`GPS가 튄 점 ${stats.removedJumps}개는 거리 계산에서 뺐어요.`);
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : "GPX 파일을 읽지 못했어요.");
    }
  }

  function onWeight(v: string) {
    const kg = Number(v);
    setWeight(Number.isFinite(kg) ? kg : DEFAULT_WEIGHT_KG);
    if (Number.isFinite(kg) && kg >= 20 && kg <= 300) saveWeight(kg);
  }

  const weightOk = weight >= 20 && weight <= 300;
  const kcalOf = (r: SwimRecord) => (weightOk ? swimCalories(weight, r.distanceKm, r.durationMin) : 0);

  if (!ready) return <p className="hint">불러오는 중…</p>;

  return (
    <div className="stack">
      <section className="panel guide" aria-labelledby="guide">
        <h2 id="guide">ℹ️ 나의 바수는 이렇게 저장돼요</h2>
        <p>회원가입 없이 쓸 수 있어요. 고른 날짜와 수영 기록은 <strong>지금 쓰고 있는 기기의 브라우저 안</strong>에 저장돼요.</p>
        <ul>
          <li>
            저장한 정보를 다시 보려면 <strong>같은 기기, 같은 브라우저</strong>(예: 휴대폰 크롬)로 들어와야 해요. 다른 기기나 다른
            브라우저에서는 보이지 않아요.
          </li>
          <li>브라우저의 방문 기록·쿠키·사이트 데이터를 지우면 저장한 정보도 함께 지워져요.</li>
          <li>시크릿(사생활 보호) 모드에서는 창을 닫으면 사라져요.</li>
          <li>저장 내용은 서버로 보내지 않아요. (알림을 켜면 알림에 필요한 다가올 일정만 익명으로 보내요.)</li>
        </ul>
        <PushToggle />
      </section>

      <UpcomingAlerts />

      <section className="panel" aria-labelledby="saved">
        <div className="row between wrap">
          <h2 id="saved">저장한 날짜</h2>
          <div className="row wrap">
            <button type="button" className="btn btn-ghost" disabled={pickedTrips.size === 0} onClick={removeTrips}>
              선택 삭제 ({pickedTrips.size})
            </button>
            {confirmAll ? (
              <>
                <button type="button" className="btn btn-danger" onClick={removeAllTrips}>
                  정말 전체 삭제
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmAll(false)}>
                  취소
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost" disabled={trips.length === 0} onClick={() => setConfirmAll(true)}>
                전체 삭제
              </button>
            )}
          </div>
        </div>
        {trips.length === 0 ? (
          <p className="hint">
            아직 저장한 날짜가 없어요. <Link href="/">처음 화면</Link>에서 날짜를 고르면 자동으로 저장돼요.
          </p>
        ) : (
          <ul className="list">
            {trips.map((t) => (
              <li key={t.id} className="list-item">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={pickedTrips.has(t.id)}
                    onChange={() => toggle(pickedTrips, t.id, setPickedTrips)}
                    aria-label={`${t.place.name} ${formatKoDate(t.date)} 선택`}
                  />
                </label>
                <Link className="list-main" href={dayHref(t.place, t.date)}>
                  <strong>{t.place.name}</strong>
                  <span>
                    {formatKoDate(t.date)} {t.weatherIcon} {t.weatherText}
                    {t.windMax !== null ? ` · 풍속 ${t.windMax.toFixed(1)}m/s` : ""}
                  </span>
                </Link>
                <RatingBadge rating={t.rating} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="gpx">
        <h2 id="gpx">수영 기록 (GPX)</h2>
        <div className="row wrap">
          <label className="date-field">
            <span>체중(kg) — 칼로리 계산에 써요</span>
            <input
              type="number"
              inputMode="decimal"
              min={20}
              max={300}
              step={0.5}
              value={weight}
              onChange={(e) => onWeight(e.target.value)}
            />
          </label>
          <label className="btn btn-accent file-btn">
            GPX 파일 올리기
            <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={onGpx} hidden />
          </label>
        </div>
        {!weightOk && <p className="error">체중은 20~300kg 사이로 입력해 주세요.</p>}
        {gpxError && (
          <p className="error" role="alert">
            {gpxError}
          </p>
        )}
        {gpxNotice && <p className="hint">{gpxNotice}</p>}
        <p className="hint">파일은 서버로 보내지 않고 이 기기 안에서만 읽어요.</p>

        <MapView
          center={activeRecord?.points[0] ?? KOREA_CENTER}
          zoom={activeRecord ? 14 : 7}
          track={activeRecord?.points}
          height={300}
          label="수영 경로 지도"
        />

        {activeRecord && (
          <>
            <h3>{activeRecord.name}</h3>
            <dl className="facts big">
              <div>
                <dt>수영 거리</dt>
                <dd>{activeRecord.distanceKm.toFixed(2)}km</dd>
              </div>
              <div>
                <dt>시간</dt>
                <dd>{fmtDuration(activeRecord.durationMin)}</dd>
              </div>
              <div>
                <dt>소모 칼로리</dt>
                <dd>{Math.round(kcalOf(activeRecord))}kcal</dd>
              </div>
            </dl>
            {activeRecord.durationMin === null && (
              <p className="hint">GPX에 시간이 없어서 평균 2km/h로 가정해 칼로리를 계산했어요.</p>
            )}
            {linked.length > 0 && (
              <p className="hint">
                같은 날 저장한 바수: {linked.map((t) => t.place.name).join(", ")} ({formatKoDate(linked[0].date)})
              </p>
            )}
          </>
        )}

        {records.length > 0 && (
          <>
            <div className="row between wrap">
              <h3>올린 기록</h3>
              <button type="button" className="btn btn-ghost" disabled={pickedRecords.size === 0} onClick={removeRecords}>
                선택 삭제 ({pickedRecords.size})
              </button>
            </div>
            <ul className="list">
              {records.map((r) => (
                <li key={r.id} className={`list-item${r.id === active ? " active" : ""}`}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pickedRecords.has(r.id)}
                      onChange={() => toggle(pickedRecords, r.id, setPickedRecords)}
                      aria-label={`${r.name} 선택`}
                    />
                  </label>
                  <button type="button" className="list-main as-button" onClick={() => setActive(r.id)}>
                    <strong>{r.name}</strong>
                    <span>
                      {r.date ? formatKoDate(r.date) : "날짜 없음"} · {r.distanceKm.toFixed(2)}km · {Math.round(kcalOf(r))}kcal
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
