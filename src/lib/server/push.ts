import { createHash } from "node:crypto";
import webpush from "web-push";
import { addDays, formatKoDate, kstToday } from "../dates.ts";
import { getForecast } from "../forecast.ts";
import { RATING_LABEL } from "../score.ts";
import { getWarnings, type WeatherAlert } from "../warnings.ts";
import type { Place, Rating } from "../types.ts";
import { readJson, updateJson, writeJson } from "./state.ts";

/** 알림 대상 일정 (브라우저의 '나의 바수'에서 앞으로 다가올 날짜만 보낸다) */
export type TrackedTrip = { id: string; place: Place; date: string; rating: Rating };

export type Subscription = {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  trips: TrackedTrip[];
  createdAt: string;
  updatedAt: string;
  /** 일정별로 마지막에 보낸 알림 내용 (같은 내용은 다시 보내지 않는다) */
  sent: Record<string, string>;
};

type Store = { subs: Subscription[] };
export type AlertLogEntry = { at: string; sub: string; trip: string; title: string; body: string; result: string };

const SUBS = "subscriptions.json";
const LOG = "alert-log.json";
const VAPID = "vapid.json";
const MAX_SUBS = 5000;
const MAX_TRIPS = 30;

/** 브라우저 푸시 서버만 허용한다 (서버가 이 주소로 요청을 보내므로 아무 주소나 받으면 안 된다). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && endpoint.length <= 1000 && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const subId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 16);

let vapidReady: Promise<{ publicKey: string; privateKey: string }> | null = null;

/** VAPID 키: 환경변수가 있으면 쓰고, 없으면 처음 한 번 만들어 상태 폴더에 둔다. */
export function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  vapidReady ??= (async () => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    let keys = pub && priv ? { publicKey: pub, privateKey: priv } : await readJson<{ publicKey: string; privateKey: string } | null>(VAPID, null);
    if (!keys) {
      keys = webpush.generateVAPIDKeys();
      await writeJson(VAPID, keys);
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://basugo.myfinder.co.kr", keys.publicKey, keys.privateKey);
    return keys;
  })().catch((e) => {
    vapidReady = null;
    throw e;
  });
  return vapidReady;
}

function cleanTrips(input: unknown): TrackedTrip[] {
  if (!Array.isArray(input)) return [];
  const today = kstToday();
  const out: TrackedTrip[] = [];
  for (const t of input.slice(0, 200)) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const p = (r.place ?? {}) as Record<string, unknown>;
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const date = String(r.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const rating = (["good", "caution", "bad", "unknown"] as const).find((x) => x === r.rating) ?? "unknown";
    out.push({ id: String(r.id ?? "").slice(0, 80), place: { name: String(p.name ?? "").slice(0, 80), lat, lng }, date, rating });
    if (out.length >= MAX_TRIPS) break;
  }
  return out;
}

