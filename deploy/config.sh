# BaSuGo 서버 설정값 (다른 스크립트가 source 해서 쓴다)
# 필요하면 실행 전에 환경변수로 덮어쓸 수 있다. 예: DOMAIN=test.example.com bash setup-server.sh

DOMAIN="${DOMAIN:-basugo.myfinder.co.kr}"
REPO_SSH="${REPO_SSH:-git@github.com:smhongDev/BaSuGo.git}"
BRANCH="${BRANCH:-main}"
# GitHub 없이 올릴 때: 서버에 복사한 코드 폴더. 비어 있으면 GitHub에서 받는다.
#   예: SRC_DIR=/root/basugo-src bash /root/basugo-src/deploy/setup-server.sh
SRC_DIR="${SRC_DIR:-}"

APP_USER="basugo"
APP_HOME="/opt/basugo"                  # 서비스 계정 홈 (배포 키, npm 캐시)
APP_DIR="$APP_HOME/app"                 # 코드 (git clone)
ENV_FILE="/etc/basugo/env"              # 서버 설정값 (서버에서 생성, git에 올리지 않음)
PORT="${PORT:-3001}"                    # lecture 서비스가 3000을 쓰므로 3001
