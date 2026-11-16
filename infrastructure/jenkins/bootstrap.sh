#!/usr/bin/env bash
# Creates infrastructure/jenkins/.env with freshly generated passwords (mode 600). Safe to re-run: it never overwrites an existing file.
#   ./bootstrap.sh [git-url]
set -euo pipefail
cd "$(dirname "$0")"

command -v openssl >/dev/null || { echo "openssl is required to generate passwords" >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is not installed or not on PATH" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop first." >&2; exit 1; }
for port in 8081; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $port is already in use; stop that process or change the port mapping in docker-compose.yml" >&2; exit 1; fi
done

if [ -e .env ]; then echo ".env already exists, leaving it unchanged."; exit 0; fi

gen() { openssl rand -hex 16; }   # not `tr </dev/urandom | head`: that exits 141 (SIGPIPE) under pipefail
url="${1:-}"
if [ -z "$url" ]; then url="$(git -C ../.. remote get-url origin 2>/dev/null || true)"; fi
url="${url:-https://github.com/OWNER/payflow-platform.git}"

umask 077
cat > .env <<ENV
JENKINS_ADMIN_PASSWORD=$(gen)
JENKINS_AGENT_PASSWORD=$(gen)
PAYFLOW_GIT_URL=${url}
PAYFLOW_GIT_BRANCH=*/main
PAYFLOW_GIT_CREDENTIALS_ID=
ENV
echo "Created $(pwd)/.env (mode 600). The admin user is 'admin'; its password is in that file."
echo "Repository: ${url}"
echo "Next: docker compose up -d --build   then open http://localhost:8081"
