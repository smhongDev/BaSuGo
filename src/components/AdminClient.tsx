"use client";

import { useCallback, useEffect, useState } from "react";
import type { Thresholds } from "@/lib/score";

type Session = { configured: boolean; loggedIn: boolean };
type Check = { name: string; ok: boolean; detail: string };
type Status = {
  checks: Check[];
  push: {
    subscribers: number;
    upcomingTrips: number;
    log: { at: string; sub: string; trip: string; title: string; body: string; result: string }[];
  };
  alertTimer: boolean;
  stateDir: string;
  mock: boolean;
};
type Banner = { enabled: boolean; text: string; level: "info" | "warning"; updatedAt: string | null };
type SettingsRes = {
  banner: Banner;
  thresholds: Thresholds;
  defaults: Thresholds;
  limits: Record<keyof Thresholds, [number, number]>;
};

const FIELDS: { key: keyof Thresholds; label: string; unit: string }[] = [
  { key: "windGood", label: "풍속 — 이하면 가능", unit: "m/s" },
  { key: "windCaution", label: "풍속 — 이하면 주의 (넘으면 불가)", unit: "m/s" },
  { key: "waveGood", label: "파고 — 이하면 가능", unit: "m" },
  { key: "waveCaution", label: "파고 — 이하면 주의 (넘으면 불가)", unit: "m" },
  { key: "precipGood", label: "강수 — 미만이면 가능", unit: "mm" },
  { key: "precipCaution", label: "강수 — 미만이면 주의 (이상이면 불가)", unit: "mm" },
  { key: "seaTempMin", label: "수온 — 미만이면 주의", unit: "℃" },
  { key: "sariWest", label: "사리 감점 — 서해 (0이면 판정에서 뺌)", unit: "점" },
  { key: "sariSouth", label: "사리 감점 — 남해·제주", unit: "점" },
  { key: "sariEast", label: "사리 감점 — 동해", unit: "점" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `요청 실패 (${res.status})`);
  return body as T;
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export function AdminClient() {
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(() => {
    api<Session>("/api/admin/session")
      .then(setSession)
      .catch(() => setSession({ configured: false, loggedIn: false }));
  }, []);
  useEffect(refresh, [refresh]);

  if (!session) return <p className="hint">불러오는 중…</p>;
  if (!session.configured) {
    return (
      <section className="panel">
        <h2>관리자</h2>
        <p className="error">서버에 관리자 비밀번호가 설정되지 않았어요. 서버의 /etc/basugo/env 에 ADMIN_PASSWORD 를 넣어 주세요.</p>
      </section>
    );
  }
  return session.loggedIn ? <Dashboard onLogout={refresh} /> : <Login onDone={refresh} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/session", { method: "POST", body: JSON.stringify({ user, password }) });
      setPassword("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-login" aria-labelledby="login">
      <h2 id="login">관리자 로그인</h2>
      <form onSubmit={submit} className="stack">
        <label className="date-field">
          <span>아이디</span>
          <input type="text" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
        </label>
        <label className="date-field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn" disabled={busy || !password}>
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>
    </section>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<SettingsRes | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [th, setTh] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(() => {
    setStatus(null);
    api<Status>("/api/admin/status")
      .then(setStatus)
      .catch((e) => setMsg({ kind: "error", text: e.message }));
  }, []);

  useEffect(() => {
    loadStatus();
    api<SettingsRes>("/api/admin/settings")
      .then((s) => {
        setSettings(s);
        setBanner(s.banner);
        setTh(Object.fromEntries(Object.entries(s.thresholds).map(([k, v]) => [k, String(v)])));
      })
      .catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [loadStatus]);

  async function save(patch: object, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      const s = await api<SettingsRes>("/api/admin/settings", { method: "PUT", body: JSON.stringify(patch) });
      setSettings((prev) => (prev ? { ...prev, ...s } : prev));
      setBanner(s.banner);
      setMsg({ kind: "ok", text: done });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "저장에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ checked: number; sent: number; failed: number; removed: number }>("/api/alerts/run", { method: "POST" });
      setMsg({ kind: "ok", text: `알림 검사 완료: 오늘·내일 일정 ${r.checked}건 확인, ${r.sent}건 발송, 실패 ${r.failed}, 만료 구독 삭제 ${r.removed}` });
      loadStatus();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "알림 검사에 실패했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/admin/session", { method: "DELETE" }).catch(() => undefined);
    onLogout();
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <h2 className="detail-title">관리자</h2>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          로그아웃
        </button>
      </div>
      {msg && (
        <p className={msg.kind === "ok" ? "ok-msg" : "error"} role="status">
          {msg.text}
        </p>
      )}

      <section className="panel" aria-labelledby="sources">
        <div className="row between wrap">
          <h2 id="sources">데이터 출처 상태</h2>
          <button type="button" className="btn btn-ghost" onClick={loadStatus}>
            다시 확인
          </button>
        </div>
        {!status ? (
          <p className="hint">확인 중… (부산 해운대 기준으로 실제 호출해 봐요)</p>
        ) : (
          <>
            <ul className="list">
              {status.checks.map((c) => (
                <li key={c.name} className="list-item">
                  <span className="list-main">
                    <strong>
                      {c.ok ? "✅" : "⚠️"} {c.name}
                    </strong>
                    <span>{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {status.mock && <p className="error">BASUGO_MOCK=1 (가짜 데이터) 상태예요. 운영에서는 끄세요.</p>}
            <p className="hint">
              기상특보·조석예보는 공공데이터포털 인증키(DATA_GO_KR_KEY)를 서버 설정 파일에 넣으면 켜져요. 키가 없거나 실패하면 Open-Meteo
              값으로 계속 동작해요.
            </p>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="banner">
        <h2 id="banner">사이트 공지 배너</h2>
        {banner && (
          <div className="stack">
            <textarea
              value={banner.text}
              maxLength={300}
              rows={3}
              onChange={(e) => setBanner({ ...banner, text: e.target.value })}
              placeholder="예: 이번 주말 동해안 풍랑주의보 — 입수 자제 부탁드립니다."
              aria-label="공지 내용"
            />
            <div className="row wrap">
              <label className="check-label">
                <input type="checkbox" checked={banner.enabled} onChange={(e) => setBanner({ ...banner, enabled: e.target.checked })} />
                보이기
              </label>
              <label className="check-label">
                <input
                  type="radio"
                  name="level"
                  checked={banner.level === "info"}
                  onChange={() => setBanner({ ...banner, level: "info" })}
                />
                안내
              </label>
              <label className="check-label">
                <input
                  type="radio"
                  name="level"
                  checked={banner.level === "warning"}
                  onChange={() => setBanner({ ...banner, level: "warning" })}
                />
                주의
              </label>
              <button type="button" className="btn" disabled={busy} onClick={() => save({ banner }, "공지를 저장했어요.")}>
                공지 저장
              </button>
            </div>
            {banner.updatedAt && <p className="hint">마지막 수정: {fmtTime(banner.updatedAt)}</p>}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="thresholds">
        <h2 id="thresholds">바수 가능 기준</h2>
        {settings && (
          <>
            <div className="th-grid">
              {FIELDS.map((f) => (
                <label key={f.key} className="date-field">
                  <span>
                    {f.label} ({f.unit}) · 기본 {settings.defaults[f.key]}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    min={settings.limits[f.key][0]}
                    max={settings.limits[f.key][1]}
                    value={th[f.key] ?? ""}
                    onChange={(e) => setTh({ ...th, [f.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <div className="row wrap">
              <button type="button" className="btn" disabled={busy} onClick={() => save({ thresholds: th }, "기준을 저장했어요. 새로 조회하는 화면부터 적용돼요.")}>
                기준 저장
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setTh(Object.fromEntries(Object.entries(settings.defaults).map(([k, v]) => [k, String(v)])))}
              >
                기본값으로 채우기
              </button>
            </div>
            <p className="hint">사리 감점이 0보다 크면 사리 기간을 ‘주의’로 보고 그만큼 점수를 빼요 (서해·남해·동해 따로). 호수·강 같은 내륙 물가는 물때·사리·파도·수온 없이 날씨로만 판정해요. 기준 저장 후 1분 안에 모든 방문자 화면에 적용돼요.</p>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="push">
        <div className="row between wrap">
          <h2 id="push">알림</h2>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={runNow}>
            지금 알림 검사
          </button>
        </div>
        {status && (
          <>
            <dl className="facts big">
              <div>
                <dt>알림 구독 (브라우저)</dt>
                <dd>{status.push.subscribers}</dd>
              </div>
              <div>
                <dt>앞으로의 일정</dt>
                <dd>{status.push.upcomingTrips}</dd>
              </div>
              <div>
                <dt>자동 검사</dt>
                <dd>{status.alertTimer ? "켜짐" : "꺼짐"}</dd>
              </div>
            </dl>
            <p className="hint">자동 검사: 매일 07·10·13·16·19·21시. 오늘·내일 일정에 기상특보가 있거나 판정이 바뀌면 보내요.</p>
            <h3>최근 발송 기록</h3>
            {status.push.log.length === 0 ? (
              <p className="hint">아직 보낸 알림이 없어요.</p>
            ) : (
              <ul className="list">
                {status.push.log.map((l, i) => (
                  <li key={`${l.at}-${i}`} className="list-item">
                    <span className="list-main">
                      <strong>{l.title}</strong>
                      <span>
                        {fmtTime(l.at)} · {l.trip} · {l.result} · 구독 {l.sub}
                      </span>
                      <span>{l.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <p className="hint">방문자의 ‘나의 바수’ 기록은 각자의 브라우저에만 있어서 관리자 화면에서는 볼 수 없어요.</p>
    </div>
  );
}
