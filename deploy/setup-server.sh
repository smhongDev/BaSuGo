#!/usr/bin/env bash
# BaSuGo 서버 설치 스크립트 (lecture.myfinder.co.kr 이 이미 올라간 Ubuntu 24.04 VPS에서, root로 실행)
# 여러 번 실행해도 안전하다.
#
#   sudo bash setup-server.sh
#
# 이미 SharedLectured 설치 스크립트로 Node.js·Caddy·방화벽이 준비된 서버를 전제로 한다.
# 처음 실행 때 GitHub 배포 키가 등록되지 않았으면 공개키를 보여 주고 멈춘다.
# 그 키를 BaSuGo 저장소 Settings > Deploy keys 에 (읽기 전용으로) 등록한 뒤 다시 실행하면 이어서 진행한다.
# GitHub 없이 올리려면 코드 폴더를 서버에 복사하고 SRC_DIR 로 알려 준다 (config.sh 참고).

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=config.sh
source "$HERE/config.sh"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "root로 실행해 주세요: sudo bash $0"; exit 1; }
command -v node >/dev/null || { echo "Node.js가 없습니다. 먼저 SharedLectured의 setup-server.sh 로 서버를 준비해 주세요."; exit 1; }
command -v caddy >/dev/null || { echo "Caddy가 없습니다. 먼저 SharedLectured의 setup-server.sh 로 서버를 준비해 주세요."; exit 1; }
[ -f /etc/caddy/Caddyfile ] || { echo "/etc/caddy/Caddyfile 이 없습니다."; exit 1; }

log "서비스 계정 ${APP_USER}"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_HOME" --create-home --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_HOME"
install -d -m 0750 -g "$APP_USER" /etc/basugo

log "설정 파일 ${ENV_FILE}"
if [ ! -f "$ENV_FILE" ]; then
  umask 027
  cat > "$ENV_FILE" <<EOT
NODE_ENV=production
PORT=${PORT}
HOSTNAME=127.0.0.1
NEXT_TELEMETRY_DISABLED=1
# 운영에서는 BASUGO_MOCK 를 절대 켜지 마세요 (가짜 날씨 데이터가 나옵니다).
EOT
  chown root:"$APP_USER" "$ENV_FILE"
  chmod 0640 "$ENV_FILE"
  umask 022
  echo "생성했습니다."
else
  echo "이미 있습니다 (그대로 둡니다)."
fi
# 관리자 계정·알림 비밀값이 없으면 만든다 (출력하지 않음)
# shellcheck source=ensure-env.sh
source "$HERE/ensure-env.sh"
echo "관리자 비밀번호 확인: sudo grep ADMIN_PASSWORD $ENV_FILE"

as_app() { sudo -u "$APP_USER" -H "$@"; }
if [ -n "$SRC_DIR" ]; then
log "코드 복사 ${SRC_DIR} → ${APP_DIR} (GitHub 사용 안 함)"
[ -f "$SRC_DIR/package.json" ] || { echo "$SRC_DIR 에 package.json 이 없습니다."; exit 1; }
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_DIR"
# node_modules·.next 는 남겨서 다시 빌드할 때 시간을 줄인다
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name node_modules ! -name .next -exec rm -rf {} +
cp -a "$SRC_DIR"/. "$APP_DIR"/
rm -rf "$APP_DIR/.env" "$APP_DIR/.env.local"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
else
log "GitHub 배포 키"
install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$APP_HOME/.ssh"
if [ ! -f "$APP_HOME/.ssh/id_ed25519" ]; then
  as_app ssh-keygen -t ed25519 -N '' -C "basugo-server-deploy" -f "$APP_HOME/.ssh/id_ed25519" -q