export async function saveSubscription(sub: unknown, trips: unknown): Promise<{ ok: boolean; error?: string; tracked?: number }> {
  const s = (sub ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = String(s.endpoint ?? "");
  const p256dh = String(s.keys?.p256dh ?? "");
  const auth = String(s.keys?.auth ?? "");
  if (!isAllowedEndpoint(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    return { ok: false, error: "알림 구독 정보가 올바르지 않아요." };
  }
  const clean = cleanTrips(trips);
  const id = subId(endpoint);
  const now = new Date().toISOString();
  let full = false;
  await updateJson<Store>(SUBS, { subs: [] }, (store) => {
    const prev = store.subs.find((x) => x.id === id);
    if (!prev && store.subs.length >= MAX_SUBS) {
      full = true;
      return store;
    }
    const others = store.subs.filter((x) => x.id !== id);
    const keep = new Set(clean.map((t) => t.id));
    const sent = Object.fromEntries(Object.entries(prev?.sent ?? {}).filter(([k]) => keep.has(k)));
    others.push({ id, endpoint, keys: { p256dh, auth }, trips: clean, createdAt: prev?.createdAt ?? now, updatedAt: now, sent });
    return { subs: others };
  });
  return full ? { ok: false, error: "알림 신청이 너무 많아요. 나중에 다시 시도해 주세요." } : { ok: true, tracked: clean.length };
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const id = subId(endpoint);
  await updateJson<Store>(SUBS, { subs: [] }, (store) => ({ subs: store.subs.filter((x) => x.id !== id) }));
}

export async function pushStats() {
  const store = await readJson<Store>(SUBS, { subs: [] });
  const today = kstToday();
  const upcoming = store.subs.reduce((n, s) => n + s.trips.filter((t) => t.date >= today).length, 0);
  const log = await readJson<AlertLogEntry[]>(LOG, []);
  return { subscribers: store.subs.length, upcomingTrips: upcoming, log: log.slice(0, 50) };
}

const RANK: Record<Rating, number> = { good: 0, caution: 1, bad: 2, unknown: -1 };

/** 알림을 보낼지와 내용. 특보(직접 해당)가 있거나, 저장할 때와 판정이 달라졌을 때만 보낸다. */
export function decideAlert(
  trip: TrackedTrip,
  now: { rating: Rating; reasons: string[] },
  alerts: WeatherAlert[],
  dayLabel: string,
): { signature: string; title: string; body: string } | null {
  const direct = alerts.filter((a) => a.match === "exact");
  const changed = trip.rating !== "unknown" && now.rating !== "unknown" && now.rating !== trip.rating;
  if (direct.length === 0 && !changed) return null;

  const signature = `${now.rating}|${direct.map((a) => a.kind).sort().join(",")}`;
  const place = trip.place.name || "저장한 장소";
  const title = direct.length > 0 ? `⚠️ ${dayLabel} 바수: ${direct[0].kind}` : `${dayLabel} 바수 예보가 바뀌었어요`;
  const parts: string[] = [];
  if (direct.length > 0) parts.push(`${direct.map((a) => a.kind).join(", ")} 발효 (${direct[0].areas})`);
  if (changed) {
    const worse = RANK[now.rating] > RANK[trip.rating];
    parts.push(`${RATING_LABEL[trip.rating]} → ${RATING_LABEL[now.rating]}${worse ? " (나빠짐)" : " (좋아짐)"}`);
  } else {
    parts.push(`지금 판정: ${RATING_LABEL[now.rating]}`);
  }
  if (now.reasons[0]) parts.push(now.reasons[0]);
  return { signature, title, body: `${place} · ${parts.join(" · ")}` };
}

export type RunResult = { checked: number; sent: number; failed: number; removed: number };

let running: Promise<RunResult> | null = null;

/** 오늘·내일 일정이 있는 구독자에게 특보·예보 변화를 알린다. (타이머가 하루 몇 번 부른다) */
export function runAlerts(): Promise<RunResult> {
  running ??= doRun().finally(() => {
    running = null;
  });
  return running;
}

async function doRun(): Promise<RunResult> {
  await vapidKeys();
  const today = kstToday();
  const tomorrow = addDays(today, 1);
  const store = await readJson<Store>(SUBS, { subs: [] });
  const result: RunResult = { checked: 0, sent: 0, failed: 0, removed: 0 };
  const logs: AlertLogEntry[] = [];
  const gone = new Set<string>();
  const sentUpdates = new Map<string, Record<string, string>>();

  // 같은 장소·날짜는 한 번만 조회한다
  const dayCache = new Map<string, Promise<{ rating: Rating; reasons: string[] } | null>>();
  const warnCache = new Map<string, Promise<WeatherAlert[]>>();
  const keyOf = (p: Place) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

  for (const sub of store.subs) {
    for (const trip of sub.trips) {
      if (trip.date !== today && trip.date !== tomorrow) continue;
      result.checked++;
      const k = keyOf(trip.place);
      const dk = `${k}|${trip.date}`;
      if (!dayCache.has(dk)) {
        dayCache.set(
          dk,
          getForecast(trip.place.lat, trip.place.lng, trip.date, 1)
            .then((f) => ({ rating: f.days[0].rating, reasons: f.days[0].reasons }))
            .catch(() => null),
        );
      }
      if (!warnCache.has(k)) warnCache.set(k, getWarnings(trip.place.lat, trip.place.lng).then((w) => w.alerts));
      const [now, alerts] = await Promise.all([dayCache.get(dk)!, warnCache.get(k)!]);
      if (!now) continue;

      const label = trip.date === today ? "오늘" : "내일";
      const decision = decideAlert(trip, now, alerts, label);
      if (!decision || sub.sent[trip.id] === decision.signature) continue;

      const url = `/day?${new URLSearchParams({ lat: String(trip.place.lat), lng: String(trip.place.lng), name: trip.place.name, date: trip.date })}`;
      const entry: AlertLogEntry = {
        at: new Date().toISOString(),
        sub: sub.id.slice(0, 6),
        trip: `${trip.place.name} ${formatKoDate(trip.date)}`,
        title: decision.title,
        body: decision.body,
        result: "sent",
      };
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ title: decision.title, body: decision.body, url, tag: trip.id }),
          { TTL: 6 * 3600, urgency: "high" },
        );
        result.sent++;
        const m = sentUpdates.get(sub.id) ?? {};
        m[trip.id] = decision.signature;
        sentUpdates.set(sub.id, m);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          gone.add(sub.id);
          result.removed++;
          entry.result = "구독 만료 → 삭제";
        } else {
          result.failed++;
          entry.result = `실패 ${status ?? ""}`.trim();
        }
      }
      logs.push(entry);
      if (gone.has(sub.id)) break;
    }
  }

  await updateJson<Store>(SUBS, { subs: [] }, (cur) => ({
    subs: cur.subs
      .filter((s) => !gone.has(s.id))
      .map((s) => ({
        ...s,
        trips: s.trips.filter((t) => t.date >= today),
        sent: { ...s.sent, ...(sentUpdates.get(s.id) ?? {}) },
      })),
  }));
  if (logs.length > 0) await updateJson<AlertLogEntry[]>(LOG, [], (cur) => [...logs.reverse(), ...cur].slice(0, 200));
  return result;
}
