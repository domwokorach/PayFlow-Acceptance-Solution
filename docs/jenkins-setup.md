# Jenkins CI for PayFlow

A local Jenkins that builds and tests the whole platform on every run: backend unit and PostgreSQL integration tests, frontend lint, tests and production build, an isolated end-to-end run, secret and dependency scanning, and coverage and JUnit reports.

```
                     http://localhost:8081 (127.0.0.1 only)
┌──────────────────────────┐   websocket    ┌─────────────────────────────┐   TLS    ┌──────────────────────────┐
│ jenkins (controller)     │◄───────────────│ agent  payflow-agent        │─────────►│ docker (Docker-in-Docker)│
│ jenkins/jenkins:lts-jdk21│  low-privilege │ JDK 21 · Maven · Node 24    │ :2376    │ isolated daemon          │
│ 0 executors, no Docker   │  agent user    │ Docker CLI · gitleaks · trivy│          │ Testcontainers + e2e stack│
└──────────────────────────┘                └─────────────────────────────┘          └──────────────────────────┘
        your Docker Desktop containers (PayFlow stack on 3000/8080/5433) are never visible to any of the above
```

**Why this shape**

- The controller runs no builds and has no Docker access. Build code runs only on the agent.
- The agent's Docker commands go to a separate **Docker-in-Docker** daemon over mutual TLS, so Testcontainers and the end-to-end stack run in a sandbox. Your host Docker socket is never mounted anywhere, and builds cannot see, stop or modify your own `payflow-*` containers or volumes. The DinD container is `privileged` (dockerd requires it); that privilege is confined to that daemon.
- The agent authenticates with a user that can only connect agents (`Overall/Read` + `Agent/Connect`). The admin password never enters the agent's environment.
- Jenkins is published on `127.0.0.1:8081` only. Ports 3000 and 8080 are not used.

## 1. Prerequisites

| Need | Check |
|---|---|
| macOS with Docker Desktop (Apple Silicon or Intel; all images are multi-arch) | `docker info` |
| Free port 8081 | `lsof -nP -iTCP:8081 -sTCP:LISTEN` prints nothing |
| `openssl`, `rsync` (preinstalled on macOS) | `openssl version` |
| About 10 GB free in Docker's disk image for the first run (images, Maven and npm caches, the end-to-end stack build) | Docker Desktop → Settings → Resources, or `docker system df` |

Docker Desktop's disk image can fill up. If a run fails with "no space left on device" or Docker turns read-only, run `docker builder prune` (safe: build cache only) and retry.

## 2. Install Jenkins

```bash
cd infrastructure/jenkins

# Creates .env (mode 600, git-ignored) with generated passwords. Never overwrites an existing .env.
./bootstrap.sh https://github.com/<owner>/<repo>.git

docker compose up -d --build        # first build downloads images and plugins: allow about 5 minutes
```

