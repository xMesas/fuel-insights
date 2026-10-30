# Production operations

## Services, networks and ports

| Service | Networks | Ports and access |
| --- | --- | --- |
| web | `edge` | Only published port: `${WEB_PORT:-8000}` to nginx port 8080. `WEB_ADDRESS` defaults to `0.0.0.0`. |
| ssr | `edge` | Node (Angular SSR) on 4000, with no host port. Renders the pages; reads the API at `http://backend:8080`. |
| backend | `edge`, `data` | API on 8080, with no host port. Actuator listens only on `127.0.0.1:8081` inside this container. |
| postgres | `data` | Database on 5432, with no host port. The `data` network has `internal: true`. |

nginx can reach the API and the page server on `edge`. It cannot reach PostgreSQL because it is not on `data`; neither can the page server.
nginx serves the files of the build itself and sends every other address to the page server.
It cannot reach Actuator because loopback is local to the backend container.
The backend can reach PostgreSQL on `data` and the Ministry through `edge`.

## First start

Run these commands from the repository root in Bash (Git Bash on Windows):

```bash
mkdir -p secrets
openssl rand -hex 24 | tr -d '\r\n' > secrets/db_password.txt
openssl rand -hex 24 | tr -d '\r\n' > secrets/db_admin_password.txt
openssl rand -hex 32 | tr -d '\r\n' > secrets/signing_key.txt
docker compose -f compose.prod.yaml up -d --build
```

`tr` removes line endings. OpenSSL in Git Bash on Windows writes `\r\n`.
A password containing `\r` caused a login failure during setup.
PostgreSQL creates the app role on an empty volume. Flyway then runs the database migrations.
After startup, `ImportScheduler` imports missing days in the window ending yesterday, newest first.
The default window is 14 days. Allow about 8–10 seconds per day; Ministry response times vary.

## Secrets and database roles

Passwords are mounted as files under `/run/secrets`, rather than stored in environment variables.
`docker inspect` shows environment variables. Spring reads its password with `configtree:/run/secrets/`.
The backend receives only the app password, named `spring.datasource.password` inside its container.

The `postgres` superuser is for administration. The `fuel` login owns `fuel_insights` so Flyway can create tables, but it is not a superuser.
`deploy/postgres/create-app-role.sh` runs only when the data volume is empty.
Changing `db_password.txt` later also requires `ALTER ROLE fuel PASSWORD ...` in PostgreSQL and a backend restart to read the new secret.

## Health

The main backend port serves `/livez` without a database check and `/readyz` with a database check.
Restarting the app cannot repair a database outage, so liveness ignores the database.
Readiness checks whether the app can serve requests that need it.
These paths are for internal checks; publicly they answer the site's 404 page.

Compose waits for healthy PostgreSQL before starting the backend, then for a healthy backend before starting the page server, and for that before starting web.
The page server answers `ok` at `/healthz` without rendering anything; nginx's own check fetches a static file.
The backend health check calls `http://127.0.0.1:8080/readyz`.
Use `docker compose -f compose.prod.yaml ps` to see health status.
An unhealthy result does not restart a container or remove it from nginx routing.

## Data freshness metrics

`ImportMetrics` exposes these gauges on the internal Actuator port:

| Metric | Meaning | Alarm rule to configure |
| --- | --- | --- |
| `fuel_insights.data.age` | Days from the latest published day to today in Madrid. Normally 1. | Greater than 2. Also alarm on no data: an empty database gives `NaN`. |
| `fuel_insights.data.missing_days` | Days not completed in the configured catch-up window. | Greater than 0 for a whole day. |
| `fuel_insights.current.age` | Minutes since the Ministry time of the current prices. Normally under 45 (the Ministry refreshes every 30 minutes, the app checks every 15). | Greater than 90. Also alarm on no data (`NaN`). |
| `fuel_insights.charging.age` | Hours since the feed time of the charging sites. Normally under 30 (the DGT publishes daily, the app checks every 6 hours). | Greater than 54 (two days missed). Also alarm on no data (`NaN`). |

```bash
docker compose -f compose.prod.yaml exec backend wget -qO- http://127.0.0.1:8081/actuator/metrics/fuel_insights.data.age
docker compose -f compose.prod.yaml exec backend wget -qO- http://127.0.0.1:8081/actuator/metrics/fuel_insights.data.missing_days
docker compose -f compose.prod.yaml exec backend wget -qO- http://127.0.0.1:8081/actuator/metrics/fuel_insights.current.age
docker compose -f compose.prod.yaml exec backend wget -qO- http://127.0.0.1:8081/actuator/metrics/fuel_insights.charging.age
```

These are metrics, not health checks. Old data can still be useful, and restarting does not make the Ministry publish new data.
An empty database must also be able to pass readiness during its first import.

## Loading a whole year

Compose reads these environment variables. For a year ending yesterday, run:

```bash
CATCH_UP_DAYS=365 docker compose -f compose.prod.yaml up -d --build
```

Allow about an hour for an empty year. Watch `missing_days` and the backend logs for progress.
Failed days are retried by the daily catch-up at 06:00 in `Europe/Madrid`, while they remain in the window.
Keep the chosen window in the environment for later Compose updates.

