-- Every fuel a Spanish station sells, not only the four main ones. The list mirrors the Fuel enum; a fuel the enum
-- does not know is still refused, so a typo in a code cannot store prices nobody reads.
alter table price_daily drop constraint price_daily_fuel_check;
alter table price_current drop constraint price_current_fuel_check;

alter table price_daily add constraint price_daily_fuel_check check (fuel in (
	'GASOLEO_A', 'GASOLINA_95_E5', 'GASOLEO_PREMIUM', 'GASOLINA_98_E5', 'GLP', 'GASOLINA_95_E5_PREMIUM',
	'DIESEL_RENOVABLE', 'GASOLEO_B', 'GNC', 'GNL', 'BIOGAS_COMPRIMIDO', 'BIOGAS_LICUADO', 'GASOLINA_95_E10',
	'GASOLINA_98_E10', 'GASOLINA_RENOVABLE', 'BIODIESEL', 'GASOLINA_95_E85', 'GASOLINA_95_E25', 'BIOETANOL',
	'HIDROGENO', 'ADBLUE'));

alter table price_current add constraint price_current_fuel_check check (fuel in (
	'GASOLEO_A', 'GASOLINA_95_E5', 'GASOLEO_PREMIUM', 'GASOLINA_98_E5', 'GLP', 'GASOLINA_95_E5_PREMIUM',
	'DIESEL_RENOVABLE', 'GASOLEO_B', 'GNC', 'GNL', 'BIOGAS_COMPRIMIDO', 'BIOGAS_LICUADO', 'GASOLINA_95_E10',
	'GASOLINA_98_E10', 'GASOLINA_RENOVABLE', 'BIODIESEL', 'GASOLINA_95_E85', 'GASOLINA_95_E25', 'BIOETANOL',
	'HIDROGENO', 'ADBLUE'));