`bootstrap.sh` checks that Docker is running and port 8081 is free. The URL you pass is the repository Jenkins builds (see [GitHub](#6-github-integration) for what that repository must contain). Open **http://localhost:8081**.

Stop and start later with `docker compose stop` / `docker compose up -d`. Build history and configuration live in the `payflow-jenkins_jenkins_home` volume and survive restarts. `docker compose down -v` deletes everything, including history.

### Without GitHub (local demo or before the project is pushed)

```bash
cd infrastructure/jenkins
./make-local-repo.sh                      # bare repo from your working tree; your project folder is not modified
./bootstrap.sh /srv/payflow.git           # or edit PAYFLOW_GIT_URL in .env
docker compose -f docker-compose.yml -f docker-compose.local-repo.yml up -d --build
```

Re-run `./make-local-repo.sh` to publish your latest working tree to Jenkins (it updates the repo in place). The override also enables the Git plugin's local-checkout switch, which is off by default for safety and is not set in the normal configuration.

## 3. Initial administrator setup

There is no setup wizard. Everything is configured from `casc/jenkins.yaml` (Configuration as Code).

- User: `admin`
- Password: the `JENKINS_ADMIN_PASSWORD` line in `infrastructure/jenkins/.env`. (`grep JENKINS_ADMIN_PASSWORD infrastructure/jenkins/.env`.)
- Anonymous users can see only the login page. Self sign-up is off. CSRF protection is on.

To rotate the password, edit `.env` and run `docker compose up -d` (the controller recreates and re-reads it).

## 4. Plugins

Installed at image build time from `controller/plugins.txt`, at the versions compatible with the LTS core:

| Plugin | Used for |
|---|---|
| `workflow-aggregator` (Pipeline), `pipeline-stage-view` | Declarative pipeline and the stage view |
| `git`, `github`, `github-branch-source` | Checkout, GitHub push webhook, multibranch and pull-request builds |
| `credentials-binding`, `plain-credentials` | Injecting and masking secrets (the optional sandbox smoke stage) |
| `junit` | Test result publishing |
| `ws-cleanup` | `cleanWs()` after every build |
| `timestamper`, `ansicolor`, `build-timeout` | Log timestamps, colours, the 75-minute build timeout |
| `htmlpublisher`, `coverage` | HTML coverage report and Cobertura coverage trend for the frontend. If the controller image was built before they were added, rebuild it (`docker compose build controller`); until then the pipeline logs a warning and still archives the reports |
| `nodejs` | Installed as requested. Node 24 is baked into the build agent image, so no NodeJS tool installation is configured |
| `configuration-as-code`, `job-dsl`, `matrix-auth` | Declarative configuration, the job definition, and the permission model |

`docker-workflow` (Docker Pipeline) is intentionally not installed: the agent is a long-lived container with its tools baked in, so pipeline steps never need `docker.image(...).inside`.

## 5. Build agent

`agent/Dockerfile` builds `payflow-agent` on `jenkins/inbound-agent:latest-jdk21`:

| Tool | Version | Source |
|---|---|---|
| JDK | 21 | base image (the pipeline fails fast on any other major version) |
| Maven | 3.9.11 | copied from `maven:3.9.11-eclipse-temurin-21`, the same as `backend/Dockerfile` |
| Node / npm | 22 / 10 | copied from `node:22-bookworm-slim` |
| Docker CLI + compose | 27 | copied from `docker:27-cli`; pointed at the isolated daemon |
| gitleaks / trivy | 8.28.0 / 0.69.3 | downloaded per architecture and checked against the published SHA-256 sums at build time |

The agent keeps Maven (`agent_m2`), npm (`agent_npm`) and Trivy database (`agent_cache`) caches in volumes, so repeat builds are much faster. The isolated daemon's image cache is in `dind_data`.

It connects over a websocket using the `payflow-agent` user; `entrypoint.sh` fetches the node secret with that low-privilege account and then unsets the password. Testcontainers needs no extra setup: `DOCKER_HOST`, TLS certificates and `TESTCONTAINERS_HOST_OVERRIDE=docker` are preset in the image.

## 6. GitHub integration

> **Read this first.** At the time of writing, the folder `frontend/` is its own git repository (remote `PayFlow-Acceptance-Solution`, branch `master`) and the project root has no `.git`. That GitHub repository therefore contains **only the frontend**: no `backend/`, no `Jenkinsfile`, no `.github/workflows`. The pipeline builds the whole platform and its Checkout stage fails with a clear message if `backend/` or `frontend/` is missing, so it cannot run against that repository as it is.
>
> To publish the whole platform from the project root: first move the nested repository out of the way (`mv frontend/.git /somewhere/frontend.git-backup`; otherwise `git add` records `frontend` as an opaque embedded repository and the pipeline would see no frontend files), then `git init -b main`, `git add -A`, commit, add your remote and push. Check `git ls-files | grep -c '^backend/'` is not 0 before pushing. `.gitignore` already excludes `.env`, `node_modules`, build output and coverage.

**Single-branch job (configured automatically).** The job `PayFlow - CI Pipeline` reads `PAYFLOW_GIT_URL` and `PAYFLOW_GIT_BRANCH` (default `*/main`) from `infrastructure/jenkins/.env`. For a private repository, create a *Username with password* credential in Jenkins (Manage Jenkins → Credentials; the password is a GitHub personal access token with `repo` read access), put its ID in `PAYFLOW_GIT_CREDENTIALS_ID`, and run `docker compose up -d`.

**Triggers.** The job has both the GitHub push trigger and an SCM poll every 15 minutes. GitHub cannot reach `localhost`, so push webhooks need a tunnel (for example `ngrok http 8081`) and a webhook to `https://<tunnel>/github-webhook/` with content type `application/json`; without it, polling still picks up changes within 15 minutes.

**Pull requests and branches (manual, not verified here).** The Jenkinsfile is multibranch-ready (it uses `BRANCH_NAME`, `CHANGE_ID` and `CHANGE_BRANCH`). In Jenkins create a *Multibranch Pipeline*, add a *GitHub* branch source with your credential, and keep the script path `Jenkinsfile`. It will then build every branch and pull request. This part needs your GitHub credentials and was not exercised in this environment.

**GitHub Actions** (`.github/workflows/checks.yml`) is untouched and keeps running its own checks. Neither system deploys anything, so there is no duplicated deployment.

## 7. The Jenkinsfile

It runs on the `payflow-agent` node and fails at the first red stage.

| # | Stage | What it does | Failing means |
|---|---|---|---|
| 1 | **Checkout** | Cleans the workspace, `checkout scm`, records branch and commit (shown in the build name), verifies `backend/` and `frontend/` exist | repo unreachable or incomplete |
| | Tooling and Docker preflight | Requires Java 21 and Node 24 (matching `frontend/.nvmrc`), and a reachable isolated Docker daemon | wrong tools or no Docker for integration tests |
| 2 | **Backend Build** | `mvn validate dependency:resolve`, then `clean package -DskipTests` | dependency or compile error |
| 3 | **Backend Unit Tests** | `mvn test -Dtest='!*IntegrationTest'`: JUnit 5 and Mockito, no external services | a failing unit test |
| 4 | **Backend Integration Tests** | `mvn test -Dtest='*IntegrationTest'`: PostgreSQL 17 via Testcontainers in the isolated daemon; Visa gateway mocked | a failing integration test |
| 5 | **Frontend Install** | `npm ci` from the committed `package-lock.json` (never `npm init` or `npm install`) | lockfile out of sync |
| 6 | **Frontend Quality Checks** | `tsc --noEmit` and ESLint | type or lint failure |
| | **Frontend Unit Tests** | `npm run test:ci`: Vitest (unit, React component/jsdom, API client, notifications, payment UI, hydration, server routes) with coverage and JUnit XML. Publishes the JUnit results, an HTML coverage report and a Cobertura coverage trend, and archives `frontend/reports` and `frontend/coverage` **even when tests fail**. Then `verify_reports.py` fails the build if fewer than 140 tests ran, any test was skipped, an essential test file is missing, or a coverage report (lcov, Cobertura, HTML, summary) is absent. Vitest itself exits non-zero on unhandled errors | failing test, unhandled error, or missing report |
| 7 | **Frontend Production Build** | `npm run build` (Next.js compile and type check) | build error |
| | **End-to-End (isolated stack)** | Builds PostgreSQL + backend + frontend in the isolated daemon and runs `e2e_payment_flow.py`; always tears the stack down. Skippable with `RUN_E2E=false` | a broken flow |
| 8 | **Security Checks** | `repo-hygiene.sh`, gitleaks on history and on this build's own reports, Trivy on `pom.xml` and `package-lock.json` | see below |
| | Visa Sandbox Smoke (optional) | Off by default (`RUN_SANDBOX_SMOKE`); see below | only runs when you ask |
| 9 | **Coverage and Reports** | `jacoco:report`, coverage gate, archives the jar, coverage and reports | missing coverage data |
| 10 | **Build Result** | Final status | |

**Result policy**

- **SUCCESS**: every required stage ran and passed.
- **UNSTABLE**: everything required passed, but line coverage is below `BACKEND_COVERAGE_MIN` / `FRONTEND_COVERAGE_MIN` (build parameters; defaults 40% and 50%), or Trivy found fixable HIGH/CRITICAL vulnerabilities.
- **FAILURE**: any build, test or scan step failed, **or tests did not really run**. `infrastructure/ci/verify_reports.py` reads the JUnit XML after each test stage and fails the build if no report exists, fewer than the minimum number of tests ran, any test was skipped, or a required test class never executed. A test runner that exits 0 after running nothing therefore cannot produce a green build.

**Security checks in detail**

- `repo-hygiene.sh`: no `.env` file is tracked; `.env`, `infrastructure/jenkins/.env` and `frontend/.env` are git-ignored; no key or keystore files are tracked.
- gitleaks on the repository history (default rules plus `.gitleaks.toml`). The only allowlisted value is the documented local demo API key `local-only-change-me`; any other key, token or password is still reported.
- gitleaks on the build's own reports and logs (`infrastructure/ci/gitleaks-logs.toml`), so a leaked key cannot hide in an archived artifact. It keeps every built-in provider rule (private keys, cloud, GitHub and Slack tokens, JWTs) and adds explicit rules for a Visa shared secret and a Visa key ID. It switches off only the entropy-based `generic-api-key` rule, because that rule flags the line `Using generated security password: <random>` that Spring Boot prints on every start. That is a throwaway in-memory account that cannot sign in (form login and HTTP basic are disabled; the API uses keys). If you would rather not log it at all, define a `UserDetailsService` or exclude `UserDetailsServiceAutoConfiguration`; that is an application change, so it was left alone.
- Trivy: HIGH/CRITICAL vulnerabilities with a fix available (`--ignore-unfixed`), production dependencies only (development-only npm packages are not scanned). Exit code 5 maps to UNSTABLE; a scan that could not run (for example the vulnerability database could not be downloaded) fails the build. It is never reported as clean.
- Routine stages contain no Visa credentials at all. The Visa gateway is mocked, and the end-to-end stack runs with Visa disabled.

**Optional Visa sandbox smoke stage.** Run *Build with Parameters* and tick `RUN_SANDBOX_SMOKE`. It needs three *Secret text* credentials with these exact IDs: `payflow-visa-merchant-id`, `payflow-visa-key-id`, `payflow-visa-shared-secret`. It starts the isolated stack with those values and makes two real sandbox calls (one authorization, one capture, plus status lookups) via `scripts_visa_live_smoke.py`. Jenkins masks the values in the log. It is a smoke test, never a load test, and it is excluded from every routine build. This stage was not executed here because it needs your sandbox credentials.

## 8. Running the pipeline

- **Manually**: open **PayFlow - CI Pipeline** → **Build Now**. After the first run the button becomes **Build with Parameters** (`RUN_E2E`, `RUN_SANDBOX_SMOKE`, the two coverage minimums). Note: restarting the controller regenerates the job and clears registered parameters until the next run; the Jenkinsfile defaults still apply.
- **From a push**: with a webhook or the 15-minute poll (see GitHub above).
- **From the command line** (with the admin password from `.env`):
  ```bash
  set -a; . infrastructure/jenkins/.env; set +a
  CJ=$(mktemp); CRUMB=$(curl -s -c $CJ -u admin:$JENKINS_ADMIN_PASSWORD http://127.0.0.1:8081/crumbIssuer/api/json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['crumbRequestField']+':'+d['crumb'])")
  JOB="http://127.0.0.1:8081/job/PayFlow%20-%20CI%20Pipeline"
  # A parameterized job is triggered with /buildWithParameters (defaults apply); the very first run, before parameters are registered, uses /build.
  curl -sf -b $CJ -u admin:$JENKINS_ADMIN_PASSWORD -H "$CRUMB" -X POST "$JOB/buildWithParameters" || curl -s -b $CJ -u admin:$JENKINS_ADMIN_PASSWORD -H "$CRUMB" -X POST "$JOB/build"
  ```
- **Validate a Jenkinsfile edit without running it**: `curl -b $CJ -u admin:$JENKINS_ADMIN_PASSWORD -H "$CRUMB" -X POST -F "jenkinsfile=<Jenkinsfile" http://127.0.0.1:8081/pipeline-model-converter/validate` → "Jenkinsfile successfully validated."

## 9. Reading the results

On the job page: the **Stage View** shows each stage's duration and status; the build name is `#<n> <commit>` and its description is `branch @ commit: message`.

| Where | What |
|---|---|
| Build → **Test Result** | Pass/fail counts, per-class results and durations from JUnit (backend unit, backend integration, frontend, end-to-end) |
| Build → **Console Output** | Full timestamped log, coloured |
| Build → **Pipeline Steps** / **Stage Logs** | The log of one stage |
| Build → **Build Artifacts** | `payflow-api-*.jar`, JaCoCo HTML (`backend/target/site/jacoco/index.html`), frontend coverage (`frontend/coverage/index.html`), `reports/` (JUnit XML, dependency scan, gitleaks reports, end-to-end stack log) |

Each test stage also prints its own summary table (suites, tests, failures, skipped), so the numbers are visible in the console without opening a report.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `bootstrap.sh`: "Port 8081 is already in use" | Another app holds 8081. Stop it, or change the host port in `docker-compose.yml` (`127.0.0.1:8081:8080`) and use it consistently. |
| Controller keeps restarting, log says `ConfiguratorException` / `UnknownAttributesException` | A mistake in `casc/jenkins.yaml`. `docker logs payflow-jenkins-jenkins-1 2>&1 \| grep -E "SEVERE\|Exception"` names the offending key. |
| Agent stays offline | `docker compose logs agent`. Usually the controller was not ready; `docker compose restart agent`. Make sure `.env` still has `JENKINS_AGENT_PASSWORD` and that it matches what the controller started with (recreate both after editing `.env`: `docker compose up -d`). |
| Build fails at Checkout: "references a local directory, which may be insecure" | You pointed `PAYFLOW_GIT_URL` at a local path without the local-repo override. Use the GitHub URL, or run with `-f docker-compose.local-repo.yml`. |
| Build fails at Checkout: "Missing backend/pom.xml…" | The repository does not contain the full platform (see the GitHub section). |
| `fatal: repository '/srv/payflow.git' does not exist` | The local repo mount went stale. Re-run `./make-local-repo.sh`, then `docker compose restart jenkins agent`. |
| "Java 21 is required" / "Node 24 is required" | The agent image was changed or not rebuilt. `docker compose build agent && docker compose up -d agent`. |
| Preflight: Docker daemon not reachable; Testcontainers "Could not find a valid Docker environment" | The DinD container is not running or its certificates changed. `docker compose up -d docker agent`; if it persists, `docker compose restart docker agent`. |
| Integration tests very slow the first time | PostgreSQL and Testcontainers' helper images are pulled into the isolated daemon once; they are cached in `dind_data`. |
| `[ERROR] Surefire is going to kill self fork JVM…` in the log | Cosmetic. Cached Spring test contexts keep connection-pool housekeeping threads alive after the test database stops, so the forked JVM takes 30 s to exit. Results are unaffected. |
| Frontend stage: "Dependencies lock file is not in sync" | `package.json` and `package-lock.json` disagree. Run `npm install` locally, commit both. |
| End-to-end stage fails to start the stack | Open the archived `reports/e2e/stack.log`. Also check free disk (`docker system df`). |
| Security: gitleaks "leaks found" | The log prints rule, file and line (values redacted). Remove the secret and rotate it. If it is a documented demo value, allowlist that exact value in `.gitleaks.toml`. |
| Security: dependency scan "FAILED to run" | The Trivy database could not be downloaded (network or registry rate limit). Retry; the build is intentionally not allowed to pass without it. |
| UNSTABLE with "Line coverage is below the configured threshold" | Add tests, or lower the parameter for that run. |
| "no space left on device", or Docker went read-only | `docker system df`, then `docker builder prune`. Increase the Docker Desktop disk image if it is small. |

## What was and was not verified

Run on this machine (Apple Silicon, Docker Desktop) against a snapshot of the project, built with `make-local-repo.sh`:

- Jenkins started at `http://localhost:8081`; all plugins in the table installed; the agent connected with JDK 21, Maven, Node 24, the isolated Docker daemon, gitleaks and trivy; the controller has 0 executors; anonymous access, and the agent user's access to the admin console, return 403.
- The Jenkinsfile passed Jenkins' declarative linter, and the pipeline ran end to end: @@RESULT@@
- Negative controls: gitleaks and `repo-hygiene.sh` fail on planted secrets, a committed `.env` and a key file; `verify_reports.py` fails when no reports exist or a required test class did not run.

Not verified because they need things only you have: pulling from your GitHub repository (the repository holding only the frontend, see above), webhook delivery, multibranch pull-request builds, private-repository credentials, and the optional Visa sandbox smoke stage.
