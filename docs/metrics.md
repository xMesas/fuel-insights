# Metric definitions

## Effective date

The day the prices were in force, taken from the Ministry history endpoint (`EstacionesTerrestresHist/{date}`). The web always shows this date; it never says "today".

## Current prices

The prices in force now come from the Ministry's list of every station (`EstacionesTerrestres/`), which it refreshes every half hour.
- The app checks it every 15 minutes.
- A list with the same Ministry time is not written again.
- A new list replaces the old one in one transaction, so a price that is no longer published disappears.
- The web shows the Ministry's time for the list (`Fecha`, Madrid time), never "now" alone.
- `fuel_insights.current.age` counts the minutes since that time: normally under 45.

The current averages (national and per province) are simple means over the stations of the current list. "Yesterday" is the national average of the latest published day. "Highest of the period" is the highest national daily average among the published days loaded, not since 2007.

## Price

Retail price in EUR per litre, taxes included, 3 decimals, as published.

## Average price

Simple mean of the station prices for one fuel, one day and one area (province or country). Not weighted by sales volume, because the source does not publish volumes.

## Min / max

Lowest and highest station price in that group.

## Median

The middle station price, computed with `percentile_cont(0.5)` in `DailyStatsRepository`. For an even number of prices, it uses the mean of the two middle values. The result is rounded to 3 decimals.

## Stations (n)

Number of stations with a price for that fuel that day. Every aggregate shows it, so a low-coverage province is visible.

## Missing days

Days without data are not filled or interpolated; charts show a gap.

## 7-day moving average

The mean of the daily average prices over the 7 calendar days ending on that day. Each day with data has the same weight. The SQL in `StatsRepository.trend` uses `RANGE` over dates, not `ROWS`, so a missing day does not stretch the window.

The calculation starts 6 days before `from`, then returns only the requested dates. This keeps the first points independent of the requested range. The moving average is `null` on a day without data, or when fewer than 4 days in the window have data. Results are rounded to 3 decimals.

## Complete days only

A day is shown only after its import finished; a half-imported day is never visible.

## Published days

The web reads price statistics only from `price_stats_daily`. In `ImportJobConfig.publishDay`, these aggregates are rebuilt in the same transaction that marks the day published in `import_day`. During a re-import, the previous numbers stay visible until the new ones are published. If the re-import fails, the previous numbers stay visible.

## Province of the day

Province aggregates group prices by `price_daily.province_id`: the province the station had on that day, not its province in today's station catalog. A later catalog change does not move old prices to another province.

## Cheapest and most expensive province

Chosen among the peninsula and the Balearic Islands only. Las Palmas, Santa Cruz de Tenerife, Ceuta and Melilla (Ministry province IDs 35, 38, 51 and 52) have lower fuel taxes, so they would always win "cheapest" without saying anything about the market. The web shows them in their own chart and in the province table.

## Change in 7 days

The daily average of the latest day minus the daily average of the same area and fuel 7 calendar days earlier. If either day has no data, no change is shown.

## Zone figures (price board)

For a zone (the visible map as a box of longitudes and latitudes, a circle around the search point, or one province) and each fuel:

- **Cheapest:** the lowest current price of the stations inside the zone.
- **Average:** the mean of their current prices, rounded to 3 decimals.
- **Change in a week:** the average now minus the average of the same zone on the day seven days before the Ministry's current list, from that day's raw prices. Only a complete day counts; otherwise no change is shown. The stations of the two days need not be the same ones.

A station is inside a circle when its haversine distance to the centre (Earth radius 6,371 km) is at most the radius: the same formula as the web's list.

## Charging sites

- **Power class:** the class of the site's most powerful connector: up to 7.4 kW `Lenta`, up to 22 `Semirrápida`, up to 50 `Rápida`, up to 150 `Muy rápida`, above 150 `Ultrarrápida`.
- **Power:** the feed's `maxPowerAtSocket` in watts, shown in kW with one decimal. A connector under 1 kW (six in the feed, such as 60 W) is a typing error and is left out; a site with no connector left keeps its card but has no dot.
- **Charging points:** the feed's refill points. One point can have several connectors, used one at a time.
- **Connectors:** grouped by type, current (DC for `mode4DC`, AC otherwise) and power.

## Brands

`BrandNormalizer` maps the free-text station sign to a brand using `brands.csv`. It trims the sign and converts it to uppercase, then tries an exact match. If there is none, it looks for a known brand as a whole word, with longer names first. If none matches, the brand is `INDEPENDENT`.

## Statistics tab

- **Cheapest weekday:** for each published day of the last 365, the national average minus the centred 7-day average around it (the 3 days before, the day and the 3 after; days without all 7 are left out). The figure for a weekday is the mean of those differences, in euros per litre: below zero means cheaper than its week. The centred average takes the trend out: in a year of rising prices the first day of each week would otherwise look cheap only because it comes first.
- **What choosing saves:** in Spain and in each province, the 10th percentile of the current prices ("one of the cheap stations") and the 90th ("one of the dear ones"), interpolated (`percentile_cont`). The extremes are not used: the single dearest station is often a motorway one nobody chooses. The saving for a 50-litre tank is the difference times 50.
- **Brands:** the mean current price of each brand (see Brands below) with at least 50 stations selling the fuel, against the national mean. Brands with fewer stations would rank on a handful of stations in one town.

## Search engine pages

- **Latest day** and **highest day** of a province or of Spain: the average of the latest published day, and the highest daily average over the published history (the latest wins a tie), from the published aggregates.
- **Cheapest stations:** the 10 lowest current prices of the fuel in the area; a tie goes to the lower station id.
- **Town figures:** mean and minimum of the current prices of the town's stations, against the province mean. A town is every register spelling that gives the same address (`Hospitalet de Llobregat, L'` and `L'Hospitalet de Llobregat` are one page).
- **Nearby stations:** up to 6 stations selling now within 10 km (haversine), nearest first.
