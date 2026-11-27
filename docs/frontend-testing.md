# Frontend testing

## Runtime requirement: Node.js 24 LTS

| Where | Pinned by |
|---|---|
| Local | `frontend/.nvmrc` (`24`), `package.json` `engines.node` = `^24.15.0`, `frontend/.npmrc` `engine-strict=true` |
| Docker | `frontend/Dockerfile` (`node:24-alpine`, `npm ci`) |
| Jenkins | `infrastructure/jenkins/agent/Dockerfile` (`node:24-bookworm-slim`) and the preflight stage in the `Jenkinsfile`, which compares `node -v` with `.nvmrc` |
| GitHub Actions | `setup-node` with `node-version-file: frontend/.nvmrc` |

Why 24: `jsdom@31` declares `node: ^22.22.2 || ^24.15.0 || >=26`, and its dependency `undici@8` needs `>=22.19` and Node's built-in Zstandard (`zlib.createZstdDecompress`). Node 24 LTS satisfies all of it. With `engine-strict`, `npm ci` on an older Node fails immediately with `EBADENGINE` instead of producing a half-working test run.

```bash
nvm install && nvm use      # reads frontend/.nvmrc
cd frontend && npm ci       # exact versions from package-lock.json
```

## Architecture

- **Runner:** Vitest 3.2.7. Config: `frontend/vitest.config.ts`. Default environment is `node`; component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock.
- **Tests:** `frontend/tests/*.test.{ts,tsx}` (12 files): pure logic (contrast, countup, live, merchants, notification utils), React components (login form, notifications UI, payment UI, hydration) and server-side routes/config/session policy.
- **Timeouts:** `testTimeout` and `hookTimeout` are 20 s. jsdom + MUI + animation tests are CPU-heavy, and on a cold cache the 5 s default produced a one-off spurious timeout on an otherwise green suite.
- **Unhandled errors** are never ignored (`dangerouslyIgnoreUnhandledErrors` is not used); Vitest exits non-zero on them.

## Commands (run in `frontend/`)

| Command | Result |
|---|---|
| `npm test` | one run |
| `npm run test:watch` | watch mode |
| `npm run test:coverage` | run + coverage in `coverage/` |
| `npm run test:ci` | run + coverage + `reports/junit.xml` |

Outputs: `frontend/reports/junit.xml`; `frontend/coverage/` containing `index.html`, `lcov.info`, `cobertura-coverage.xml`, `coverage-summary.json`. Both directories are git-ignored.

## Jenkins

Stage **Frontend Unit Tests** runs `npm run test:ci`, then in `post { always }`: publishes JUnit, publishes the HTML coverage report (htmlpublisher), records Cobertura coverage (coverage plugin), archives `frontend/reports` and `frontend/coverage`, and runs `infrastructure/ci/verify_reports.py` plus a presence check for every coverage file. The pipeline thus fails on a failing test, an unhandled error, a skipped test, a missing essential test file, or a missing report, and never reaches later stages. Nothing in the pipeline deploys. The line-coverage threshold (`FRONTEND_COVERAGE_MIN`, default 50) makes the build UNSTABLE in the *Coverage and Reports* stage.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `TypeError: Cannot read properties of undefined (reading 'bind')` at `undici/lib/interceptor/decompress.js`, "9 of 12 files", 3 unhandled errors | Node older than 22.15 (e.g. 20.x): no `zlib.createZstdDecompress`, which undici (via jsdom) binds at import. `nvm use` (Node 24). |
| `EBADENGINE` on `npm ci` | Wrong Node version; `nvm use`. |
| `Test timed out in 5000ms` | Should not occur with the 20 s timeout; if it does, the machine is badly overloaded: rerun, or run `npx vitest run --no-file-parallelism`. |
| Jenkins: "Node 24 is required" | Agent image not rebuilt: `docker compose build agent && docker compose up -d agent` in `infrastructure/jenkins`. |
| Jenkins: "HTML coverage not published" | Controller image predates the `htmlpublisher`/`coverage` plugins: rebuild the controller. |
