#!/usr/bin/env bash
# Builds and starts the isolated stack in the DinD daemon, runs the end-to-end flow against it, and always tears it down.
# Writes JUnit XML to frontend/reports/e2e (collected by Jenkins). Requires DOCKER_HOST to point at the isolated daemon.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
host="${E2E_HOST:-docker}"
compose=(docker compose -f "$here/docker-compose.e2e.yml" -p "payflow-e2e")
out="$root/reports/e2e"; mkdir -p "$out"

if [ -z "${DOCKER_HOST:-}" ] && [ "${E2E_ALLOW_LOCAL_DOCKER:-}" != "1" ]; then
  echo "Refusing to run: DOCKER_HOST is not set, so this would use the machine's own Docker. Set E2E_ALLOW_LOCAL_DOCKER=1 to override." >&2; exit 2
fi

cleanup() { "${compose[@]}" logs --no-color --tail=200 > "$out/stack.log" 2>&1 || true; "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== building and starting the isolated stack =="
"${compose[@]}" up -d --build || { echo "FAIL: the stack did not start" >&2; exit 1; }

echo "== waiting for the backend and frontend =="
for url in "http://$host:8080/actuator/health" "http://$host:3000/"; do
  ok=0
  for i in $(seq 1 90); do
    if curl -fsS -o /dev/null "$url"; then ok=1; break; fi; sleep 2
  done
  [ "$ok" = 1 ] || { echo "FAIL: $url never became healthy" >&2; exit 1; }
  echo "  up: $url"
done

if [ "${E2E_RUN:-flow}" = "smoke" ]; then
  # OPTIONAL: two real calls to the Visa sandbox (authorize + capture). Only reachable from the Jenkinsfile's opt-in stage.
  echo "== running the optional Visa sandbox smoke test =="
  PAYFLOW_API_BASE="http://$host:8080/api/v1" PAYFLOW_DEMO_API_KEY="${E2E_API_KEY:-e2e-test-key-0000000000}" python3 "$root/scripts_visa_live_smoke.py"
else
  echo "== running the end-to-end flow =="
  E2E_API_BASE="http://$host:8080/api/v1" E2E_WEB_BASE="http://$host:3000" E2E_API_KEY="${E2E_API_KEY:-e2e-test-key-0000000000}" \
    python3 "$here/e2e_payment_flow.py" --junit "$out/junit.xml"
fi
