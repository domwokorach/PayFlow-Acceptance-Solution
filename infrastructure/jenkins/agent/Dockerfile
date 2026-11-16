# PayFlow build agent: JDK 21 + Maven + Node 22 + Docker CLI, connecting to the controller as an inbound (websocket) agent.
# Multi-arch: every base image below publishes linux/arm64 and linux/amd64.
FROM maven:3.9.11-eclipse-temurin-21 AS maven
FROM node:22-bookworm-slim AS node
FROM docker:27-cli AS dockercli

FROM jenkins/inbound-agent:latest-jdk21
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 curl jq ca-certificates unzip \
 && rm -rf /var/lib/apt/lists/*

# Maven (same version the backend Dockerfile builds with)
COPY --from=maven /usr/share/maven /usr/share/maven
RUN ln -s /usr/share/maven/bin/mvn /usr/local/bin/mvn
ENV MAVEN_HOME=/usr/share/maven

# Node.js + npm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Docker CLI + compose plugin. They talk to the isolated Docker-in-Docker daemon (see DOCKER_HOST), never to the host's Docker.
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Security scanners, downloaded for the build architecture and verified against the published checksums.
#   gitleaks: secrets in the repository and its history.  trivy: known-vulnerable dependencies (pom.xml, package-lock.json).
ARG TARGETARCH
ARG GITLEAKS_VERSION=8.28.0
ARG TRIVY_VERSION=0.69.3
RUN set -eux; \
    case "${TARGETARCH:-$(dpkg --print-architecture)}" in amd64) GL=x64; TV=64bit;; arm64) GL=arm64; TV=ARM64;; *) echo "unsupported arch" >&2; exit 1;; esac; \
    cd /tmp; \
    curl -fsSLO "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL}.tar.gz"; \
    curl -fsSLO "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"; \
    grep " gitleaks_${GITLEAKS_VERSION}_linux_${GL}.tar.gz\$" "gitleaks_${GITLEAKS_VERSION}_checksums.txt" | sha256sum -c -; \
    tar -xzf "gitleaks_${GITLEAKS_VERSION}_linux_${GL}.tar.gz" -C /usr/local/bin gitleaks; \
    curl -fsSLO "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TV}.tar.gz"; \
    curl -fsSLO "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_checksums.txt"; \
    grep " trivy_${TRIVY_VERSION}_Linux-${TV}.tar.gz\$" "trivy_${TRIVY_VERSION}_checksums.txt" | sha256sum -c -; \
    tar -xzf "trivy_${TRIVY_VERSION}_Linux-${TV}.tar.gz" -C /usr/local/bin trivy; \
    rm -f /tmp/*.tar.gz /tmp/*checksums.txt; \
    gitleaks version; trivy --version

COPY entrypoint.sh /usr/local/bin/payflow-agent-entrypoint
RUN chmod +x /usr/local/bin/payflow-agent-entrypoint \
 && mkdir -p /home/jenkins/.m2 /home/jenkins/.npm /home/jenkins/.cache/trivy /home/jenkins/agent \
 && chown -R jenkins:jenkins /home/jenkins

USER jenkins
ENV DOCKER_HOST=tcp://docker:2376 \
    DOCKER_TLS_VERIFY=1 \
    DOCKER_CERT_PATH=/certs/client \
    TESTCONTAINERS_HOST_OVERRIDE=docker \
    MAVEN_CONFIG=/home/jenkins/.m2 \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true
ENTRYPOINT ["/usr/local/bin/payflow-agent-entrypoint"]
