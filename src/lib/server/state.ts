import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 서버에 남기는 작은 JSON 파일들(공지·기준값·알림 구독)을 두는 폴더.
 * 운영: systemd StateDirectory=basugo → STATE_DIRECTORY=/var/lib/basugo
 * 개발: 프로젝트의 .data/
 */
export function stateDir(): string {
  return process.env.BASUGO_STATE_DIR || process.env.STATE_DIRECTORY || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(stateDir(), name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중에 꺼져도 파일이 깨지지 않게 한다. */
export async function writeJson(name: string, value: unknown): Promise<void> {
  const dir = stateDir();
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const file = path.join(dir, name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1), { mode: 0o640 });
  await rename(tmp, file);
}

/** 같은 파일을 동시에 고치지 않도록 한 줄로 세운다 (프로세스 하나 기준). */
const queues = new Map<string, Promise<unknown>>();
export function updateJson<T>(name: string, fallback: T, fn: (v: T) => T | Promise<T>): Promise<T> {
  const prev = queues.get(name) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(async () => {
      const value = await fn(await readJson(name, fallback));
      await writeJson(name, value);
      return value;
    });
  queues.set(name, next);
  return next;
}
