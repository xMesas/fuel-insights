# fuel-insights

A public website, in Spanish, with the fuel prices of Spain: a map of every station with its current price, averages by province and the price history. Built on the Spanish Government's open data.

## Status

Work in progress: phase 8 of 9 (going live) is next.

| Phase | What it adds | Status |
|---|---|---|
| 1 | First chart (local): import one day, store it in PostgreSQL, average price per province with Angular + ECharts | done |
| 2 | Robust import with Spring Batch: idempotent day import, aggregates, catch-up, backfill, price trend chart | done |
| 3 | Docker and CI/CD: images, production compose, health checks, freshness metrics, smoke test in CI | done |
| 4 | Current prices and map: import every 15 minutes, a map of every station and charging site, search by town and radius, Spanish UI | done |
| 5 | Pages and statistics: Angular SSR, pages per fuel, province, town and station, sitemap, statistics tab, measured SQL | done |
| 6 | Accounts: sign in with an emailed link, favourite stations, price alerts by email; street address search | done |
| 7 | Premium: 3 €/month without ads, Stripe Checkout and webhooks | done in test mode (needs a Stripe account) |
| 8 | Go live: AWS with Terraform, EC2 + Docker Compose, ECR, deploy from GitHub Actions, HTTPS, S3 backup ([plan](docs/go-live.md)) | planned |
| 9 | Ads: AdSense with a certified consent manager, cookie policy | planned |

## Data

The source is the official REST service of the Spanish Ministry that publishes fuel prices:
`https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/`
No API key is needed.

About 11,400 stations, daily history since 2007.

The four main fuels, with the Ministry product IDs (the site reads 21 in all, from AdBlue to hydrogen):

- Gasóleo A (ID 4), code `GASOLEO_A`
- Gasolina 95 E5 (ID 1), code `GASOLINA_95_E5`
- Gasóleo Premium (ID 5), code `GASOLEO_PREMIUM`
- Gasolina 98 E5 (ID 3), code `GASOLINA_98_E5`

Prices are retail prices in euros per litre (per kilogram for the gases), taxes included.

Public charging sites for electric cars come from the Ministry for the Ecological Transition, published by the DGT National Access Point as DATEX II (CC BY 4.0, refreshed daily):
`https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml`
About 12,000 sites and 36,000 charging points, with power, connectors, operator, payment and hours, but no prices and no live availability. See [docs/metrics.md](docs/metrics.md) for how each statistic is computed.

## Tech stack

- Backend: Java 25, Spring Boot 4.1, Spring Batch, Spring Security, Spring Session JDBC, Spring Boot Actuator, PostgreSQL, Flyway, Stripe (test mode), JUnit + Testcontainers
- Web: Angular 22 with SSR + Apache ECharts, served by nginx and a Node container
- Containers: Docker multi-stage images, Docker Compose
- CI: GitHub Actions (tests, image build, smoke test of the production stack)

Map: MapLibre with OpenFreeMap tiles. Next phase (planned): AWS with Terraform.

## Architecture

A modular monolith: one Spring Boot app with one package per module:

- `ingestion`: Ministry API client and imports
- `stations`: station catalog and opening hours
- `prices`: daily and current prices, per-day aggregates, and the data version every cached answer uses
- `stats`: read side for the web (boards, map, cards, history, the statistics tab)
- `pages`: one answer per search engine page (fuel, province, town, station), the sitemap and `robots.txt`
- `accounts`: sign-in by email, favourite stations, price alerts and their emails, and the security setup
- `premium`: the ad-free plan with Stripe; other modules only ask `PremiumStatus.isPremium(user)`
- `charging`: public charging sites, from their feed to their read API, with its own tables
- `geocoding`: street addresses for the search box, through CartoCiudad, the National Geographic Institute's geocoder
- `shared`: the few things every module may use (town names, slugs, the 404 problem); modules depend on it, never on each other's internals

Why one deployable and not microservices: one team, one database, the modules keep the code apart without the cost of a network between them. The charging module shows the shape a new feature takes: its own tables, import, lock key, metric and endpoints, and no import from another module.

