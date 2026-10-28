/** 공공데이터포털(data.go.kr) 인증키. 기상청 특보·국립해양조사원 조석예보에 같은 키를 쓴다. */
export function dataGoKrKey(): string | null {
  const k = process.env.DATA_GO_KR_KEY?.trim();
  return k ? k : null;
}

type Body<T> = {
  header?: { resultCode?: string; resultMsg?: string };
  body?: { items?: { item?: T | T[] } | "" };
};
/** 기상청은 { response: {header, body} }, 국립해양조사원은 {header, body} 를 바로 준다 */
type Envelope<T> = Body<T> & { response?: Body<T> };

/**
 * data.go.kr 표준 응답(response.header/body.items.item)을 받아 item 배열을 돌려준다.
 * 자료 없음(resultCode 03)은 빈 배열, 키 오류처럼 XML로 오는 오류는 메시지를 담아 던진다.
 */
export async function fetchDataGoKr<T>(endpoint: string, params: Record<string, string>, revalidate = 600): Promise<T[]> {
  const key = dataGoKrKey();
  if (!key) throw new Error("DATA_GO_KR_KEY 가 설정되지 않았습니다");
  // 포털이 주는 '인코딩' 키(%가 들어 있음)를 넣어도, '디코딩' 키를 넣어도 되게 한다
  const encodedKey = key.includes("%") ? key : encodeURIComponent(key);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${endpoint}?serviceKey=${encodedKey}&${qs}`, { next: { revalidate } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(endpoint).pathname} HTTP ${res.status}`);

  let json: Envelope<T>;
  try {
    json = JSON.parse(text) as Envelope<T>;
  } catch {
    const msg = text.match(/<(?:returnAuthMsg|errMsg|resultMsg)>([^<]+)</)?.[1] ?? "알 수 없는 응답";
    throw new Error(msg.trim());
  }
  const env = json.response ?? json;
  const code = env.header?.resultCode;
  if (code === "03") return [];
  if (code && code !== "00") throw new Error(`${code} ${env.header?.resultMsg ?? ""}`.trim());
  const items = env.body?.items;
  const item = items && typeof items === "object" ? items.item : undefined;
  if (item == null) return [];
  return Array.isArray(item) ? item : [item];
}
