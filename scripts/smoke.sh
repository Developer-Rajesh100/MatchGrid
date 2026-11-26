#!/usr/bin/env bash
# Post-deploy smoke test for a running MatchGrid stack.
#
#   scripts/smoke.sh <API_URL> <WEB_URL> [--full] [--skip-ratelimit]
#
#   API_URL   e.g. https://matchgrid-api.onrender.com
#   WEB_URL   e.g. https://matchgrid.vercel.app
#   --full    also play a goal over the live socket and upload an image to R2 (creates and then deletes
#             a temporary organizer/tournament; needs SMOKE_ADMIN_USER and SMOKE_ADMIN_PASSWORD)
#   SMOKE_ADMIN_USER / SMOKE_ADMIN_PASSWORD   the bootstrap superadmin (also enables the login check)
#
# Run it from a machine with `curl` and `bun`. Exit code 0 = everything passed.
set -u

API="${1:-}"; WEB="${2:-}"
[ -z "$API" ] || [ -z "$WEB" ] && { sed -n 2,13p "$0"; exit 2; }
shift 2
FULL=0; RATELIMIT=1
for a in "$@"; do
  case "$a" in
    --full) FULL=1 ;;
    --skip-ratelimit) RATELIMIT=0 ;;
    *) echo "unknown option $a"; exit 2 ;;
  esac
done
API="${API%/}"; WEB="${WEB%/}"
FAILED=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILED=$((FAILED + 1)); }
code() { curl -s -o /dev/null -m 60 -w '%{http_code}' "$@"; }   # 60 s covers a Render cold start
body() { curl -s -m 60 "$@"; }
expect() { [ "$2" = "$3" ] && pass "$1" || fail "$1 (got $3, wanted $2)"; }

echo "API  $API"
echo "WEB  $WEB"

echo "Health probes"
expect "GET /health is 200" 200 "$(code "$API/health")"
H="$(body "$API/health")"
case "$H" in *'"status":"ok"'*) pass "/health body is {\"status\":\"ok\"}" ;; *) fail "/health body: $H" ;; esac
expect "GET /health/db is 200" 200 "$(code "$API/health/db")"
D="$(body "$API/health/db")"
case "$D" in *'"status":"connected"'*) pass "/health/db reports connected" ;; *) fail "/health/db body: $D" ;; esac
case "$D" in *collections*) fail "/health/db leaks collection counts" ;; *) pass "/health/db exposes no document counts" ;; esac

echo "Production lockdown"
expect "/docs is disabled" 404 "$(code "$API/docs")"
expect "/openapi.json is disabled" 404 "$(code "$API/openapi.json")"
HDRS="$(curl -sI -m 60 "$API/health")"
echo "$HDRS" | grep -qi '^strict-transport-security' && pass "HSTS header present" || fail "HSTS header missing (is ENVIRONMENT=production?)"
echo "$HDRS" | grep -qi '^x-content-type-options: nosniff' && pass "nosniff header present" || fail "nosniff header missing"

echo "Frontend"
expect "GET / is 200" 200 "$(code "$WEB/")"
expect "deep link /t/smoke-test/matches serves the SPA" 200 "$(code "$WEB/t/smoke-test/matches")"
FH="$(curl -sI -m 60 "$WEB/")"
echo "$FH" | grep -qi '^content-security-policy' && pass "Content-Security-Policy header present" || fail "Content-Security-Policy header missing"
case "$(body "$WEB/")" in *'<div id="root"'*) pass "index.html contains the app root" ;; *) fail "index.html has no #root" ;; esac

echo "CORS"
ACAO="$(curl -s -m 60 -D - -o /dev/null -X OPTIONS "$API/api/tournaments/public" -H "Origin: $WEB" -H 'Access-Control-Request-Method: GET' | tr -d '\r' | grep -i '^access-control-allow-origin' | head -1)"
case "$ACAO" in *"$WEB"*) pass "the frontend origin is allowed" ;; *) fail "frontend origin not allowed: ${ACAO:-no header}" ;; esac
EVIL="$(curl -s -m 60 -D - -o /dev/null -X OPTIONS "$API/api/tournaments/public" -H 'Origin: https://evil.example.invalid' -H 'Access-Control-Request-Method: GET' | tr -d '\r' | grep -i '^access-control-allow-origin' | head -1)"
[ -z "$EVIL" ] && pass "a foreign origin is not allowed" || fail "foreign origin was allowed: $EVIL"
expect "public tournament list loads" 200 "$(code "$API/api/tournaments/public")"

if [ -n "${SMOKE_ADMIN_USER:-}" ] && [ -n "${SMOKE_ADMIN_PASSWORD:-}" ]; then
  echo "Superadmin"
  LOGIN="$(body -X POST "$API/api/auth/login" -H 'content-type: application/json' \
    -d "{\"username\":\"$SMOKE_ADMIN_USER\",\"password\":\"$SMOKE_ADMIN_PASSWORD\"}")"
  TOKEN="$(printf '%s' "$LOGIN" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
  [ -n "$TOKEN" ] && pass "bootstrap superadmin can sign in" || fail "superadmin login failed: $LOGIN"
  [ -n "$TOKEN" ] && expect "superadmin API accepts the token" 200 "$(code "$API/api/superadmin/stats" -H "Authorization: Bearer $TOKEN")"
  expect "superadmin API refuses no token" 401 "$(code "$API/api/superadmin/stats")"
else
  echo "Superadmin: skipped (set SMOKE_ADMIN_USER and SMOKE_ADMIN_PASSWORD to check login)"
fi

echo "Live socket and media"
if [ "$FULL" = 1 ]; then
  bun "$(dirname "$0")/smoke-live.mjs" "$API" "$WEB" --full || FAILED=$((FAILED + 1))
else
  bun "$(dirname "$0")/smoke-live.mjs" "$API" "$WEB" || FAILED=$((FAILED + 1))
  echo "  (add --full to play a goal over the socket and test the R2 upload)"
fi

# Last, because it deliberately locks this machine's IP out of login for up to a minute.
if [ "$RATELIMIT" = 1 ]; then
  echo "Login throttling"
  GOT429=0
  for i in 1 2 3 4 5 6 7 8; do
    [ "$(code -X POST "$API/api/auth/login" -H 'content-type: application/json' -d '{"username":"smoke-nobody","password":"wrong-password"}')" = 429 ] && { GOT429=1; break; }
  done
  [ "$GOT429" = 1 ] && pass "repeated bad logins are throttled with HTTP 429" || fail "no 429 after 8 bad logins (check TRUSTED_PROXY_HOPS)"
fi

echo
if [ "$FAILED" -eq 0 ]; then echo "SMOKE TEST PASSED"; else echo "SMOKE TEST FAILED ($FAILED check(s))"; fi
exit $((FAILED > 0))
