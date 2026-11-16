#!/usr/bin/env bash
# Repository hygiene: environment files must never be committed and must be git-ignored.
# Content scanning for secrets is done by gitleaks (see the Jenkinsfile); this checks what gitleaks cannot: file-level policy.
set -uo pipefail
cd "${1:-.}"
fail=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "FAIL: not a git work tree (the pipeline must run on a real checkout)"; exit 1; }

tracked="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '\.env\.example$' || true)"
if [ -n "$tracked" ]; then echo "FAIL: environment files are tracked by git:"; printf '  %s\n' $tracked; fail=1; else echo "OK: no .env files are tracked"; fi

for probe in .env infrastructure/jenkins/.env frontend/.env; do
  if ! git check-ignore -q "$probe" 2>/dev/null; then echo "FAIL: $probe is not covered by .gitignore"; fail=1; fi
done
[ "$fail" -eq 0 ] && echo "OK: .env files are git-ignored"

# Key material has no business in the repository, whatever its name.
keys="$(git ls-files | grep -E '\.(pem|p12|pfx|jks|keystore)$|(^|/)id_(rsa|ed25519|ecdsa)$' || true)"
if [ -n "$keys" ]; then echo "FAIL: key material is tracked:"; printf '  %s\n' $keys; fail=1; else echo "OK: no key or keystore files are tracked"; fi
exit "$fail"
