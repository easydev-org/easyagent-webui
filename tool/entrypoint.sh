#!/bin/sh
# Fail fast when AGENT_UPSTREAM is not set.
#
# WHY THIS EXISTS: `{$AGENT_UPSTREAM}` in the Caddyfile expands to an EMPTY string when the variable
# is missing. Caddy does not treat that as an error — it starts, serves the SPA from /srv, and
# answers 502 on every /agent.v1.* request. That is the worst shape of failure: the page loads, so
# the container looks healthy, and the breakage appears only when a user tries to log in.
#
# This was real. The Caddyfile used to default the value to a cluster name from whichever
# environment built the image (`standalone-agent.temp.svc.cluster.local`), so a deployment that did
# not set it looked fine and 502'd on every RPC, with the only clue in Caddy's log:
#     dial tcp: lookup standalone-agent.temp.svc.cluster.local: no such host
#
# A container that refuses to start is strictly better: the orchestrator shows a crash loop and the
# message says exactly what is missing — at deploy time rather than at first login.
set -eu

if [ -z "${AGENT_UPSTREAM:-}" ]; then
	echo "FATAL: AGENT_UPSTREAM is not set." >&2
	echo "The webui proxies /agent.v1.* to the agent and has no default upstream." >&2
	echo "Set it to the in-cluster agent service, e.g." >&2
	echo "  AGENT_UPSTREAM=agent.<namespace>.svc.cluster.local:80" >&2
	exit 1
fi

# Same command the official image would run; nothing else changes.
exec /usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
