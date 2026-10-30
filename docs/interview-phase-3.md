# Interview questions: phase 3

## 1. Why is data freshness a metric and not part of the health check?

`ImportMetrics` exposes `fuel_insights.data.age` and `fuel_insights.data.missing_days` for alarms.
Old data is still useful, and restarting the app cannot make the Ministry publish new data.
An empty database must pass readiness so the first startup import can run while the web starts.
The age is normally 1 day; no published data gives `NaN`, which monitoring must also treat as an alarm.

## 2. Why does liveness not include the database, while readiness does?

`application.properties` enables `/livez` and `/readyz` on the main backend port.
Liveness checks the app state, because restarting it does not fix a database outage.
The readiness group includes `readinessState,db`, since API requests need the database.
`compose.prod.yaml` checks `/readyz` to control startup order, but an unhealthy result does not restart the container or change nginx routing.

## 3. How is the import API closed in production, and why not protect it with Spring Security instead?

`ImportController` uses `@ConditionalOnBooleanProperty("fuel-insights.import.api-enabled")`.
`application-prod.properties` sets that property to `false`, so the controller is absent and direct import requests return 404.
`web/nginx/default.conf` also blocks write methods under `/api/` with 403; GET and HEAD remain allowed.
Production imports run through `ImportScheduler`, so there is no user login or manual import API to protect with Spring Security.

## 4. Why are secrets files and not environment variables, and why does the app not use the PostgreSQL superuser?

`compose.prod.yaml` mounts passwords under `/run/secrets`, since environment values are visible in `docker inspect`.
`application-prod.properties` reads the app password through `configtree:/run/secrets/`.
`deploy/postgres/create-app-role.sh` creates `fuel` as a login that owns `fuel_insights`, so Flyway can create tables without superuser rights.
The `postgres` superuser password stays with the database container for administration.
The init script runs only on an empty volume, so a later app password change also needs `ALTER ROLE fuel PASSWORD ...`.

## 5. What does the layered jar buy you in `backend/Dockerfile`, and why are the tests not run in `docker build`?

`backend/Dockerfile` extracts the Spring Boot jar into dependencies, loader, snapshot dependencies and application layers.
Each layer has its own `COPY`, so a code change can reuse the dependency layers and reduce image transfers.
The runtime image contains a JRE and runs as `app`, without the JDK or build tools.
The build uses `-DskipTests` because integration tests need Docker through Testcontainers.
In `.github/workflows/ci.yml`, the image job waits for backend `verify` and the web build and tests on the same commit.

## 6. What happens to an import when the container gets SIGTERM, and when it gets SIGKILL?

The exec-form entry point in `backend/Dockerfile` lets Java receive SIGTERM as PID 1.
Spring allows up to 30 seconds for web shutdown, then `ImportScheduler.stop()` waits up to 60 seconds for the current day and starts no new day.
`compose.prod.yaml` sets `stop_grace_period: 90s`; after the import wait expires, the scheduler interrupts its worker.
SIGKILL skips cleanup, so a day can stay `RUNNING` with a Batch execution still `STARTED`.
On the next import, `DayImporter.recoverAbandonedExecutions()` recovers running executions under the import lock, allowing the missing day to restart.

## 7. Why does nginx use `resolver 127.0.0.11` and a variable in `proxy_pass`?

`web/nginx/default.conf` uses `127.0.0.11`, Docker's internal DNS resolver, with `valid=10s`.
The `$backend` variable in `proxy_pass` makes nginx resolve the backend name at request time using that resolver.
This lets nginx find a new backend IP after Compose recreates the container, without restarting nginx.
The 10-second DNS cache means the change may not be visible at once.

## 8. How does the smoke test avoid touching a real stack, and what does it prove that the unit tests do not?

`scripts/smoke-test.sh` uses a unique Compose project name, temporary secret files and a random port bound to localhost.
Its database volume belongs to that project, and its cleanup removes only those resources unless `SMOKE_KEEP=1`.
It starts the production images and checks web pages, API responses, blocked import routes, health and metrics.
It also checks from the `edge` network that Actuator refuses connections and PostgreSQL does not resolve.
This tests the real image, nginx and Compose wiring together, which unit tests do not cover.