fi
as_app bash -c "ssh-keyscan -t ed25519 github.com 2>/dev/null > '$APP_HOME/.ssh/known_hosts'"
if ! as_app git ls-remote "$REPO_SSH" >/dev/null 2>&1; then
  echo
  echo "------------------------------------------------------------------"
  echo " GitHub 저장소에 아래 배포 키를 '읽기 전용'으로 등록한 뒤 이 스크립트를 다시 실행하세요."
  echo " (저장소 → Settings → Deploy keys → Add deploy key)"
  echo
  cat "$APP_HOME/.ssh/id_ed25519.pub"
  echo "------------------------------------------------------------------"
  exit 2
fi

log "코드 받기 → ${APP_DIR}"
if [ ! -d "$APP_DIR/.git" ]; then
  # 예전에 SRC_DIR 로 복사해 둔 폴더가 있으면 옆으로 치우고 새로 받는다
  [ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.bak-$(date +%Y%m%d%H%M%S)"
  as_app git clone --branch "$BRANCH" "$REPO_SSH" "$APP_DIR"
else
  as_app git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  as_app git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
fi

fi

log "설치·빌드 (몇 분 걸립니다)"
as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=1536 NEXT_TELEMETRY_DISABLED=1 npm run build"

log "systemd 서비스"
install -m 0644 "$HERE/basugo.service" /etc/systemd/system/basugo.service
install -m 0755 "$HERE/update.sh" /usr/local/sbin/basugo-update
install -d -m 0755 /usr/local/share/basugo
install -m 0644 "$HERE/config.sh" /usr/local/share/basugo/config.sh
install -m 0644 "$HERE/ensure-env.sh" /usr/local/share/basugo/ensure-env.sh
install -m 0644 "$HERE/basugo-alerts.service" /etc/systemd/system/basugo-alerts.service
install -m 0644 "$HERE/basugo-alerts.timer" /etc/systemd/system/basugo-alerts.timer
systemctl daemon-reload
systemctl enable basugo.service
systemctl restart basugo.service
systemctl enable --now basugo-alerts.timer

log "Caddy 설정 (${DOMAIN} → 127.0.0.1:${PORT}, HTTPS 자동)"
install -d -m 0755 /etc/caddy/conf.d
sed -e "s/__DOMAIN__/${DOMAIN}/g" -e "s/__PORT__/${PORT}/g" "$HERE/basugo.caddy" > /etc/caddy/conf.d/basugo.caddy
# 기존 Caddyfile 은 그대로 두고 import 한 줄만 보탠다 (이미 있으면 건너뜀)
grep -qF 'import /etc/caddy/conf.d/*' /etc/caddy/Caddyfile || {
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-basugo-$(date +%Y%m%d%H%M%S)"
  printf '\n# 다른 사이트(BaSuGo 등) 설정\nimport /etc/caddy/conf.d/*\n' >> /etc/caddy/Caddyfile
}
if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  echo "Caddy 설정 검사에 실패해서 BaSuGo 설정을 되돌립니다. 기존 사이트는 영향이 없습니다."
  rm -f /etc/caddy/conf.d/basugo.caddy
  exit 1
fi
install -d -o caddy -g caddy /var/log/caddy
chown -R caddy:caddy /var/log/caddy
systemctl reload caddy || systemctl restart caddy

log "확인"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then echo "앱 응답 OK"; break; fi
  sleep 1
done
systemctl --no-pager --lines=0 status basugo.service || true

cat <<EOT

설치가 끝났습니다.
- 주소: https://${DOMAIN}  (DNS A 레코드가 이 서버를 가리켜야 인증서가 발급됩니다)
- 로그: journalctl -u basugo -f
- 업데이트: sudo basugo-update
- 관리자: https://${DOMAIN}/admin  (아이디 admin, 비밀번호: sudo grep ADMIN_PASSWORD ${ENV_FILE})
- 기상특보·조석예보: ${ENV_FILE} 에 DATA_GO_KR_KEY=공공데이터포털키 를 넣고 sudo systemctl restart basugo
- 주의: SharedLectured 의 setup-server.sh 를 다시 실행하면 /etc/caddy/Caddyfile 이 새로 써져서
  BaSuGo import 줄이 사라집니다. 그때는 이 스크립트를 한 번 더 실행하세요.
EOT
