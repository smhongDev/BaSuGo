# /etc/basugo/env 에 필요한 값이 없으면 채운다 (setup-server.sh·update.sh 가 source 해서 쓴다).
# 비밀번호·비밀값은 화면에 출력하지 않는다. 관리자 비밀번호 확인: sudo grep ADMIN_PASSWORD /etc/basugo/env

ensure_env() {
  local key="$1" value="$2"
  grep -q "^${key}=" "$ENV_FILE" || printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}
rand_alnum() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }

ensure_env ADMIN_USER admin
ensure_env ADMIN_PASSWORD "$(rand_alnum 16)"
ensure_env ALERT_SECRET "$(rand_alnum 40)"
grep -q '^#\?\s*DATA_GO_KR_KEY=' "$ENV_FILE" || cat >> "$ENV_FILE" <<'EOT'
# 공공데이터포털 인증키 (기상청 기상특보·국립해양조사원 조석예보). 넣은 뒤: sudo systemctl restart basugo
#DATA_GO_KR_KEY=
EOT
chown root:"$APP_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
