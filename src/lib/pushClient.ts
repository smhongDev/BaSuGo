import { kstToday } from "./dates.ts";
import { loadTrips } from "./storage.ts";

/** 브라우저 푸시 알림 (회원가입 없이, 이 브라우저에만 묶인 익명 구독) */

export type PushState = "unsupported" | "ios-needs-install" | "denied" | "off" | "on";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function upcomingTrips() {
  const today = kstToday();
  return loadTrips()
    .filter((t) => t.date >= today)
    .map((t) => ({ id: t.id, place: t.place, date: t.date, rating: t.rating }));
}

async function send(sub: PushSubscription): Promise<void> {
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), trips: upcomingTrips() }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "알림 신청에 실패했어요.");
  }
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한을 허용해야 받을 수 있어요.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const keyRes = await fetch("/api/push");
  const { publicKey, error } = (await keyRes.json()) as { publicKey?: string; error?: string };
  if (!publicKey) throw new Error(error ?? "알림 기능을 준비하지 못했어요.");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await send(sub);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe();
}

/** 저장한 날짜가 바뀌었을 때 서버의 일정 목록을 맞춘다 (구독 중일 때만). */
export async function syncPushTrips(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await send(sub).catch(() => undefined);
}
