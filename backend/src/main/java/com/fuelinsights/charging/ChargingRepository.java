package com.fuelinsights.charging;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.fuelinsights.charging.ChargingSite.ChargingConnector;
import com.fuelinsights.charging.ChargingSitesResponse.MapSite;

/** Stores and reads the snapshot of charging sites. The caller runs {@link #replace} in one transaction. */
@Repository
class ChargingRepository {

	private static final String INSERT_SITE = """
			insert into charging_site (id, name, operator, address, town, province, postcode, latitude, longitude,
				max_power_kw, points, schedule, payment, updated_at)
			values (:id, :name, :operator, :address, :town, :province, :postcode, :latitude, :longitude, :maxPowerKw,
				:points, :schedule, :payment, :updatedAt)
			""";

	private static final String INSERT_CONNECTOR = """
			insert into charging_connector (site_id, connector_type, current, power_kw, connectors)
			values (:siteId, :type, :current, :powerKw, :count)
			""";

	private static final String UPSERT_SNAPSHOT = """
			insert into charging_snapshot (id, published_at, imported_at, sites, points)
			values (true, :publishedAt, :importedAt, :sites, :points)
			on conflict (id) do update set published_at = excluded.published_at, imported_at = excluded.imported_at,
				sites = excluded.sites, points = excluded.points
			""";

	private final JdbcClient jdbc;

	private final NamedParameterJdbcTemplate template;

	ChargingRepository(JdbcClient jdbc, NamedParameterJdbcTemplate template) {
		this.jdbc = jdbc;
		this.template = template;
	}

	/** The feed time of the snapshot stored now, if there is one. */
	Optional<Instant> publishedAt() {
		return this.jdbc.sql("select published_at from charging_snapshot")
			.query((rs, rowNum) -> rs.getObject(1, OffsetDateTime.class).toInstant())
			.optional();
	}

	/** Replaces every site: a site missing from the new feed does not survive. */
	void replace(Instant publishedAt, Instant importedAt, List<ChargingSite> sites) {
		this.jdbc.sql("delete from charging_connector").update();
		this.jdbc.sql("delete from charging_site").update();
		this.template.batchUpdate(INSERT_SITE, sites.stream()
			.map((site) -> new MapSqlParameterSource().addValue("id", site.id())
				.addValue("name", site.name())
				.addValue("operator", site.operator())
				.addValue("address", site.address())
				.addValue("town", site.town())
				.addValue("province", site.province())
				.addValue("postcode", site.postcode())
				.addValue("latitude", site.latitude())
				.addValue("longitude", site.longitude())
				.addValue("maxPowerKw", site.maxPowerKw())
				.addValue("points", site.points())
				.addValue("schedule", site.schedule())
				.addValue("payment", site.payment().toArray(String[]::new))
				.addValue("updatedAt", (site.updatedAt() != null) ? site.updatedAt().atOffset(ZoneOffset.UTC) : null))
			.toArray(SqlParameterSource[]::new));
		this.template.batchUpdate(INSERT_CONNECTOR, sites.stream()
			.flatMap((site) -> site.connectors()
				.stream()
				.map((connector) -> new MapSqlParameterSource().addValue("siteId", site.id())
					.addValue("type", connector.type())
					.addValue("current", connector.current())
					.addValue("powerKw", connector.powerKw())
					.addValue("count", connector.count())))
			.toArray(SqlParameterSource[]::new));
		this.jdbc.sql(UPSERT_SNAPSHOT)
			.param("publishedAt", publishedAt.atOffset(ZoneOffset.UTC))
			.param("importedAt", importedAt.atOffset(ZoneOffset.UTC))
			.param("sites", sites.size())
			.param("points", sites.stream().mapToInt(ChargingSite::points).sum())
			.update();
	}

	/** Every site with a known power, for the map. */
	List<MapSite> mapSites() {
		return this.jdbc.sql("""
				select id, latitude, longitude, max_power_kw, points from charging_site
				where max_power_kw is not null order by id
				""")
			.query((rs, rowNum) -> new MapSite(rs.getString(1), rs.getBigDecimal(2), rs.getBigDecimal(3),
					rs.getBigDecimal(4), rs.getInt(5)))
			.list();
	}

	/** The names a list shows, for a few sites at a time. */
	List<SummaryRow> summaries(List<String> ids) {
		return this.jdbc.sql("select id, name, operator, town, schedule from charging_site where id = any(:ids)")
			.param("ids", ids.toArray(String[]::new))
			.query((rs, rowNum) -> new SummaryRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4),
					rs.getString(5)))
			.list();
	}

	// Two queries, one snapshot: an import committed between them cannot mix two versions of the site.
	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	Optional<ChargingSite> site(String id) {
		List<ChargingConnector> connectors = this.jdbc.sql("""
				select connector_type, current, power_kw, connectors from charging_connector
				where site_id = :id order by power_kw desc, connector_type
				""")
			.param("id", id)
			.query((rs, rowNum) -> new ChargingConnector(rs.getString(1), rs.getString(2), rs.getBigDecimal(3),
					rs.getInt(4)))
			.list();
		return this.jdbc.sql("""
				select id, name, operator, address, town, province, postcode, latitude, longitude, schedule, payment,
					points, updated_at
				from charging_site where id = :id
				""")
			.param("id", id)
			.query((rs, rowNum) -> new ChargingSite(rs.getString("id"), rs.getString("name"), rs.getString("operator"),
					rs.getString("address"), rs.getString("town"), rs.getString("province"), rs.getString("postcode"),
					rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"), rs.getString("schedule"),
					strings(rs.getArray("payment")), rs.getInt("points"), connectors, instant(rs, "updated_at")))
			.optional();
	}

	private static List<String> strings(Array array) throws SQLException {
		return (array != null) ? Arrays.asList((String[]) array.getArray()) : List.of();
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		OffsetDateTime time = rs.getObject(column, OffsetDateTime.class);
		return (time != null) ? time.toInstant() : null;
	}

	record SummaryRow(String id, String name, String operator, String town, String schedule) {
	}

}
