# 바수고 (BaSuGo)

바다수영 갈 장소와 날짜를 물때·날씨·풍속으로 골라 주는 반응형 웹입니다. Next.js 16(App Router, TypeScript) 기반이며 서버 DB는 없습니다.

## 화면
| 경로 | 내용 |
| --- | --- |
| `/` | 장소 검색(가까운 후보 추천) + 지도 선택, 날짜 보기, **언제갈까?**(이번 주부터 가장 좋은 날 4일), 2주 달력, 1달 달력(‹ › 로 이전/다음 달) |
| `/day` | 지도, 날씨·기온·수온·풍속·파고·강수량, 만조·간조·밀물·썰물, 일출·일몰 |
| `/my` | 저장한 날짜(선택·전체 삭제), GPX 업로드 → 지도에 경로, 수영 거리·시간·칼로리 |

날짜를 고르면 자동으로 `나의 바수`에 저장됩니다. 저장 데이터는 **사용자 브라우저(localStorage)** 에만 있고 로그인은 없습니다(`src/lib/storage.ts`).

## 외부 데이터 (모두 API 키 불필요)
| 용도 | 출처 | 코드 |
| --- | --- | --- |
| 지도 | Leaflet + OpenStreetMap 타일 | `components/MapView.tsx` |
| 장소 검색·역지오코딩 | Nominatim (서버에서 호출, 24시간 캐시, 앱 식별 User-Agent) | `lib/geocode.ts` |
| 날씨·기온·풍속·강수 | Open-Meteo Forecast (오늘부터 16일) | `lib/forecast.ts` |
| 파고·수온·해수면 | Open-Meteo Marine | `lib/forecast.ts` |
| 만조·간조 | 해수면 높이(1시간 간격)에서 극값 탐색 + 포물선 보정 | `lib/tides.ts` |
| 물때 이름(사리·조금) | 달의 위상(SunCalc)으로 음력일 계산 | `lib/lunar.ts` |
| 일출·일몰 | SunCalc 계산 | `lib/lunar.ts` |

**한계**: Open-Meteo 해수면은 전 지구 모델이라 한국 서해안처럼 조수 간만이 큰 곳에서는 국립해양조사원 조석예보와 시각·높이가 다를 수 있습니다. 정확도가 중요하면 `lib/forecast.ts`의 물때 부분을 바다누리 조석예보 API(서비스키 필요)로 교체하세요. 예보가 없는 날(약 16일 뒤)은 ‘예보 없음’으로 표시하고 물때·일출만 보여 줍니다.

## 바수 가능 기준 (기본값)
`src/lib/score.ts`의 `THRESHOLDS` 한 곳에서 바꿉니다.
- 가능: 풍속 ≤ 5m/s, 파고 ≤ 0.5m, 강수 < 1mm, 수온 ≥ 16℃, 사리 아님
- 주의: 풍속 ≤ 8m/s 또는 파고 ≤ 1.0m 또는 강수 < 5mm, 수온 16℃ 미만, 사리(조류 빠름)
- 불가: 그 이상

## GPX·칼로리
- 브라우저 `DOMParser`로 읽고 서버로 보내지 않습니다 (최대 20MB).
- 거리는 Haversine 합계. 20km/h를 넘는 GPS 튐(시간 없으면 300m 초과)은 제외하고 개수를 알려 줍니다.
- 칼로리 = MET × 체중(kg) × 시간(h). 속도별 MET: 1.5km/h 미만 6, 2.5km/h 미만 8, 그 이상 10. GPX에 시간이 없으면 2km/h로 가정. 체중은 `/my`에서 입력(기본 70kg).

## 개발
```bash
npm install
cp .env.example .env.local   # 외부 API 없이 화면만 볼 때 BASUGO_MOCK=1 주석 해제
npm run dev                  # http://localhost:3000
npm test                     # 순수 계산 로직 단위 테스트 (Node 내장 test runner)
npm run build && npm start
```
Node 22.18 이상이 필요합니다(테스트가 TypeScript를 바로 실행).

## 배포 (lecture.myfinder.co.kr 과 같은 VPS)
`deploy/` 는 SharedLectured 의 방식(Caddy → Node systemd → git pull 업데이트)과 같지만 서비스·계정·포트(3001)·도메인을 따로 씁니다.

1. 닷홈 DNS에 A 레코드 추가: `basugo` → `103.124.101.123` (주소를 바꾸려면 `deploy/config.sh`의 `DOMAIN`)
2. 코드를 GitHub `smhongDev/BaSuGo` 에 올립니다.
3. 서버에서: `scp -r deploy root@103.124.101.123:/root/basugo-deploy` 후 `bash /root/basugo-deploy/setup-server.sh`
   - 처음에는 배포 키(공개키)를 보여 주고 멈춥니다. 저장소 Settings → Deploy keys 에 읽기 전용으로 등록하고 다시 실행합니다.
4. 이후 업데이트: `sudo basugo-update`
- 기존 `/etc/caddy/Caddyfile` 은 `import /etc/caddy/conf.d/*` 한 줄만 추가하고, 설정 검사에 실패하면 BaSuGo 설정을 되돌립니다(lecture 사이트 영향 없음).
- 포트를 바꾸면 `deploy/basugo.service` 의 `-p 3001` 도 함께 바꿔야 합니다.
- 운영 서버에는 `BASUGO_MOCK` 를 설정하지 마세요.

## 로고
`public/brand/basugo-logo.png`(가로형), `basugo-symbol.png`(파도 심볼), `src/app/icon.png`·`apple-icon.png`(파비콘). 사용자가 준 로고 v2의 흰 배경을 제거한 파일이며, 투명 배경 원본이 있으면 교체하세요.
