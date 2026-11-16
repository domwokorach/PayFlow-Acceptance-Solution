#!/usr/bin/env bash
# Known-vulnerable dependencies (pom.xml, package-lock.json) with Trivy.
# Exit: 0 = nothing HIGH/CRITICAL with a fix available, 5 = vulnerabilities found (Jenkins: UNSTABLE), 1 = the scan itself failed (Jenkins: FAILURE).
# A scan that could not run is never reported as clean.
set -uo pipefail
cd "${1:-.}"; mkdir -p reports
trivy fs --cache-dir "${TRIVY_CACHE_DIR:-$HOME/.cache/trivy}" --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
  --skip-dirs node_modules --skip-dirs target --skip-dirs .next --skip-dirs coverage --skip-dirs reports \
  --exit-code 5 --format table . 2>&1 | tee reports/dependency-scan.txt
rc=${PIPESTATUS[0]}
case "$rc" in 0) echo "Dependency scan: no HIGH/CRITICAL fixable vulnerabilities";; 5) echo "Dependency scan: vulnerabilities found (see reports/dependency-scan.txt)";; *) echo "Dependency scan FAILED to run (exit $rc)"; rc=1;; esac
exit "$rc"
