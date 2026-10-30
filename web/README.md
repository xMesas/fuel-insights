# fuel-insights web

Angular 22, signals and Apache ECharts. Shows the latest complete imported day for one fuel, with national figures and province averages.

## Run locally

Start the backend on `http://localhost:8080`, then:

```sh
npm ci
npm start
```

Open `http://localhost:4200`. The development server proxies `/api` to the backend through `proxy.conf.json`. No API key is needed.

```sh
npm run build
npx ng test --watch=false
```

In PowerShell with script execution disabled, use `npm.cmd` and `npx.cmd`.

## Reading the code

- `prices-api.ts`: typed HTTP requests, province name formatting, and missing-day (404) handling. Other HTTP errors remain errors.
- `app.ts`: signals hold the selected fuel, data and request state. `switchMap` cancels an older request when the selection changes. Existing figures remain visible during loading.
- `province-chart.ts`: a deferred, tree-shaken scatter chart with a national reference line. Colours follow the CSS tokens and system theme; reduced motion disables animation. Focus the chart and use Up/Down, Home/End or Escape to explore points. The table contains full province names and every value.
- `price-format.ts`: province names, three-decimal prices, calendar dates and local import timestamps. An effective date is a calendar day, so it is constructed locally rather than parsed as a UTC timestamp.
- `styles.css`: shared light/dark tokens and self-hosted fonts, following `../design-system/fuel-insights/MASTER.md`.

The chart uses a padded price scale rather than zero because dots compare positions, not bar lengths. Province order comes from the API. The effective date is always shown explicitly. Metric definitions are in `../docs/metrics.md`.

Tests cover formatting, HTTP URLs and errors, page states, fuel selection, table values, chart order, reduced motion and keyboard details. Browser layout checks are separate from these unit tests.
