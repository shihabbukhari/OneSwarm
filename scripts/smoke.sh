#!/usr/bin/env bash
# Backend smoke test: server + bridge + mock agent over a temporary in-process Postgres.
# Usage: scripts/smoke.sh   (after `pnpm build`)
set -uo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
PORT=${SMOKE_PORT:-4998}
URL=http://localhost:$PORT
J=$TMP/jar
cleanup() { [ -n "${KEEP:-}" ] && cat "$TMP/srv.log"; kill "${SRV:-}" "${BRG:-}" 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT

DATABASE_URL=pglite://$TMP/pg SERVER_PORT=$PORT PUBLIC_SERVER_URL=$URL PUBLIC_WS_URL=ws://localhost:$PORT/ws \
  STORAGE_DIR=$TMP/files node apps/server/dist/index.js >"$TMP/srv.log" 2>&1 &
SRV=$!
for _ in $(seq 1 50); do curl -sf "$URL/api/health" >/dev/null && break; sleep 0.2; done

api() { T=$(grep os_csrf "$J" 2>/dev/null | awk '{print $7}'); curl -s -c "$J" -b "$J" -H "x-csrf-token: ${T:-}" -H 'content-type: application/json' "$@"; }
js() { node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log($1)"; }

api "$URL/api/csrf" >/dev/null
api -d '{"name":"Ann","email":"ann@x.test","password":"password123"}' "$URL/api/auth/signup" >/dev/null
api -d '{"name":"Acme"}' "$URL/api/workspaces" >/dev/null
CODE=$(api -X POST "$URL/api/bridge/pairing-codes" | js d.code)
ONESWARM_HOME=$TMP/home ONESWARM_AGENTS=mock ONESWARM_MOCK_AGENT_CMD="node $PWD/packages/mock-agent/dist/index.js" \
  node packages/bridge/dist/cli.js connect "$CODE" --server "$URL" >"$TMP/bridge.log" 2>&1 &
BRG=$!
sleep 3
B=$(api "$URL/api/bootstrap")
CH=$(echo "$B" | js 'd.channels[0].id')
AG=$(echo "$B" | js 'd.agents[0].id')
echo "agent: $(echo "$B" | js 'd.agents[0].handle+" "+d.agents[0].status+" models="+d.agents[0].configOptions.find(o=>o.category==="model").options.length')"
api -d '{"configId":"model","value":"titan"}' "$URL/api/agents/$AG/config" >/dev/null
sleep 1
echo "model now: $(api "$URL/api/bootstrap" | js 'd.agents[0].configOptions.find(o=>o.id==="model").currentValue')"
api -d '{"body":"@mock hello"}' "$URL/api/channels/$CH/messages" >/dev/null
sleep 2
api -d '{"body":"@mock please edit notes"}' "$URL/api/channels/$CH/messages" >/dev/null
sleep 2
AP=$(api "$URL/api/bootstrap" | js 'd.approvals[0]?.id')
echo "approval: $AP"
api -d '{"decision":"approve"}' "$URL/api/approvals/$AP/decide" >/dev/null
sleep 2
TASK=$(api -d "{\"title\":\"Write release notes\",\"assigneeType\":\"agent\",\"assigneeId\":\"$AG\"}" "$URL/api/tasks" | js d.task.id)
sleep 3
echo "task: $(api "$URL/api/tasks/$TASK" | js 'd.task.status')"
REVIEW=$(api "$URL/api/bootstrap" | js 'd.approvals.find(a=>a.kind==="task_review")?.id')
api -d '{"decision":"approve"}' "$URL/api/approvals/$REVIEW/decide" >/dev/null
sleep 1
echo "task after review: $(api "$URL/api/tasks/$TASK" | js 'd.task.status')"
api "$URL/api/channels/$CH/messages" | js 'd.messages.map(m=>m.authorName+" | "+m.kind+" "+m.status+" | "+m.body.slice(0,90)+" | "+(m.meta.tools||[]).map(t=>t.kind+":"+t.status).join(",")).join("\n")'
echo "--- bridge log"; cat "$TMP/bridge.log"
