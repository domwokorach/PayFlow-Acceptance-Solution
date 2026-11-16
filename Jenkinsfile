// PayFlow CI pipeline (declarative). Runs on the dedicated `payflow-agent` build agent: JDK 21, Maven, Node 22, Docker CLI.
// Docker access goes to an isolated Docker-in-Docker daemon (see infrastructure/jenkins), never to the host's Docker.
//
// Result policy
//   SUCCESS   every required stage ran and passed, and the test reports prove the essential tests executed
//   UNSTABLE  everything required passed, but a quality gate was missed: coverage below threshold, or fixable HIGH/CRITICAL
//             dependency vulnerabilities
//   FAILURE   a build, test, security or verification step failed, or tests that must run did not run
//
// Nothing here deploys. GitHub Actions (.github/workflows/checks.yml) keeps running the same checks independently.

pipeline {
  agent { label 'payflow-agent' }

  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timeout(time: 75, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
  }

  parameters {
    booleanParam(name: 'RUN_E2E', defaultValue: true,
      description: 'Run the end-to-end flow against an isolated stack (simulator provider only, throwaway database).')
    booleanParam(name: 'RUN_SANDBOX_SMOKE', defaultValue: false,
      description: 'OPTIONAL. Makes two real calls to the Visa SANDBOX (authorize + capture). Needs the credentials payflow-visa-merchant-id, payflow-visa-key-id and payflow-visa-shared-secret in Jenkins. Never a load test.')
    string(name: 'BACKEND_COVERAGE_MIN', defaultValue: '40', description: 'Minimum backend line coverage (%). Below this the build is UNSTABLE.')
    string(name: 'FRONTEND_COVERAGE_MIN', defaultValue: '50', description: 'Minimum frontend line coverage (%). Below this the build is UNSTABLE.')
  }

  environment {
    CI = 'true'
    NEXT_TELEMETRY_DISABLED = '1'
    MVN = 'mvn -B -ntp -f backend/pom.xml -Pci'
  }

  stages {

    // ------------------------------------------------------------------ 1
    stage('Checkout') {
      steps {
        cleanWs()
        script {
          try {
            checkout scm
          } catch (err) {
            error "Checkout failed: ${err.message}. Check PAYFLOW_GIT_URL, the branch and any Git credentials."
          }
          env.GIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
          env.GIT_BRANCH_NAME = env.CHANGE_BRANCH ?: env.BRANCH_NAME ?: sh(returnStdout: true, script: 'git rev-parse --abbrev-ref HEAD').trim()
          def subject = sh(returnStdout: true, script: 'git log -1 --pretty=%s').trim()
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.GIT_SHORT}"
          currentBuild.description = "${env.GIT_BRANCH_NAME} @ ${env.GIT_SHORT}: ${subject}"
          echo "Branch: ${env.GIT_BRANCH_NAME}${env.CHANGE_ID ? ' (pull request #' + env.CHANGE_ID + ')' : ''}"
          echo "Commit: ${env.GIT_SHORT}: ${subject}"
        }
        // The pipeline builds the whole platform. A checkout that only has a subfolder must fail loudly, not "succeed" on nothing.
        sh '''
          for f in backend/pom.xml frontend/package.json frontend/package-lock.json infrastructure/ci/e2e.sh; do
            [ -f "$f" ] || { echo "Missing $f: the repository root must be the full PayFlow platform (backend/ and frontend/)." >&2; exit 1; }
          done
        '''
      }
    }

    stage('Tooling and Docker preflight') {
      steps {
        sh '''
          set -eu
          java -version 2>&1 | head -1
          java -version 2>&1 | grep -q '"21\\.' || { echo "Java 21 is required" >&2; exit 1; }
          mvn -v | head -1
          node -v | grep -q '^v22\\.' || { echo "Node 22 is required (found $(node -v))" >&2; exit 1; }
          echo "npm $(npm -v)"
          echo "Docker daemon (isolated): $(docker version --format '{{.Server.Version}} on {{.Server.Os}}/{{.Server.Arch}}')"
          docker info --format 'Containers on this daemon: {{.Containers}} (it is not the host Docker)'
        '''
      }
    }

    // ------------------------------------------------------------------ 2
    stage('Backend Build') {
      steps {
        sh '''
          $MVN validate dependency:resolve
          $MVN -DskipTests clean package
        '''
      }
    }

    // ------------------------------------------------------------------ 3
    stage('Backend Unit Tests') {
      steps {
        sh '''
          rm -rf backend/target/surefire-reports reports/backend-unit && mkdir -p reports/backend-unit
          # Unit tests: JUnit 5 + Mockito, no external services.
          $MVN test -Dtest='!*IntegrationTest' -Dsurefire.failIfNoSpecifiedTests=false
          cp backend/target/surefire-reports/*.xml reports/backend-unit/
        '''
      }
      post {
        always {
          junit testResults: 'reports/backend-unit/*.xml', allowEmptyResults: false
          sh '''python3 infrastructure/ci/verify_reports.py --label "Backend unit" --dir reports/backend-unit --min-tests 40 \
                  --require PaymentPolicyTest,IdempotencyTest,MerchantServiceTest,RequestValidationTest,VisaAcceptanceGatewayTest,VisaJwtSignerTest'''
        }
      }
    }

    // ------------------------------------------------------------------ 4
    stage('Backend Integration Tests') {
      steps {
        sh '''
          rm -rf backend/target/surefire-reports reports/backend-integration && mkdir -p reports/backend-integration
          # Testcontainers starts PostgreSQL 17 inside the isolated Docker-in-Docker daemon. The Visa gateway is mocked:
          # nothing in this stage can reach Visa, and no load is ever generated against a provider.
          $MVN test -Dtest='*IntegrationTest' -Dsurefire.failIfNoSpecifiedTests=false
          cp backend/target/surefire-reports/*.xml reports/backend-integration/
        '''
      }
      post {
        always {
          junit testResults: 'reports/backend-integration/*.xml', allowEmptyResults: false
          sh '''python3 infrastructure/ci/verify_reports.py --label "Backend integration" --dir reports/backend-integration --min-tests 30 \
                  --require MerchantIsolationIntegrationTest,VisaPaymentWorkflowIntegrationTest,PaymentEventsIntegrationTest,SseStreamIntegrationTest,MerchantApiIntegrationTest'''
        }
      }
    }

    // ------------------------------------------------------------------ 5
    stage('Frontend Install') {
      steps {
        // npm ci installs exactly what package-lock.json pins. It never edits package.json or the lockfile.
        dir('frontend') { sh 'npm ci --no-audit --no-fund' }
      }
    }

    // ------------------------------------------------------------------ 6
    stage('Frontend Quality Checks') {
      steps {
        dir('frontend') {
          sh '''
            npm run typecheck
            npm run lint:eslint
            rm -rf reports coverage
            # Vitest: unit, React component (jsdom), API client, notification behaviour, payment UI interactions, hydration.
            npm run test:ci
          '''
        }
      }
      post {
        always {
          junit testResults: 'frontend/reports/junit.xml', allowEmptyResults: false
          sh '''python3 infrastructure/ci/verify_reports.py --label "Frontend" --dir frontend/reports --min-tests 80 \
                  --require notification-utils,notifications-ui,payment-ui,hydration,merchants,live,countup,contrast'''
        }
      }
    }

    // ------------------------------------------------------------------ 7
    stage('Frontend Production Build') {
      steps {
        dir('frontend') { sh 'npm run build' }
      }
    }

    stage('End-to-End (isolated stack)') {
      when { expression { return params.RUN_E2E } }
      steps {
        // Builds backend + frontend + PostgreSQL inside the isolated daemon, runs the flow, always tears the stack down.
        sh 'infrastructure/ci/e2e.sh'
      }
      post {
        always {
          junit testResults: 'reports/e2e/junit.xml', allowEmptyResults: true
          archiveArtifacts artifacts: 'reports/e2e/**', allowEmptyArchive: true
          script {
            if (params.RUN_E2E) {
              sh 'python3 infrastructure/ci/verify_reports.py --label "End-to-end" --dir reports/e2e --min-tests 10'
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------ 8
    stage('Security Checks') {
      steps {
        // Policy: .env files are neither tracked nor un-ignored; no key material is committed.
        sh 'infrastructure/ci/repo-hygiene.sh .'
        // Secrets in the repository and its history, and in this build's own reports and logs (so a leaked key cannot hide in an artifact).
        sh '''
          mkdir -p reports
          gitleaks git --no-banner --redact --exit-code 1 --report-format json --report-path reports/gitleaks-history.json .
          # Logs and reports use a focused config (see infrastructure/ci/gitleaks-logs.toml): provider tokens, private keys and Visa secrets.
          rc=0
          for d in reports backend/target/surefire-reports frontend/reports; do
            [ -d "$d" ] || continue
            n=$(echo "$d" | tr '/' '-')
            gitleaks dir --no-banner --redact --exit-code 1 --config infrastructure/ci/gitleaks-logs.toml \\
              --report-format json --report-path "reports/gitleaks-logs-$n.json" "$d" || {
                rc=1
                python3 -c "import json,sys; [print('  LEAK', f['RuleID'], f['File'], 'line', f['StartLine']) for f in json.load(open(sys.argv[1]))]" "reports/gitleaks-logs-$n.json"
              }
          done
          exit $rc
        '''
        script {
          // Known-vulnerable dependencies. Findings make the build UNSTABLE; a scan that could not run fails it.
          def rc = sh(returnStatus: true, script: 'infrastructure/ci/dependency-scan.sh .')
          if (rc == 5) { unstable('Fixable HIGH/CRITICAL dependency vulnerabilities found (reports/dependency-scan.txt)') }
          else if (rc != 0) { error('The dependency scan could not run; the build cannot be called secure') }
        }
      }
    }

    stage('Visa Sandbox Smoke (optional)') {
      when { expression { return params.RUN_SANDBOX_SMOKE } }
      steps {
        // Opt-in only. Credentials come from the Jenkins credential store and are masked in the log.
        withCredentials([
          string(credentialsId: 'payflow-visa-merchant-id', variable: 'PAYFLOW_VISA_MERCHANT_ID'),
          string(credentialsId: 'payflow-visa-key-id', variable: 'PAYFLOW_VISA_KEY_ID'),
          string(credentialsId: 'payflow-visa-shared-secret', variable: 'PAYFLOW_VISA_SHARED_SECRET')
        ]) {
          sh 'PAYFLOW_VISA_ENABLED=true E2E_RUN=smoke infrastructure/ci/e2e.sh'
        }
      }
    }

    // ------------------------------------------------------------------ 9
    stage('Coverage and Reports') {
      steps {
        sh '$MVN jacoco:report'
        script {
          // Parameters are user input: only plain numbers (0-100, optional decimals) may reach a shell.
          def backendMin = params.BACKEND_COVERAGE_MIN.trim()
          def frontendMin = params.FRONTEND_COVERAGE_MIN.trim()
          [backendMin, frontendMin].each { v -> if (!(v ==~ /\d{1,3}(\.\d{1,2})?/)) { error("Coverage thresholds must be plain numbers, got '${v}'") } }
          def rc = sh(returnStatus: true, script: """
            python3 infrastructure/ci/coverage_gate.py \\
              --jacoco backend/target/site/jacoco/jacoco.csv --jacoco-min ${backendMin} \\
              --vitest frontend/coverage/coverage-summary.json --vitest-min ${frontendMin}
          """)
          if (rc == 3) { unstable('Line coverage is below the configured threshold') }
          else if (rc != 0) { error('Coverage reports are missing: tests did not produce coverage data') }
        }
        archiveArtifacts artifacts: 'backend/target/payflow-api-*.jar', fingerprint: true
        archiveArtifacts artifacts: 'backend/target/site/jacoco/**, frontend/coverage/**, reports/**', allowEmptyArchive: true
      }
    }

    // ------------------------------------------------------------------ 10
    stage('Build Result') {
      steps {
        script {
          echo "Result so far: ${currentBuild.currentResult} (SUCCESS only if every required stage passed and the test reports proved the essential tests ran)."
          echo 'Test counts: build page > Test Result. Coverage: build artifacts > backend/target/site/jacoco and frontend/coverage.'
        }
      }
    }
  }

  post {
    success  { echo "SUCCESS: every required stage ran and passed (${env.GIT_BRANCH_NAME} @ ${env.GIT_SHORT})." }
    unstable { echo "UNSTABLE: required checks passed, but a quality gate was missed. See the stage marked unstable above." }
    failure  { echo "FAILURE: a required stage failed or essential tests did not run. See the first red stage." }
    // Reports are most useful when the build failed, so they are archived on every outcome, before the workspace is wiped.
    always   { archiveArtifacts artifacts: 'reports/**, frontend/reports/**, backend/target/surefire-reports/**', allowEmptyArchive: true }
    cleanup  { cleanWs(deleteDirs: true, notFailBuild: true) }
  }
}
