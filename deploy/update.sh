#!/usr/bin/env bash
# 최신 코드로 업데이트: git pull → npm ci → build → 재시작 (root로 실행)
#   sudo basugo-update
#   GitHub 없이: sudo SRC_DIR=/root/basugo-src basugo-update
# 빌드가 실패하면 서비스는 이전 빌드 그대로 계속 돈다(재시작하지 않음).

set -euo pipefail
for c in "$(dirname "${BASH_SOURCE[0]}")/config.sh" /usr/local/share/basugo/config.sh; do
  [ -f "$c" ] && { source "$c"; break; }
done
[ "$(id -u)" -eq 0 ] || { echo "root로 실행해 주세요: sudo $0"; exit 1; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

if [ -n "${SRC_DIR:-}" ]; then
  echo "==> 코드 복사 $SRC_DIR (GitHub 사용 안 함)"
  [ -f "$SRC_DIR/package.json" ] || { echo "$SRC_DIR 에 package.json 이 없습니다."; exit 1; }
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .next -exec rm -rf {} +
  cp -a "$SRC_DIR"/. "$APP_DIR"/
  rm -rf "$APP_DIR/.env" "$APP_DIR/.env.local"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
  after="$(date +%Y%m%d-%H%M%S)"
else
  echo "==> 코드 받기"
  before="$(as_app git -C "$APP_DIR" rev-parse --short HEAD)"
  as_app git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  as_app git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
  after="$(as_app git -C "$APP_DIR" rev-parse --short HEAD)"
  echo "    $before → $after"
fi

echo "==> 설치·빌드"
as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npm run build"

echo "==> 설정값 확인"
# shellcheck source=ensure-env.sh
source "$APP_DIR/deploy/ensure-env.sh"

echo "==> 재시작"
install -m 0644 "$APP_DIR/deploy/basugo.service" /etc/systemd/system/basugo.service
install -m 0644 "$APP_DIR/deploy/basugo-alerts.service" /etc/systemd/system/basugo-alerts.service
install -m 0644 "$APP_DIR/deploy/basugo-alerts.timer" /etc/systemd/system/basugo-alerts.timer
install -m 0755 "$APP_DIR/deploy/update.sh" /usr/local/sbin/basugo-update
install -m 0644 "$APP_DIR/deploy/config.sh" /usr/local/share/basugo/config.sh
install -m 0644 "$APP_DIR/deploy/ensure-env.sh" /usr/local/share/basugo/ensure-env.sh
systemctl daemon-reload
systemctl restart basugo.service
systemctl enable --now basugo-alerts.timer

for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then echo "완료: 앱 응답 OK ($after)"; exit 0; fi
  sleep 1
done
echo "앱이 응답하지 않습니다. 로그를 확인하세요: journalctl -u basugo -n 100"
exit 1
