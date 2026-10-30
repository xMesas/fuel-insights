#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
P="fuel-insights-smoke-$$"
TEMP_DIR="$(mktemp -d)"
export WEB_ADDRESS=127.0.0.1 WEB_PORT=0
export CATCH_UP_DAYS=0 CATCH_UP_ON_STARTUP=false IMPORT_CRON=-
export CURRENT_ON_STARTUP=false CURRENT_CRON=- CHARGING_ON_STARTUP=false CHARGING_CRON=-
export SECRETS_DIR="$TEMP_DIR"
if command -v cygpath >/dev/null 2>&1; then
	# Native Windows programs (docker, curl) need Windows paths; Git Bash understands them too.
	TEMP_DIR="$(cygpath -m "$TEMP_DIR")"
	SECRETS_DIR="$TEMP_DIR"
	# Keep Git Bash from rewriting container paths and URLs passed to Docker.
	export MSYS_NO_PATHCONV=1
fi

compose() { docker compose -p "$P" -f compose.prod.yaml "$@"; }
cleanup() {
	local result=$?
	trap - EXIT
	if (( result != 0 )); then
		compose ps || true
		compose logs --tail 200 || true
	fi
	if [[ ${SMOKE_KEEP:-0} == 1 ]]; then
		printf 'Keeping project %s and secrets at %s\n' "$P" "$SECRETS_DIR"
	else
		compose down -v --rmi local --remove-orphans || result=1
		rm -rf -- "$TEMP_DIR"
	fi
	if (( result == 0 )); then printf 'Smoke test passed\n'; fi
	exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
# No line ending at all: OpenSSL on Windows (Git Bash) writes \r\n.
openssl rand -hex 24 | tr -d '\r\n' > "$TEMP_DIR/db_password.txt"
openssl rand -hex 24 | tr -d '\r\n' > "$TEMP_DIR/db_admin_password.txt"
openssl rand -hex 32 | tr -d '\r\n' > "$TEMP_DIR/signing_key.txt"
chmod 0644 "$TEMP_DIR/"*.txt
compose up -d --build --wait --wait-timeout 180
ADDRESS="$(compose port web 8080 | tr -d '\r')"
[[ $ADDRESS =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail "Unexpected web address: $ADDRESS"
BASE="http://$ADDRESS"

check() {
	local method=$1 path=$2 expected=$3 type=${4:-} body=${5:-} response code
	local args=(-sS --max-time 10 -D "$TEMP_DIR/headers" -o "$TEMP_DIR/body" -w '%{http_code}')
	if [[ $method == HEAD ]]; then args+=(--head); else args+=(-X "$method"); fi
	code="$(curl "${args[@]}" "$BASE$path")" || fail "$method $path: curl failed"
	[[ $code == "$expected" ]] || fail "$method $path: expected $expected, got $code"
	# The media type without parameters, compared as plain text ("+" in problem+json is not a regex here).
	response="$(tr -d '\r' < "$TEMP_DIR/headers" | grep -i '^content-type:' | head -n 1 | cut -d: -f2- \
		| cut -d';' -f1 | tr -d ' ' | tr '[:upper:]' '[:lower:]')" || true
	if [[ $type == not-json ]]; then
		[[ $response != *json* ]] || fail "$path exposed JSON ($response)"
	elif [[ -n $type ]]; then
		[[ $response == "$type" ]] || fail "$path: expected $type, got ${response:-no content type}"
	fi
	if [[ -n $body ]]; then
		grep -Fq "$body" "$TEMP_DIR/body" || fail "$path: missing body fragment $body"
	fi
	printf 'PASS: %s %s (%s)\n' "$method" "$path" "$code"
}

# Pages are rendered by the Node server behind nginx: the HTML already carries the content.
check GET / 200 text/html '<h1'
check GET /estadisticas 200 text/html '<h1'
check GET /no-existe 404 text/html
check POST /estadisticas 403
check GET /robots.txt 200 text/plain 'Sitemap: http://localhost:8000/sitemap.xml'
check GET /sitemap.xml 404
check GET /api/pages/provinces 200 application/json '"a-coruna"'
check GET /api/pages/fuels/GASOLEO_A 404 application/problem+json
check GET /api/pages/provinces/barcelona 404 application/problem+json
check GET '/api/stats/weekdays?fuel=GASOLEO_A' 404 application/problem+json
# Accounts: only /api/me needs a session, and nothing changes without a CSRF token (or Stripe's signature).
check GET /api/me 204
check GET /api/me/favourites 401
check POST /api/auth/link 403
check DELETE /api/fuels 403
check POST /api/stripe/webhook 503
# Only the account API writes the CSRF cookie: a Set-Cookie would make the public answers uncacheable.
curl -sS -o "$TEMP_DIR/body" -D "$TEMP_DIR/headers" "$BASE/api/me" || fail 'GET /api/me failed'
grep -qi '^set-cookie: XSRF-TOKEN=' "$TEMP_DIR/headers" || fail '/api/me did not write the CSRF cookie'
curl -sS -o "$TEMP_DIR/body" -D "$TEMP_DIR/headers" "$BASE/api/pages/provinces" || fail 'GET /api/pages/provinces failed'
! grep -qi '^set-cookie:' "$TEMP_DIR/headers" || fail 'A public answer set a cookie'
printf 'PASS: CSRF cookie only on the account API\n'
check GET /api/fuels 200 application/json
check HEAD /api/fuels 200
check GET /api/areas 200 application/json '"ES"'
check GET '/api/stats/provinces?fuel=GASOLEO_A' 404 application/problem+json
check GET /api/stats/current 404 application/problem+json
check GET '/api/stations?fuel=GASOLEO_A' 404 application/problem+json
check GET /api/places 200 application/json '[]'
check GET /api/charging/sites 404 application/problem+json
check GET '/api/stats/zone?province=28' 404 application/problem+json
check GET /maplibre-gl-worker.mjs 200 application/javascript
check GET /fonts/DSEG7Classic-Bold.woff2 200 font/woff2
check POST '/api/imports?date=2026-01-01' 403
check PUT '/api/imports?date=2026-01-01' 403
check POST '/api/imports/backfill?from=2026-01-01&to=2026-01-02' 403
check GET '/api/imports?from=2026-01-01&to=2026-01-02' 404
# Actuator and the health paths are internal: publicly they are just pages the site does not have.
for path in /actuator/health /readyz /livez; do check GET "$path" 404 not-json; done

edge_curl() {
	docker run --rm --network "${P}_edge" curlimages/curl:8.23.0 \
		--noproxy '*' -sS --max-time 10 "$@"
}
code="$(edge_curl -o /dev/null -w '%{http_code}' -X POST 'http://backend:8080/api/imports?date=2026-01-01')" \
	|| fail 'Direct backend import request failed'
[[ $code == 404 ]] || fail "Direct backend import: expected 404, got $code"
printf 'PASS: direct backend POST import (404)\n'

result=0
code="$(edge_curl -o /dev/null -w '%{http_code}' http://backend:8081/actuator/health)" || result=$?
[[ $result == 7 && $code == 000 ]] || fail "Actuator reachable from edge or unexpected error ($result, $code)"
printf 'PASS: Actuator connection refused from edge\n'
result=0
code="$(edge_curl -o /dev/null -w '%{http_code}' http://postgres:5432)" || result=$?
[[ $result == 6 && $code == 000 ]] || fail "Postgres resolved from edge or unexpected error ($result, $code)"
printf 'PASS: Postgres does not resolve from edge\n'

health="$(compose exec -T ssr wget -qO- http://127.0.0.1:4000/healthz)"
[[ $health == ok ]] || fail "The page server health answered: $health"
printf 'PASS: page server health\n'

health="$(compose exec -T backend wget -qO- http://127.0.0.1:8081/actuator/health)"
[[ $health == *'"status":"UP"'* ]] || fail 'Internal Actuator health is not UP'
printf 'PASS: internal Actuator health UP\n'
for metric in fuel_insights.data.age fuel_insights.data.missing_days fuel_insights.current.age \
	fuel_insights.charging.age; do
	compose exec -T backend wget -qO- "http://127.0.0.1:8081/actuator/metrics/$metric" \
		> "$TEMP_DIR/metric"
	grep -Fq "\"name\":\"$metric\"" "$TEMP_DIR/metric" || fail "Missing metric $metric"
	printf 'PASS: internal metric %s\n' "$metric"
done

# Last, because it uses up this client's API allowance: 80 requests at once must meet the nginx limit (429).
urls=()
for _ in $(seq 80); do urls+=(-o "$TEMP_DIR/burst" "$BASE/api/fuels"); done
codes="$(curl -sS --max-time 30 -w '%{http_code}\n' "${urls[@]}" 2> "$TEMP_DIR/burst-error")" \
	|| fail "Burst of API requests failed: $(cat "$TEMP_DIR/burst-error")"
grep -qx 429 <<< "$codes" || fail 'No request of a burst of 80 was limited (expected some 429)'
grep -qx 200 <<< "$codes" || fail 'Every request of the burst was limited'
printf 'PASS: API request limit (429 after the burst)\n'
