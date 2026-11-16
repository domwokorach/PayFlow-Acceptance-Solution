#!/usr/bin/env bash
# Builds a bare git repository from the current working tree, for use with docker-compose.local-repo.yml.
# Uses a temporary copy, so your project folder (and its git state, if any) is never modified. Secrets and build output are excluded.
set -euo pipefail
cd "$(dirname "$0")"
root="$(cd ../.. && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude '.next' --exclude 'coverage' --exclude 'reports' \
  --exclude '.env' --exclude '.env.*' --include '.env.example' --exclude '.DS_Store' --exclude 'infrastructure/jenkins/local-repo' \
  "$root"/ "$tmp"/work/ 2>/dev/null || { mkdir -p "$tmp/work"; rsync -a --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude '.next' --exclude 'coverage' --exclude 'reports' --exclude '.env' --exclude '.DS_Store' --exclude 'infrastructure/jenkins/local-repo' "$root"/ "$tmp/work/"; }
git -C "$tmp/work" init -q -b main
git -C "$tmp/work" -c user.name="PayFlow CI demo" -c user.email="ci@localhost" add -A
git -C "$tmp/work" -c user.name="PayFlow CI demo" -c user.email="ci@localhost" commit -q -m "Snapshot for local Jenkins build"
# Update in place: containers bind-mount local-repo/payflow.git, so the directory itself must not be deleted and recreated.
mkdir -p local-repo/payflow.git
git clone -q --bare "$tmp/work" "$tmp/payflow.git"
rsync -a --delete "$tmp/payflow.git/" local-repo/payflow.git/
echo "Created $(pwd)/local-repo/payflow.git at $(git -C local-repo/payflow.git rev-parse --short HEAD)"
