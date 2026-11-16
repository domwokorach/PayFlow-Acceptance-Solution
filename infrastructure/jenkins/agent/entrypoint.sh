#!/bin/sh
# Waits for the controller, fetches this node's connection secret with the low-privilege agent user, then starts the agent.
# That user can only connect agents. The admin password is never present in this container.
set -eu
: "${JENKINS_URL:?}" "${JENKINS_AGENT_NAME:?}" "${JENKINS_AGENT_USER:?}" "${JENKINS_AGENT_PASSWORD:?}"

echo "Waiting for ${JENKINS_URL} ..."
i=0
until curl -fsS -o /dev/null "${JENKINS_URL}/login"; do
  i=$((i + 1)); [ "$i" -gt 90 ] && { echo "Controller did not become ready" >&2; exit 1; }
  sleep 2
done

JNLP="${JENKINS_URL}/computer/${JENKINS_AGENT_NAME}/jenkins-agent.jnlp"
i=0
SECRET=""
while [ -z "$SECRET" ]; do
  SECRET=$(curl -fsS -u "${JENKINS_AGENT_USER}:${JENKINS_AGENT_PASSWORD}" "$JNLP" 2>/dev/null | sed -n 's:.*<argument>\([0-9a-f]\{64\}\)</argument>.*:\1:p' | head -n1 || true)
  [ -n "$SECRET" ] && break
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "Could not read the agent secret for ${JENKINS_AGENT_NAME}" >&2; exit 1; }
  sleep 2
done

export JENKINS_SECRET="$SECRET" JENKINS_WEB_SOCKET=true
unset JENKINS_AGENT_PASSWORD   # not needed after this point; keeps it out of build environments
exec /usr/local/bin/jenkins-agent
