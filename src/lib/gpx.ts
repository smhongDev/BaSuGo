export type TrackPoint = { lat: number; lng: number; t: number | null };

export type TrackStats = {
  distanceKm: number;
  durationMin: number | null;
  /** 지도에 그릴 점 (최대 maxPoints개) */
  points: [number, number][];
  /** 첫 점의 한국 날짜 */
  date: string | null;
  removedJumps: number;
};

const R_KM = 6371.0088;
/** 수영 중 GPS가 튀는 점을 걸러내는 기준 */
const MAX_SPEED_KMH = 20;
const MAX_JUMP_KM_NO_TIME = 0.3;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function analyzeTrack(raw: TrackPoint[], maxPoints = 600): TrackStats {
  const kept: TrackPoint[] = [];
  let removedJumps = 0;
  let distanceKm = 0;
  for (const p of raw) {
    const prev = kept[kept.length - 1];
    if (!prev) {
      kept.push(p);
      continue;
    }
    const d = haversineKm(prev, p);
    let jump = false;
    if (p.t !== null && prev.t !== null && p.t > prev.t) {
      jump = d / ((p.t - prev.t) / 3600_000) > MAX_SPEED_KMH;
    } else {
      jump = d > MAX_JUMP_KM_NO_TIME;
    }
    if (jump) {
      removedJumps++;
      continue;
    }
    distanceKm += d;
    kept.push(p);
  }

  const times = kept.map((p) => p.t).filter((t): t is number => t !== null);
  const durationMin = times.length >= 2 ? (times[times.length - 1] - times[0]) / 60_000 : null;
  const step = Math.max(1, Math.ceil(kept.length / maxPoints));
  const points: [number, number][] = [];
  for (let i = 0; i < kept.length; i += step) points.push([kept[i].lat, kept[i].lng]);
  const last = kept[kept.length - 1];
  if (last && (points.length === 0 || points[points.length - 1][0] !== last.lat)) {
    points.push([last.lat, last.lng]);
  }
  return {
    distanceKm,
    durationMin: durationMin !== null && durationMin > 0 ? durationMin : null,
    points,
    date: times.length > 0 ? kstDate(times[0]) : null,
    removedJumps,
  };
}

/** 브라우저(DOMParser)에서 GPX 텍스트를 점 목록으로 바꾼다. */
export function parseGpxText(text: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("GPX 파일을 읽을 수 없습니다. 올바른 .gpx 파일인지 확인해 주세요.");
  }
  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (nodes.length === 0) nodes = Array.from(doc.getElementsByTagName("rtept"));
  const out: TrackPoint[] = [];
  for (const n of nodes) {
    const lat = Number(n.getAttribute("lat"));
    const lng = Number(n.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const timeText = n.getElementsByTagName("time")[0]?.textContent?.trim();
    const t = timeText ? Date.parse(timeText) : NaN;
    out.push({ lat, lng, t: Number.isFinite(t) ? t : null });
  }
  if (out.length < 2) throw new Error("GPX에 경로 점이 2개 이상 있어야 합니다.");
  return out;
}