The web keeps the same idea on a smaller scale: components show and react, and the logic that can be tested without a browser lives in plain functions (`*-functions.ts`, `map-layers.ts` for everything the map draws).

## Run locally

Requirements: JDK 25, Docker, Node 24.

Start the API (starts PostgreSQL with Docker Compose, API on http://localhost:8080):

```bash
cd backend && ./mvnw spring-boot:run
```

Import one day:

```bash
curl -X POST "http://localhost:8080/api/imports?date=2026-10-27"
```

Import one year in the background (about an hour, depending on the Ministry service). Days already imported are skipped:

```bash
curl -X POST "http://localhost:8080/api/imports/backfill?from=2025-10-28&to=2026-10-27"
```

Check progress and errors per day:

```bash
curl "http://localhost:8080/api/imports?from=2025-10-28&to=2026-10-27"
```

A daily catch-up runs at 06:00 Madrid time. It checks the last 14 days ending yesterday and imports missing or failed days.

Emails (sign-in links, price alerts) go to Mailpit, a local mail catcher that `spring-boot:run` starts with PostgreSQL; read them at http://localhost:8025.

Start the web (on http://localhost:4200):

```bash
cd web && npm install && npm start
```

## Run with Docker

The production stack: PostgreSQL, the API, the server rendering (Node) and the web (nginx). It needs only Docker; the images are built from the source.

Create the two database passwords and the signing key once (the `secrets/` folder is not in git). `tr` removes the line ending: OpenSSL on Windows writes `\r\n`.

```bash
mkdir -p secrets
openssl rand -hex 24 | tr -d '\r\n' > secrets/db_password.txt
openssl rand -hex 24 | tr -d '\r\n' > secrets/db_admin_password.txt
openssl rand -hex 32 | tr -d '\r\n' > secrets/signing_key.txt
```

Start it (web on http://localhost:8000):

```bash
docker compose -f compose.prod.yaml up -d --build
```

At startup the app imports the last 14 days (about 2 minutes), newest first, and then keeps them complete every morning. `CATCH_UP_DAYS=365` keeps a whole year (about an hour the first time). Health, metrics, logs and shutdown are explained in [docs/operations.md](docs/operations.md).

Check the images the way CI does (an isolated stack with its own secrets, removed at the end):

```bash
bash scripts/smoke-test.sh
```

## Design decisions

Written phase by phase.

### Phase 1

- **The Ministry JSON is translated at the edge.** `MinistryStation` reads the Spanish field names, decimal commas and empty strings, and turns them into the project's own records. Nothing else in the code knows the Ministry format.
- **JDBC, not JPA, for now.** One day is about 11,400 stations and 33,000 prices, written as batched upserts, and the statistics are aggregate SQL (`avg`, `min`, `max`, `group by`) that run in PostgreSQL. JPA will come when a feature edits single entities.
- **A day is visible complete or not at all.** The download happens first, outside any transaction; then stations, prices and the `import_day` row are written in one transaction. The API only reads days that have an `import_day` row.
- **Imports are idempotent.** Importing a day again replaces that day's prices, so a price the Ministry withdrew does not survive, and importing an older day never overwrites newer station details (`last_seen`).
- **One snapshot per read.** The statistics endpoint runs its queries in one `REPEATABLE READ` transaction: with PostgreSQL's default (`READ COMMITTED`) a re-import committed between two queries could mix two versions of the same day.
- **Retries only where they can help.** Spring Framework 7 `@Retryable` retries network errors and 5xx answers twice; a 4xx or an empty answer fails at once. Errors are RFC 9457 problem details (`application/problem+json`).
- **The Ministry server needs an old TLS cipher.** It only accepts TLS 1.2 with RSA key exchange (`AES256-GCM-SHA384`, found with `openssl s_client`), which JDK 25 disables (`TLS_RSA_*`). `MinistryTls` lifts only that entry at startup and keeps every other restriction.

### Phase 2

- **Spring Batch for one day, not for the year.** The job `importDayJob` imports one date: `prepareDay` (delete the day's prices), `loadPrices` (chunks of 1,000 stations) and `publishDay`. The backfill and the daily catch-up simply run it day after day, so every day has its own job instance, status and restart.
- **The web reads only published aggregates.** Chunks commit one by one, so raw prices can be half loaded. `publishDay` rebuilds `price_stats_daily` and marks the day published in one transaction, and the API reads nothing else. A re-import keeps the old numbers visible until it publishes.
- **A retry rebuilds the whole day.** `prepareDay` and `loadPrices` use `allowStartIfComplete(true)` and the reader keeps no position, so a restart deletes and reloads everything even if only the last step had failed.
- **One import at a time, even across instances.** A PostgreSQL advisory lock is held on its own connection for each day; a second import gets 409. The lock dies with the database session, so when an import gets it, a Batch execution still marked as running is treated as abandoned and `JobOperator.recover` releases it.
- **A fencing token, because a lock is not proof.** If only the lock's session is closed, the old import may still be alive. `prepareDay` makes the job execution the owner of the day (`import_day.owner_execution`), and every chunk and the publication first lock that row (`select ... for update`) and check the owner. An import that lost the day stops at its next write instead of mixing data.
- **A job failure is read, not caught.** `JobOperator.start` records failures in the `JobExecution` instead of throwing them; `DayImporter` reads the status and the causes to answer 502 (Ministry) or 500, and marks the day `FAILED` with its error.
- **Aggregates keep the province of that day.** `price_daily.province_id` stores the station's province on that date, so a later change in the catalog does not move old prices.
- **The moving average is honest about gaps.** One point per calendar day (`generate_series`), a 7-day `RANGE` window over dates, at least 4 days with data, and the window starts 6 days before the requested range.

### Phase 3

- **Health is not freshness.** `/livez` and `/readyz` answer "can this instance serve requests?"; liveness ignores the database (restarting the app does not fix PostgreSQL), readiness includes it. Whether the data is up to date is a metric, `fuel_insights.data.age` (normally 1 day), plus `fuel_insights.data.missing_days`: if the Ministry does not publish, a restart does not help, and an empty database would never become healthy.
- **Production has no import endpoint.** `ImportController` only exists with `fuel-insights.import.api-enabled`, which the `prod` profile turns off. nginx also lets only `GET` reach `/api/`, and Actuator listens on 127.0.0.1:8081 inside the container. Admin work is not HTTP, so there is no password to protect, and no Spring Security yet.
- **The app keeps a window of days complete.** One rule, `catch-up-days`, for the start and the daily run: a failed day is tried again every day until it works. Days are imported newest first so the web is useful sooner; the order is safe because an older day never overwrites newer station details.
- **One import worker per process.** Startup, cron and backfill share one thread: a cron that finds a run in progress skips, and a busy lock leaves the day missing, not failed. On SIGTERM no new day starts and the day in progress may finish (60 s); after a SIGKILL the next start recovers it.
- **Least privilege.** Secrets are files in `/run/secrets` (environment variables show up in `docker inspect`). The app logs in as `fuel`, owner of its database but not a superuser. Two networks: the web cannot reach PostgreSQL.
- **Layered image, tests in CI.** The Dockerfile builds the jar and splits it into layers: dependencies (29 MB) change rarely, our code (90 KB) often, so an update ships only the last layer. Tests run in CI, not in `docker build`, because they need Docker (Testcontainers).
- **nginx finds the backend again after a redeploy.** It resolves `backend` through Docker's DNS every 10 s instead of once at startup, so a recreated backend with a new IP needs no nginx restart.
- **The smoke test proves the images, not the code.** CI builds the production images, starts them with their own project name and temporary secrets, and checks the read-only API, the closed endpoints, the network isolation and the metrics.

### Phase 4

- **Current prices are a snapshot, replaced whole.** Every 15 minutes the app reads the Ministry's list of every station (about 12 MB, refreshed by the Ministry every half hour). A list with the same Ministry time is skipped. A new one replaces `price_current` in one transaction: readers see the old list or the new one, and a price that is no longer published disappears.
- **Two imports that never wait for each other.** The current import only inserts stations the catalog does not know (`on conflict do nothing` takes no row lock). Updating the catalog is the daily import's job, and the opening hours, which only the current list has, live in their own table. A transaction-scoped advisory lock (`pg_try_advisory_xact_lock`) stops two instances from writing the same snapshot, and it is released even if the process dies.
- **The lock orders the writes, not the downloads.** Two instances can download two lists in either order, so the Ministry time is compared again under the lock: an older list that arrives late never replaces a newer one.
- **The station card only shows complete days.** Its 30-day history reads raw prices, so it only takes days whose import is `COMPLETED`. A day being re-imported keeps its published aggregates, but its raw prices are deleted and reloaded chunk by chunk.
- **The map gets every station at once.** `GET /api/stations?fuel=` sends about 11,000 `[id, lat, lon, price]` arrays (370 KB, compressed by nginx). The browser filters the visible area and the cheapest stations itself, so there is no geospatial query and no PostGIS yet.
- **The town search runs in the browser.** `GET /api/places` sends every town with a station selling now (about 3,200, 53 KB compressed, cached for an hour), placed at the average position of its stations. Suggestions, the radius and the distances are computed in the browser, so typing and changing the radius make no requests. The Ministry writes names as registers sort them ("Rozas de Madrid (Las)"); `PlaceName` turns them into "Las Rozas de Madrid".
- **Opening hours are read, but only when it is safe.** `OpeningHours` turns the Ministry text (`L-V: 06:00-22:00; S-D: 07:00-14:00`) into seven days of ranges, so the web can say "Abierta · cierra a las 22:00". It reads 95% of the real schedules; the rest (mostly a lone `L: 24H`, which surely means every day) stay as text, because a wrong "Cerrada" would send drivers away.
- **Every fuel, read from one map.** The Ministry sends one field per product (`"Precio Gases licuados del petróleo": "1,119"`). `MinistryStation` keeps the known columns and collects the rest with `@JsonAnySetter`; the `Fuel` enum names each fuel's field, unit (litre, or kilogram for the gases) and whether it is one of the four main ones. Adding a fuel is one enum line and the database check constraint.
- **The map by town joins in the browser.** `/api/stats/municipalities` sends each town's average by province and name; the boundaries (IGN data through `es-atlas`) are joined by province code and normalised name, which matches 98.5% of the towns. No geospatial database for that either.
- **Same answers for everyone, so they are cached.** The current prices change only when the Ministry publishes (every half hour), so `/api/stats/current`, `/api/stations` and the station card carry an `ETag` (the data version: the Ministry time plus the latest published day) and `Cache-Control: public, max-age=300`. A browser, nginx or a CDN can reuse them, and a revalidation gets a `304` without running a query.
- **The card answers one question.** Is this the place to fill up? Its face shows only the ranking in its zone ("1.ª más barata de 31 a menos de 10 km"), the open status, the price and the way to get there. What you get for 10, 20 or 50 €, the next cheapest station and the zone average sit behind an ⓘ. A fuel without a price is never listed.
- **A traffic light for prices.** Map dots and areas use five equal-count classes from green (cheap) through yellow to red (expensive), because that is how drivers already read prices. The palette was checked for colour-blind readers (neighbouring classes ΔE ≥ 8.2). On the light map, yellow and light green are too pale for the background, so each dot gets a dark outline, and the price is always also given in words.
- **The price board answers one driver's question.** You pick your fuel once (the browser remembers it) and the board shows no other fuel's price: just the five cheapest stations of what is on screen, all of Spain, a region or one street, and one sentence of context with the zone's average and its change in a week. The top 5 is computed in the browser from the fuel's station list; `GET /api/stats/zone` computes the average in PostgreSQL for the same box or search circle (the same haversine formula as the web), and the change in a week compares the zone with itself: today's prices against the same zone's complete day seven days before.
- **Charging sites are read as a stream.** The feed is 85 MB of XML. Asked with `Accept-Encoding: gzip` it travels as a few megabytes, and `ChargingFeedParser` reads it with StAX, one element at a time, keeping only what the web shows: the whole import takes about two seconds. DTDs and external entities are switched off, the usual defence against XXE in XML that comes from the network, and a test proves it. A feed with no sites is rejected, so a degraded answer never empties the map.
- **The feed's words become the driver's.** The source names operators as companies (`IBERDROLA CLIENTES S.A.U`) and connectors as standards (`iec62196T2COMBO`); `ChargingNames` turns them into `Iberdrola` and `CCS2`, the database keeps the source's codes, and a site name that is only an internal code is not shown. The hours, written as `Miercoles (08:30 - 17:30) Lunes (00:00 - 23:59)`, are read into the same seven-day shape as the fuel stations', so the web says "Abierta" or "Cerrada" for both with one function.
- **One page, two modes.** `Gasolina y diésel` or `Recarga eléctrica` share the search, the map and its controls; each mode has its own board, list, card and map layer. Charging dots are coloured by power class with a blue ramp, so they never read as a price.
- **Accessible by review, not by accident.** A WCAG 2.2 AA review of the web, checked finding by finding, led to: notices without a time limit, Escape scoped to the control in use, readable text for the power classes left out, no live announcement on every map move, and the price or power written next to each dot at street level, so colour is never the only clue.
- **Links that bring people back.** `Compartir` sends `/?gasolinera=4375` (or `/?recarga=…`), a link to this site that opens the same card with the map framed on it, instead of a Google Maps link; the address names the open card at all times. There is no router: the page reads the two parameters once and keeps the address in step with `history.replaceState`.
- **Sources named as their licences ask.** The footer names each source and licence (Ministry for the Ecological Transition, DGT National Access Point CC BY 4.0, IGN CC BY 4.0, OpenStreetMap through OpenFreeMap) and says the site is not linked to the Ministry or the DGT.
- **Light first load.** The first load is about 90 KB of compressed JavaScript. MapLibre (230 KB), the town boundaries (390 KB, only for the Municipios view) and the chart library (170 KB, when the charts come into view) load on demand.
- **Measured before adding an index.** The 30-day history of one station over 12 million rows uses the primary key `(day, station_id, fuel)`: 0.3–0.8 ms warm and 24 ms cold, thanks to PostgreSQL 18's B-tree skip scan. So there is no extra index.
- **Times stay in the Ministry's clock.** The Ministry writes Madrid time without a zone; the import stores it as an instant, and the API returns it with the Madrid offset (`2026-10-29T13:58:32+01:00`), so the web shows the same time the Ministry does.

### Phase 5

- **Pages Google can read without JavaScript.** The web renders on the server (Angular SSR in a Node container) and the browser takes over the same page (hydration). Each page needs one API answer, built for it in the `pages` module, so a render is one quick request to the backend.
- **Addresses that never change.** A province's address comes from a fixed table of 52 names written by hand (`A Coruña` → `/gasolineras/a-coruna`), not from the Ministry's register names (`CORUÑA (A)`). A town's comes from its readable name, and register spellings that read the same share one page. A station's address starts with its id (`/gasolinera/4375-repsol-albacete`): the id finds it, the rest is for people, and a page asked with an old name points to the right one as canonical.
- **Measured before indexing.** Each page query was measured with `EXPLAIN ANALYZE` on the real year (12.2 million daily prices): the province page's queries take 3–6 ms each and the sitemap of 14,702 addresses 0.22 s. An index on the daily aggregates by area was tried and dropped: the highest day of an area must check every published day anyway, and it stayed at 6 ms.
- **One rendering serves everyone for five minutes.** nginx caches each rendered page (`proxy_cache`) and lets a single request render a missing page while the others wait for it, so a burst of visits does not become a burst of renders. The prices change every 15 minutes at most.
- **Statistics that say what they mean.** The cheapest weekday compares each day with the centred week around it, so a year of rising prices does not make Monday look cheap; on the real year the gap between the cheapest and the dearest day is about 0.4 cents, and the page says so. "What choosing saves" compares the 10th and 90th percentiles, not the single dearest station, which is often a motorway one nobody chooses.
- **A strict CSP over convenience.** Angular's hydration "event replay" (clicks made before the JavaScript loads) inlines two scripts, which the site's Content Security Policy (`script-src 'self'`) blocks. It is off rather than opening the policy with `'unsafe-inline'`; ads (phase 9) will need nonces, and replay can come back then. Server-side HTTP calls are rewritten to the API's internal address by an interceptor placed after Angular's transfer cache, so the browser never asks again for what the server already fetched; that hook (`ɵHTTP_ROOT_INTERCEPTOR_FNS`) is internal to Angular, the known cost of the trick.
- **One rule for cached answers.** Every read endpoint that depends only on the data uses `VersionedAnswers`: the ETag is the data version, so a repeated request gets a `304` without running a query.

### Phase 6

- **No passwords.** People sign in with a link sent to their email: Spring Security's one-time token login, with the tokens in PostgreSQL. The link opens the web, and a button sends the token: mail scanners that open every link would otherwise use it first. The account starts the first time a link is used, and asking for a link answers the same whether the address has an account or not, so the site never tells who uses it. At most 3 links per address are sent while they are valid (15 minutes), and nginx limits requests per client.
- **A session that survives a release.** The session is a cookie (HttpOnly, SameSite=Lax, Secure in production) kept in PostgreSQL with Spring Session JDBC, so a restart or a new version signs nobody out. Every request that changes something carries a CSRF token (`csrf.spa()`: the web reads the `XSRF-TOKEN` cookie and sends it back as a header).
- **The CSRF cookie only where it is needed.** Spring Security's single-page-app setup (`csrf.spa()`) writes the `XSRF-TOKEN` cookie on every answer. A `Set-Cookie` made every public answer uncacheable: nginx and CDNs skip it, and Angular's transfer cache refused to pass the server's answers to the browser, so the browser fetched every page's data twice. `AccountsCsrfTokenRequestHandler` keeps the same protection but writes the cookie only on the account API, which the web calls before its first POST.
- **Alerts without coupling.** The current price import publishes `CurrentPricesUpdated` after its commit; the accounts module listens and sends the alerts, and the import does not know alerts exist. One `update … returning` marks and reads the due alerts, so two instances never send the same one; an alert is sent at most once a day.
- **Leaving is one click.** Every alert email has a signed (HMAC-SHA256) link and the RFC 8058 one-click header, so mail clients show their own unsubscribe button. Deleting the account deletes its favourites and alerts with it (`on delete cascade`).

### Phase 7

- **The card never touches the site.** The ad-free plan (3 € a month) is paid on Stripe's own Checkout page and managed in Stripe's Customer Portal; the site keeps only the subscription's status and period end.
- **Stripe's webhook is the source of truth.** It is verified with Stripe's signature (refused if older than 5 minutes) and processed in one transaction with its event id, so a repeated delivery changes nothing. It is read field by field instead of with the library's full model, so a new API version does not break it. The subscription carries the account id in its metadata, so its events need no lookup and may arrive in any order.
- **What a final adversarial review found, and its fixes.**
  - Stripe does not deliver events in order, so each subscription keeps the creation time of the last event applied, and an older one never undoes a newer one.
  - Two clicks on "pay" share one idempotency key per account and day, so Stripe answers both with the same page instead of starting two plans.
  - Deleting an account cancels any plan not yet ended (an unpaid one still charges), and a plan paid for an account deleted meanwhile is cancelled when its event arrives.
  - Deleting an account signs it out on every device, so an old session never opens an account created again with the same email.
  - The free limits are checked with the account's row locked, so two requests at once cannot both pass them.
- **Off until it has keys.** Without Stripe keys the plan's endpoints answer 503 and the rest of the site works. The tests sign the webhook as Stripe does, so no Stripe account is needed to prove it.
- **Deleting a paying account cancels the plan first,** through an `AccountDeleting` event: the accounts module knows nothing about payments.

## License

To be decided.
