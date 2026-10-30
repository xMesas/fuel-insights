# fuel-insights design system

Source of truth for every screen of `web/`. A file in `pages/<page>.md`, if it exists, overrides this one for that page.

Started from a data-dense dashboard style (spacing scale, UX checklist) and adjusted with a chart method that wins on anything about charts: one job per colour, palettes checked for colour-blind readers, thin marks. Sales-page patterns, scroll animations, modals and hover-lift cards were left out: this is a public data site, not a product landing page.

## Direction

The site is public, in Spanish, for drivers in Spain, first on the phone. Its two tools:
- the price board of a Spanish petrol station: a few large figures that people compare at a glance;
- a map of every station coloured by price, in the spirit of the Datadista map (https://especiales.datadista.com/interactivos/mapa-gasolineras-baratas-espana/): full screen on mobile, quick to answer "where is it cheaper near me".

It has the content of sites like dieselogasolina.com, without their clutter. So:

- Calm, neutral page; the data carries the colour.
- One accent, **amber**, only for the headline figure, like the digits on a price board. Nothing else is amber.
- Charts in a single blue. No rainbow, no decoration, no gradients.
- Dense but not cramped: a reader on a phone should get the national figure and the cheapest province without scrolling.
- The one bold element is the **price board**: a dark panel at the top that looks like the price sign at the entrance of a Spanish station, with the four fuels and their prices in amber LED digits. Everything around it stays quiet.
- **All UI text is in Spanish**: sentence case, plain words, Spanish number format in the UI (`1,899 €/l`). Code, comments and tests stay in English. The English examples in this file are placeholders, to be translated when the screen is built.
- Ads (later) never push the price board or the map below the first screen on a phone, and their slots keep a fixed size so the page does not jump.
- The map colours and controls are defined with the chart method below when the map is built (phase 4).

## Colour tokens

Define them as CSS custom properties on `:root`, and the dark values under `@media (prefers-color-scheme: dark)`. Components use the tokens, never raw hex.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--page` | `#f9f9f7` | `#0d0d0d` | page background |
| `--surface` | `#fcfcfb` | `#1a1a19` | cards and chart background |
| `--ink` | `#0b0b0b` | `#f0efec` | primary text, values |
| `--ink-2` | `#52514e` | `#c3c2b7` | secondary text, axis labels |
| `--ink-3` | `#898781` | `#898781` | only non-essential hints (never body text on light: 3.5:1) |
| `--hairline` | `rgba(11,11,11,0.10)` | `rgba(255,255,255,0.10)` | card borders, separators |
| `--grid` | `#e1e0d9` | `#2c2c2a` | chart gridlines |
| `--axis` | `#c3c2b7` | `#383835` | chart baseline / axis line |
| `--data` | `#2a78d6` | `#3987e5` | the data series (validated: all checks pass, 3:1+ on the surface) |
| `--data-soft` | `#b7d3f6` | `#184f95` | range bars, de-emphasised marks |
| `--accent` | `#b45309` | `#f59e0b` | headline figure only (4.9:1 light, 8.1:1 dark) |
| `--focus` | `#2a78d6` | `#3987e5` | focus ring |
| `--error` | `#d03b3b` | `#e66767` | error text, always with an icon and words |

Price board tokens: the same in light and dark mode, because a real price sign is always dark. Contrast measured on `--panel` (and on the selected row).

| Token | Value | Use |
|---|---|---|
| `--panel` | `#1d2228` | price board background (asphalt). In dark mode it also gets a 1px `rgba(255,255,255,0.14)` border: it is only 1.2:1 against the dark page |
| `--panel-ink` | `#e8eaed` | fuel names (13.3:1, 10.4:1 selected); also the focus ring inside the board |
| `--panel-ink-2` | `#a9b0b8` | area, date, EU fuel labels (7.3:1, 5.7:1 selected) |
| `--led` | `#ffb224` | price digits (8.9:1, 7.0:1 selected) and the selected row's 4px left edge |
| `--panel-select` | `rgba(255,178,36,0.12)` | selected row background |

## Typography

- **Fira Sans** for all UI text and **Fira Sans Condensed** (600) for headings and large figures: one family, two widths, like a price board.
- Self-hosted with the `@fontsource/fira-sans` and `@fontsource/fira-sans-condensed` packages (already installed). No Google Fonts CDN: it sends the visitor's IP to a third party, which is a GDPR problem in the EU.
- Fallback: `system-ui, "Segoe UI", sans-serif`.
- Scale: 14px small, 16px body (minimum for body), 20px section titles, 28px page title, 48–56px headline figure.
- Prices: always 3 decimals and the unit, in Spanish format in the UI text (`1,459 €/l`); on the LED board the separator is the display's dot segment. `font-variant-numeric: tabular-nums` in tables and axis ticks; proportional figures in the headline.
- **DSEG7 Classic** (npm `dseg`, OFL-1.1), self-hosted, only for the price digits on the price board: one `woff2` file, nothing else uses it. The LED digits are `aria-hidden`; the full price is in visually hidden text (`1.899 €/L`).
- On the board the third decimal is smaller and raised, as on Spanish price signs: `1.89⁹`. No "unlit" ghost segments behind the digits.

## Spacing and shape

| Token | Value |
|---|---|
| `--space-xs` | 4px |
| `--space-sm` | 8px |
| `--space-md` | 16px |
| `--space-lg` | 24px |
| `--space-xl` | 32px |

- Page side padding 16px on mobile, 24–32px on desktop; content max width 1200px.
- Cards: `--surface`, 1px `--hairline` border, 12px radius, no shadow, no hover effect (they are not clickable).
- Controls: 8px radius, at least 44px tall on touch screens.

## Components

- **Header**: product name, one-line description, and the choice of mode below them: a segmented control `Gasolina y diésel` / `Recarga eléctrica` (a radio group; the selected segment in `--ink` with `--surface` text).
- **No price, no row** (the user's rule, 29 Oct). A fuel without a price is not listed at all; never write `Sin precio` in a list:
  - the station card lists only the fuels that station sells;
  - the `Otros carburantes` select lists only fuels with at least one station now;
  - the board hides a row whose fuel has no price in the zone it describes.
  The only exception is a single selected fuel with nothing to show: then say so in one sentence (`No hay gasolineras con GLP en esta zona.`).
- **All fuels.** The API serves 21 fuels; `main: true` marks the four of the price board.
  - The others (GLP, Gasolina 95 Premium, Diésel renovable, Gasóleo B, gas natural and biogás, E10, E85, hidrógeno, AdBlue…) are chosen from a select `Otros carburantes` under the board's rows, inside the panel.
  - Choosing one adds it as a fifth, selected row on the board, with its LED price.
  - Prices always carry their unit: `€/l`, or `€/kg` for the gases (`unit: "kg"`).
  - The fill-up line only appears for litre fuels other than AdBlue.
  - A fuel with no daily history yet says `Aún sin historial para este carburante.` where the charts would be.
- **Price board**: a `--panel` block, 12px radius. **It answers one question for one driver: where is my fuel cheapest in what I am looking at** (the user, 29 Oct: a petrol driver does not need the diesel price, and a province average does not tell anyone where to fill up). From top to bottom:
  1. **Your fuel:** the four main fuels as a radio group of buttons in two columns (EN 16942 identifier as inline SVG, a circle with `E5` for petrol, a square with `B7` for diesel, and the name), with **no prices**. The selected one has `--panel-select`, an `--led` border and an amber icon. Below, the `Otros carburantes` select; a fuel chosen there joins the buttons. The choice is remembered in the browser: a driver picks once.
  2. **Context, one sentence** for the chosen fuel: `Media en la zona del mapa: 1,907 €/l. Sube 1,3 cént. en 7 días.` The zone average comes from `/api/stats/zone`, computed in PostgreSQL for the visible map or the search circle (the same haversine formula as the web); the change compares the zone with itself a week before and is left out when that day is not complete. The sentence always names the zone its figures belong to: while a new zone loads, or if it fails, it keeps the old name.
  3. **The top 5**, inside the panel: `Las 5 más baratas de la zona del mapa`, numbered 1 to 5 (a real ranking), with the sign name, the town and the price in `--led` LED digits. It follows the map: all of Spain shows the cheapest in Spain, a region its cheapest, a street at full zoom that street's. Around a search it becomes `9 gasolineras a menos de 10 km de Getafe`, with `Más baratas` / `Más cercanas`, the distance, `Ver más` (5 more) and `Ampliar a 25 km` when empty. Tapping a row opens the station card, moves the map to it and, on a phone, scrolls the page to the map.
  4. Bottom line: the effective date of the prices.
- **A province chosen on the map** (`Ver en el mapa` in its popup, Provincias view): the map fits it and draws its outline (2.5px, white on the dark map, near-black on the light one), and the trend and the province chart follow it. The board keeps following the map, so zooming in always narrows the top 5; its first line says `Barcelona, marcada en el mapa` with a `×` that clears the province. Choosing a town in the search also clears it.
- **Charging board** (electric mode), in the same place and style: `Puntos de recarga en la zona del mapa` (or around the search), then one row per power class, fastest first, with a dot of its map colour, its name and range (`Ultrarrápida`, `más de 150 kW`) and the number of sites in LED digits. The rows are a radio group: choosing a class shows it and the faster ones on the map and the list. A slower class keeps its text readable (WCAG 1.4.3): only its colour dot fades and its count turns `--panel-ink-2`, and screen readers hear `ocultos en el mapa`. Under the rows: `Elige una potencia para ver solo esa y las más rápidas.`, then **the top 5 inside the panel**, as on the price board: `Los 5 más potentes de la zona del mapa` (or `12 puntos de recarga a menos de 10 km de Getafe`, nearest first, with `Ver más`), numbered, with the operator, the town and the power in LED digits (`350`, `7.4`, with a small `kW`). Last, the source line, which says the Ministry publishes no charging prices.
- **No "day panel".** It was removed on 29 Oct: a block of statistics between the search and the results is what cluttered sites do. The researched leaders (clever-tanken, mehr-tanken, PetrolPrices, Mais Gasolina) put the search and the results first and statistics further down. Its numbers moved where they make sense:
  - the change in 7 days and the highest of the period go to the trend chart's heading;
  - the cheapest and most expensive province are already the labelled ends of the province chart.
- **Data note**: always visible, as a sentence: `Prices on 27 Oct 2026, imported 28 Oct at 15:05.` Never the word "today".
- No strings joined with middle dots in new text.
- **Empty and error states**: plain sentence plus what to do next, in a card. Never a blank chart.
- **Table view**: every chart has a "Show as table" toggle with the same numbers.

## Charts

- Pick the form by the job. Comparing one value across many categories in a narrow range (prices 1.2–1.8 €/L) → **dot plot** sorted by value, not bars: bars must start at zero and would hide the differences.
- Provinces come in two dot plots, each with its own axis: "Peninsula and Balearics" (48) and "Canary Islands, Ceuta and Melilla" (Ministry province IDs 35, 38, 51, 52), which have lower fuel taxes and would squash the differences of the rest. The table keeps all 52.
- One series → one colour (`--data`), no legend box; the title names it.
- Marks: dots at least 8px; lines 2px; bars at most 24px thick with a 4px rounded end.
- Reference line (for example the national average): 1px dashed `--ink-2`, labelled at its end.
- Direct labels only on the points that matter (cheapest, most expensive), never on every point.
- Gridlines in `--grid`, axis in `--axis`, tick labels in `--ink-2`. No chart border, no background image.
- Tooltip on hover and keyboard focus: value first (strong), label second, plus the extra numbers (min, max, stations).
- Text never takes the series colour.
- Colours come from the CSS tokens at runtime, so the chart follows light and dark mode.

## Map (phase 4)

- **MapLibre GL JS** with the OpenFreeMap **Dark** style (`https://tiles.openfreemap.org/styles/dark`, background `rgb(12,12,12)`), in light and dark mode alike: the map and the price board are the "forecourt at night" of the page. OpenFreeMap allows commercial use, has no key and sets no cookies. Its attribution stays visible.
- **One circle layer** with every station selling the selected fuel. The colour is the price **quintile** of that fuel across Spain: five classes with equal counts, computed in the browser from the loaded prices.
  - **The scale is a traffic light:** green is cheap, yellow is the middle, red is expensive. The user's decision (29 Oct), after two blue-to-red versions: drivers read prices that way without a legend. It breaks the usual diverging rule (a grey middle), on purpose.
  - Checked with a palette validator (OKLab colour distance): adjacent classes stay apart for colour-blind readers (worst pair yellow/light green, ΔE 8.2 protan) and for everyone else (worst pair, the two greens, ΔE 17.4). Its lightness-band check fails, but that check is for categorical palettes, and here the lightness changes on purpose.
  - The same five colours on both map styles. Contrast:

| Class | Hex | On dark `#0c0c0c` | On light `#f2f3f0` |
|---|---|---|---|
| Q1 cheapest | `#16a34a` | 5.9 | 3.0 |
| Q2 | `#4ade80` | 11.2 | 1.6 |
| Q3 middle | `#fde047` | 14.8 | 1.2 |
| Q4 | `#fb923c` | 8.6 | 2.0 |
| Q5 most expensive | `#dc2626` | 4.1 | 4.3 |

- **Two map styles,** chosen with a small `Oscuro` / `Claro` control on the map, remembered in the browser. Dark is the default.
  - **Oscuro:** OpenFreeMap Dark. Every class is at least 4:1 on the background.
  - **Claro:** OpenFreeMap Positron (background `rgb(242,243,240)`, water `rgb(194,200,202)`). Yellow and light green are too light for the background on their own, so each dot has a 1px `rgba(0,0,0,0.6)` outline, which gives the shape its contrast. The price is never only in the colour: the legend gives the ranges, and the card and the lists give the price in words.
- **Three views,** a segmented control at the top of the map: `Gasolineras` (default), `Municipios`, `Provincias`.
  - **Gasolineras:** the dots.
  - **Municipios:** each town filled by the quintile of its current average for the selected fuel, with the same scale as the dots of that style. Towns with no station selling it get no fill, only a hairline outline. Boundaries come from `es-atlas` (IGN data, CC BY 4.0: credit "© Instituto Geográfico Nacional" in the attribution), loaded only when the view is chosen. They are joined to `/api/stats/municipalities` by province and normalized name.
  - **Provincias:** the same, by province, from `/api/stats/current` (`fuels[].provinces`).
  - Tapping an area opens a small popup, with no new card type: `Toledo` / `1,869 €/l de media` / `31 gasolineras`, plus a button `Ver gasolineras aquí`, which runs the town search on that town. In a province: `Ver en el mapa`, which switches to Gasolineras and fits the province.
  - The legend title follows the view: `Gasóleo A por gasolinera`, `… media por municipio`, `… media por provincia`.
  - **Names stay readable over the fills.** The area layers go below the base map's labels, at 75% opacity. While an area view is on, every label is redrawn with a strong outline: white text on a black halo (1.6px) on the dark map, near-black text on a white halo on the light one. Back on `Gasolineras`, the style's own label colours come back.
  - Choosing a station (from a list or a search) switches the map back to `Gasolineras`, so its dot is on screen.
- **Points:** radius 3px at zoom ≤ 6, growing to 7px at zoom 14. Q1 is drawn on top and is 1px larger. A 1px stroke separates points that overlap: `#0c0c0c` on the dark map, `rgba(0,0,0,0.6)` on the light one.
- **Prices in words at street level.** From zoom 12 each dot carries its price (`1,489`) or, in the electric mode, its power (`150 kW`) under it: Noto Sans Bold 11px from the base style's own fonts, white on a black halo on the dark map, near-black on a white halo on the light one. Colour is then never the only clue (WCAG 1.4.1), and it is what a driver compares at that zoom. Where labels collide, the cheapest (or the fastest) stays.
- **Legend:** always visible, five swatches with their price ranges (`1,719–1,859`), and a title naming the fuel. Colour is never alone: the station card and the lists give the price in words.
- **Controls:**
  - "Mi ubicación", which asks for location only when tapped;
  - "Ver toda España" and "Canarias", which jump the view;
  - zoom;
  - the fuel is chosen on the price board, not on the map.
- **The top 5 in the price board** is the keyboard and screen reader way into the map: it updates when the map stops moving, and each row opens the station card and moves the map to it. There is no second list under the map.
- **Station card**, opened by tapping a dot or a list row, **on top of the map** so the answer appears where the eye already is (mehr-tanken, FuelCheck, Google Maps):
  - **Placement:**
    - desktop: a floating card at the top left of the map, below the two rows of map controls (118px from the top) and above the legend, 360px wide, `--surface`, 12px radius, shadow `0 8px 24px rgba(0,0,0,0.35)` (the one shadow on the site: it floats over the map);
    - mobile: a bottom sheet across the bottom of the map, over the legend, at most 70% of the map height, scrolling inside.
  - Close with ×, Esc or a tap on an empty part of the map. Focus moves to the card when it opens and back when it closes.
  - **The card answers one question: is this the place to fill up?** (The user, 29 Oct: no 50-litre figure, because people also pay 10 €; do not overwhelm the driver; a ranking on top; the rest behind an ⓘ.) So the face of the card has only:
    1. **The ranking**, first and the most visible line: `1.ª más barata` with, smaller, `de 31 a menos de 10 km`. The zone is the search circle when there is one; otherwise the stations of the selected fuel inside the visible map. Ties share the rank (two at 1,769 are both `1.ª`). It is shown as a pill: `--panel` background, `--led` text, the same amber as the board. It is the only colour on the card.
    2. The name (the sign text) and, smaller, the town, plus the distance when there is a search origin, on its own line.
    3. The **open status**: `Abierta 24 h`, `Abierta · cierra a las 22:00`, `Cerrada · abre a las 07:00`, or the raw schedule text. Open in `--ink`, closed in `--ink-2` with a small clock icon; never red or green.
    4. The **price of the selected fuel**, large (Fira Sans Condensed 600, 40px, `--ink`), with its unit.
    5. The other fuels the station sells, small rows of name and price. Never one without a price.
    6. The sticky actions: `Cómo llegar` (primary: Google Maps, Waze or Apple Maps) and `Compartir`, which sends a link to this site, `/?gasolinera=4375`, not to another map: whoever opens it sees the same card with the map framed on it. While a card is open the address names it (`?gasolinera=` or `?recarga=`), so it can also be copied or bookmarked.
  - **The ⓘ (`Más información`)**, an icon button next to the close button, opens a details section inside the card (a disclosure that pushes content down; no second popup). In order:
    1. **What you pay:** a small segmented control `10 €`, `20 €`, `50 €` and `Lleno`, with `Lleno` as 50 litres for litre fuels (hidden for kg fuels and AdBlue). It answers in one sentence:
       - `Con 20 €: 11,3 l. Te ahorras 0,49 € frente a la media de la zona.` for euros;
       - `Lleno (50 l): 88,45 €. Te ahorras 6,75 € frente a la media de la zona.` for a full tank.
       If the station is above the zone average: `… Pagas 0,40 € más que la media de la zona.`
    2. **The next one:** `Siguiente más barata: PETROPRIX, a 1,2 km, 1,779 €/l (1,0 céntimos más).`, as a link that opens that station's card. If this is the most expensive of the zone, it names the cheapest instead.
    3. **The zone:** `Media de la zona: 1,904 €/l (31 gasolineras).` and `4,1 céntimos menos que la media.`
    4. The 30-day line of the selected fuel (one 2px `--data` line, no axes, the last value labelled).
    5. The address, the freshness line and the coordinates in `--ink-2`.
  - The ⓘ stays open while moving between stations in the same session, so people who want details keep them, and people who do not never see them.
- **Closed stations** in the lists keep their place but show `Cerrada` in `--ink-2` after the town. The map does not hide them: the Ministry's hours are not always exact.
- **Freshness:** "Precios del Ministerio de las 13:45 del 29 oct" stays visible near the map. It is never "hoy" alone.

## Electric charging (phase 4)

Public charging sites come from the Ministry for the Ecological Transition through the DGT National Access Point (DATEX II, CC BY 4.0, refreshed daily): about 12,000 sites and 36,000 charging points, with power, connectors, operator, payment and hours. **No prices and no live availability**: the page says so where a price would be expected.

- **Same page, second mode.** `Recarga eléctrica` swaps the price board for the charging board, the fuel dots for charging dots, the price board and its top 5 for the charging board and its top 5, and the station card for the charging card. The search, the radius, the map styles and the controls stay. The town and province views and the charts below are fuel only, so they are hidden.
- **Dots by power class**, the class of the site's most powerful connector: `Lenta` (up to 7.4 kW), `Semirrápida` (7.4–22), `Rápida` (22–50), `Muy rápida` (50–150), `Ultrarrápida` (more than 150). Fixed classes, not quantiles: they are what drivers and car makers use. The fastest classes are drawn on top.
- **One hue, blue**, from a sequential ramp, so it never reads as a price: brighter as the power grows on the dark map, darker on the light one. Both pass the validator as ordinal ramps (monotone lightness, visible steps, the end nearest the background at least 2:1). The price traffic light was tried on 29 Oct and dropped by the user: power is not a price, and green-to-red made a slow charger look expensive. A test keeps the two palettes apart.

| Class | Dark map | Light map |
|---|---|---|
| Lenta | `#256abf` | `#6da7ec` |
| Semirrápida | `#3987e5` | `#3987e5` |
| Rápida | `#6da7ec` | `#256abf` |
| Muy rápida | `#9ec5f4` | `#184f95` |
| Ultrarrápida | `#cde2fb` | `#0d366b` |

- **Legend:** `Puntos de recarga por potencia máxima`, the five classes with their ranges; below the chosen class only the colour swatch fades, and the text keeps its contrast.
- **Charging card**, in the same shell as the station card (same CSS file):
  1. a pill with the class (`Ultrarrápida`);
  2. the operator as the title (`Iberdrola`, from a short brand table; other legal names lose their `S.L.`), the site's own name only when it is readable (many are codes such as `E-28-Getafe-004`), the town and the distance;
  3. the open status from the feed's hours, or `Horario no publicado` (half the sites publish none);
  4. the maximum power, large (`400 kW`), and `Potencia máxima · 26 puntos de carga`;
  5. the connectors, one row per type, current and power (`CCS2 · DC`, `2 × 400 kW`);
  6. `Pago: App, Tarjeta RFID.`;
  7. `Sin precio ni disponibilidad en tiempo real: el Ministerio no los publica.`, the address, the source line and the coordinates;
  8. the sticky actions: `Cómo llegar` and `Compartir`.

## Search near a place (phase 4)

The main action of the site, so it comes first and stays simple: one field, one choice of distance, one list. Nothing else appears until it is needed.

- **The field.**
  - One input across the panel, 52px tall, 12px radius, `--surface` with a 1px `--hairline` border, and a magnifier icon on the left.
  - Placeholder `Busca tu pueblo o ciudad`; label `Población`, visually hidden.
  - At its right end, an icon button `Usar mi ubicación` (crosshair) does the same search around the user's position.
  - When there is text, a clear button (×) appears.
- **Suggestions while typing**, from the first letter, as an ARIA combobox and listbox:
  - at most 6 rows, each with the town and, smaller in `--ink-2`, its province;
  - matching ignores accents and case, and also matches any word of the name (`hena` finds Alcalá de Henares) and either half of bilingual names (`Vila Joiosa`);
  - ranked: names that start with the text first, then by number of stations.
  - Keys: ↑/↓ move, Enter chooses, Esc closes.
  - If nothing matches: `Sin resultados. Prueba con otro nombre o usa tu ubicación.`
- **Distance**, a segmented control shown once a place is chosen: `5 km`, `10 km` (default), `25 km`, `50 km`.
- **On the map:**
  - a circle of that radius, with fill `rgba(255,255,255,0.06)` and a 1.5px `rgba(255,255,255,0.7)` stroke, plus a 6px white dot at the centre;
  - the view fits the circle;
  - stations outside it drop to 25% opacity, so the eye stays inside.
- **The top 5 becomes the nearby list:**
  - The title says what it is: `12 gasolineras a menos de 10 km de Alcalá de Henares`.
  - A two-option segmented control: `Más baratas` (default) and `Más cercanas`.
  - Each row shows name, town, the distance in Spanish format (`2,3 km`) and the price on the right.
  - A row opens the station card, as on the map.
  - When empty: `No hay gasolineras con Gasóleo A a menos de 5 km.` with a button `Ampliar a 10 km`.
- **Clearing the search** brings back the top 5 of the map and the whole map.
- **Motion:** only the map's own fly to the circle; nothing else moves.

The towns come from the station catalog: every municipality with at least one station selling now, placed at the average position of its stations. Villages without a station are not listed yet; "Usar mi ubicación" covers them.

## Layout (phase 4)

- **Mobile:**
  - a compact header;
  - the search field;
  - the price board (or the charging board);
  - the map, about 70svh;
  - the trend and provinces (fuel mode only);
  - the footer: the sources and their licences, each linked where it has a page (prices: the Ministry for the Ecological Transition on datos.gob.es; charging sites: the same Ministry through the DGT National Access Point, CC BY 4.0; boundaries: © IGN, CC BY 4.0; map: OpenFreeMap, © OpenStreetMap contributors), and that the site is not linked to the Ministry or the DGT and shows the data as published, with their time. In both modes.
- **Desktop (≥ 1024px):**
  - a 400px side panel on the left with the header, the mode, the search field and the price board with its top 5 (in the electric mode, the charging board and its list);
  - the map filling the rest of the first screen, sticky while the panel scrolls;
  - the trend and provinces in full width below.

## Motion

- Only CSS transitions of 150–200ms on hover and focus; the chart's own short entry animation is fine.
- `prefers-reduced-motion: reduce` turns chart animation off.

## Checklist before delivering a screen

- Text contrast at least 4.5:1 in light and dark mode.
- Visible focus on every control; everything works with the keyboard.
- No horizontal scroll at 375px; checked at 375, 768 and 1280px.
- No emoji as icons; inline SVG if an icon is needed.
- Province names and other API text are inserted as text, never as HTML.

## Accessibility decisions (29 Oct, after a WCAG 2.2 AA review)

- **No time limits:** the LED notice stays until it is closed (2.2.1); it no longer leaves by itself.
- **Escape belongs to the control in use:** a card closes on Escape only when the key was not pressed in another text field, such as the town search (2.4.3).
- **Live regions only for what the driver asked:** the board's average changes on every map move, so it is not announced; the cards and the notice are.
- **Every station is reachable without a pointer:** the map moves with the keyboard and the top 5 follows it; around a search, `Ver más` pages through every station or charging site of the circle. The province popup has its data in the province table.
- **Charts load when they come into view** (`@defer (on viewport)`, with a placeholder of their height), so the chart library (about 170 KB) is not part of the first load.

## Pages and tabs (phase 5)

- **Tabs:** `Mapa · Estadísticas` (and `Entrar` / `Mis gasolineras` from phase 6), quiet text links in the header with `aria-current="page"`, never a second segmented control: the map page keeps its own `Gasolina y diésel · Recarga eléctrica` switch.
- **Search engine pages** (`/precio-diesel-hoy`, `/gasolineras/{provincia}`, `/gasolineras/{provincia}/{municipio}`, `/gasolinera/{id}-{slug}`):
  - one H1 that says what and where, with the date ("Precio del diésel hoy, 29 de octubre de 2026");
  - the Ministry line ("Precios del Ministerio del 29 oct 2026, 22:45") under it;
  - figures first, then tables (real `<table>` with `<caption>` and `scope`): they are the accessible twin of the charts and what search engines read;
  - links between levels (Spain › province › town › station) as breadcrumbs and lists;
  - charts only below, loaded on viewport.
- **Width:** content pages up to 1200 px; legal texts at 72 characters per line.

## Ads (prepared in phase 5, off until phase 9)

- `app-ad-slot` reserves its exact size before the ad loads: rectangle 300×250, leaderboard 728×90 (narrower screens get the full width).
- **Places:**
  - on the province page, after the 10 cheapest;
  - on the town page, after the stations table;
  - on the statistics page, at most between two charts.

  At most two per page.
- **Never:** on the map page, inside a board, over a chart, or for an account on the ad-free plan.
- Labelled `Publicidad`, on `--surface`, so an ad never passes for content.
