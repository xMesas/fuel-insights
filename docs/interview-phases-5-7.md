# Interview questions: phases 5 to 7

## 1. Why server-side rendering, and what did it cost?

Search engines rank pages with their own content, and a page that needs JavaScript to show its prices is a weaker
page. Angular SSR renders every page in a Node container (`ssr`), and the browser takes the same DOM over
(hydration). The costs:
- a second runtime in production;
- code that must run in Node, so `localStorage`, `location`, timers and MapLibre are browser-only
  (`isPlatformBrowser`, `afterNextRender`);
- a cache in front, because a render costs more than serving a file. nginx keeps each page for 5 minutes, and
  `proxy_cache_lock` lets one request render a missing page while the others wait.

## 2. Two SSR bugs you found, and how

Both appeared only when a page fetched data on the server, not in unit tests.

1. **The server called itself in a loop.** Angular turns `/api/...` into `http://localhost:4000/api/...`, the
   page's own origin, before user interceptors run, so an interceptor that only rewrote relative URLs let the Node
   server request its own pages forever: 3 GB of memory in seconds. The interceptor now sends both forms to the
   API's internal address. A test covers the absolute form, with Angular's `REQUEST` token.
2. **The browser fetched every page twice.** `ng-state` held no HTTP answers. Debugging the transfer cache filter
   showed the requests were eligible, so the answers were the problem: Spring Security's `csrf.spa()` writes
   `Set-Cookie: XSRF-TOKEN` on every response, and Angular, like nginx and CDNs, does not cache answers that set a
   cookie. `AccountsCsrfTokenRequestHandler` keeps the same protection but writes the cookie only on the account
   API.

## 3. How do the page addresses stay stable?

- **Provinces:** a hand-written table of 52 slugs (`a-coruna`, `illes-balears`), not the Ministry's register names
  (`CORUÑA (A)`).
- **Towns:** the slug of the readable name, and register spellings that read the same share one page.
- **Stations:** the address starts with the id (`/gasolinera/4375-repsol-albacete`). The id finds the station and
  the rest is for people; any other slug still opens the page, and its canonical link names the right one.

## 4. Why sign in with an emailed link, and how is it secured?

Fewer things to protect: no password is stored, and Spring Security 7 has one-time token login built in.
- **Tokens:** in PostgreSQL (`JdbcOneTimeTokenService`), valid for 15 minutes and used once.
- **The link opens the web and a button posts the token,** because mail scanners open links and would use it first.
- **No enumeration:** asking for a link answers 202 whether or not the address has an account.
- **Rate limits:** at most 3 links per address while they are valid, and nginx limits the endpoint per client.
- **Session:** a cookie (HttpOnly, SameSite=Lax, Secure in production) kept in PostgreSQL by Spring Session JDBC,
  so a release signs nobody out.
- **CSRF:** every change carries the token from the `XSRF-TOKEN` cookie as a header.

## 5. How do alerts reach people without coupling the import to accounts?

The current price import publishes `CurrentPricesUpdated` after its transaction commits; `AlertSender` in the
accounts module listens. One `update … returning` both marks the due alerts as sent and reads them, so two
instances never send the same alert. An alert is marked before its email goes out: if the mail server fails, the
alert waits a day instead of being sent twice. Every email has a signed (HMAC-SHA256) unsubscribe link and the
RFC 8058 one-click header.

## 6. How is the Stripe webhook made safe and idempotent?

- **Signature:** verified with `Webhook.Signature.verifyHeader`, and refused if older than 5 minutes, so a captured
  request cannot be replayed.
- **Idempotency:** each event id goes into `stripe_event` in the same transaction as the update. A repeated
  delivery inserts nothing and changes nothing; a failure leaves no trace, so Stripe's retry processes it again.
- **Ordering:** the subscription carries the account id in its metadata, so each event updates its account on its
  own and events may arrive in any order.
- **Reading:** only the fields used are read (status, period end), not the library's full model, so a new Stripe API
  version does not break the endpoint.
- **Tests:** the webhooks are signed exactly as Stripe signs them, with a test secret, so no Stripe account is
  needed.

## 7. What did the final review catch?

An adversarial review of the money and account code found five real problems; each now has a test.

- **Ordering:** Stripe does not guarantee event order. A late "active" could undo a "canceled", so the
  subscription row keeps `last_event_created` and the upsert only applies newer events
  (`on conflict … do update … where`).
- **Double payment:** two clicks before the first webhook started two plans. Now there is one idempotency key per
  account and day.
- **Deletion:** only active plans were cancelled, not unpaid ones. Now every plan not yet ended is cancelled, and a
  plan for an account that no longer exists is cancelled when its event arrives.
- **Sessions:** deleting the account signs it out everywhere, through Spring Session's `findByPrincipalName`, and
  the pending sign-in links are deleted too.
- **Limits:** a check-then-insert race let concurrent requests pass the free limits. Now there is `select … for
  update` on the account row in the same transaction.

## 8. How do modules talk without depending on each other?

- **Through `shared` and events.** The import does not know alerts exist (`CurrentPricesUpdated`), and accounts
  does not know about payments: it publishes `AccountDeleting`, and the premium module cancels the plan.
- **One public question.** Other modules only ask `PremiumStatus.isPremium(user)`.
- **One rule for caching.** Read endpoints that depend only on the data share `VersionedAnswers`: the ETag is the
  data version, so a repeated request gets a 304 without running a query.

## 9. What did you measure, and what did you decide not to do?

- **What was measured:** each page query with `EXPLAIN ANALYZE` on a real year (12.2 million daily prices). They take
  3–6 ms each, and the sitemap of 14,702 addresses 0.22 s.
- **Not done: an index on the daily aggregates by area.** It was tried and dropped: the highest day of an area must
  check every published day anyway, and it stayed at 6 ms.
- **Not done: Angular's hydration event replay.** It inlines scripts that the strict CSP (`script-src 'self'`)
  blocks, and `'unsafe-inline'` is a worse trade. It can come back with the nonce-based CSP that ads will need.