| Variable | Default | Purpose |
| --- | --- | --- |
| `CATCH_UP_DAYS` | `14` | Number of days to keep complete, ending yesterday. |
| `CATCH_UP_ON_STARTUP` | `true` | Start a catch-up when the app is ready. |
| `IMPORT_CRON` | `0 0 6 * * *` | Daily catch-up schedule in Madrid time. `-` disables the schedule. |
| `CURRENT_ON_STARTUP` | `true` | Download the current prices (about 12 MB) when the app is ready. |
| `CURRENT_CRON` | `0 */15 * * * *` | How often the current prices are checked. A list already imported is not written again. `-` disables it. |
| `CHARGING_ON_STARTUP` | `true` | Download the public charging sites (about 85 MB of XML, a few MB with gzip) when the app is ready. |
| `CHARGING_CRON` | `0 20 */6 * * *` | How often the charging feed is checked (the DGT refreshes it daily). A feed already imported is not written again. `-` disables it. |

## Request limit

nginx lets each client address make 10 API requests a second, with bursts of 30; beyond that it answers 429. The price board asks for the figures of the zone on screen at every map move, and those answers cannot be cached, so this keeps one client from loading the database. A page load and normal panning stay well under the limit. Behind a CDN or a load balancer the limit must use the forwarded client address instead (phase 8).

## Pages, cache and host names

- **Build:** `web` (nginx) and `ssr` (Node) are two targets of one `web/Dockerfile`, built once. Its context is the repository root, because the legal pages are built from `docs/legal/*.md`; `web/Dockerfile.dockerignore` lets only `web/` and `docs/legal/` in.
- **Page cache:** nginx keeps each rendered page for 5 minutes (`proxy_cache`, also for 404s), and one request renders a missing page while the others wait (`proxy_cache_lock`). If the page server fails, nginx serves the last copy it has. Prices change every 15 minutes at most, so a page is never more than 5 minutes behind the API.
- **Page limit:** rendering costs more than an API answer, so pages have their own limit, 5 a second per client with bursts of 20 (429 beyond).
- **Host names:** Angular answers 400 to a `Host` header it does not know, against host header injection. `SITE_HOSTS` (default `localhost,127.0.0.1`) lists the accepted names; production sets the domain.
- **Site address:** `SITE_ORIGIN` (default `http://localhost:8000`) is the public address the canonical links, `/sitemap.xml` and `/robots.txt` use. Both are served by the backend through nginx.

## Accounts, email and payments

- **Signing key:** `secrets/signing_key.txt` signs the unsubscribe links of the alert emails, and the backend does not start without it. Changing it makes the links in emails already sent invalid.
- **Email:** `MAIL_HOST` and `MAIL_PORT` point to the SMTP server (Amazon SES once the site is live). While it is unreachable, asking for a sign-in link answers 503 and alerts are logged as not sent; the rest of the site works, which is why the mail health check is off.
- **Sessions** live in PostgreSQL (`spring_session`) for 30 days of inactivity; Spring Session deletes expired ones every minute. `truncate spring_session cascade` signs everyone out.
- **The ad-free plan** is off until the Stripe keys are set (`fuel-insights.premium.stripe-secret-key`, `webhook-secret`, `price-id`; secrets in production), and until then its endpoints answer 503. Stripe's webhook must point to `https://<domain>/api/stripe/webhook` with the events `customer.subscription.created`, `updated` and `deleted`.

## Stopping and updating

On SIGTERM, Spring first stops the web server, allowing up to 30 seconds.
`ImportScheduler.stop()` then allows up to 60 seconds for the current day to finish and starts no new day.
After that wait, it interrupts the worker. Compose allows 90 seconds with `stop_grace_period: 90s`.
SIGKILL skips this process: a day can remain `RUNNING` and its Batch execution `STARTED`.
On the next import, `DayImporter` takes the import lock and recovers abandoned executions before retrying the day.
Startup catch-up normally triggers this recovery.

Validation recorded on 28 Oct 2026: `docker compose stop backend` took 9.4 seconds and logged
"Shutting down: 11 days left for the next run".
After `docker compose kill backend`, the next start logged "Recovering job execution" and completed that day.

Update with `docker compose -f compose.prod.yaml up -d --build`.
nginx uses Docker DNS with a 10-second validity, so it can find a recreated backend without an nginx restart.
The recorded check changed the backend IP from `.2` to `.4` and still returned HTTP 200.

## Logs

Backend console logs are JSON in Elastic Common Schema format.
Compose rotates each service's Docker logs, keeping up to three files of 10 MB each.

```bash
docker compose -f compose.prod.yaml logs -f backend
```

## Smoke test

Run `bash scripts/smoke-test.sh` from the repository root.
It uses its own `fuel-insights-smoke-<pid>` project, temporary secrets, a separate volume and a random localhost port.
It does not use the real stack or its volume; cleanup removes its resources unless `SMOKE_KEEP=1`.
It checks the built web, the server-rendered pages and the API, empty-data responses, blocked imports, network isolation, internal health and the metrics.

## Not yet

HTTPS, backups and alarms come with going live (phase 8). The alarm rules above are guidance; this stack does not configure them yet.
