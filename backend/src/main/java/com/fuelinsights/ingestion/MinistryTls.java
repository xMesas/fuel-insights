package com.fuelinsights.ingestion;

import java.security.Security;
import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * The Ministry server only accepts TLS 1.2 with RSA key exchange ({@code AES256-GCM-SHA384}, checked with
 * {@code openssl s_client}), and JDK 25 disables that family ({@code TLS_RSA_*}) by default. This lifts that one
 * entry and keeps every other restriction. It is a JVM-wide security property, so it must run before the first TLS
 * connection; servers that offer forward secrecy still get it, because the JDK prefers ECDHE suites.
 */
public final class MinistryTls {

	static final String DISABLED_ALGORITHMS = "jdk.tls.disabledAlgorithms";

	private MinistryTls() {
	}

	public static void allowRsaKeyExchange() {
		Security.setProperty(DISABLED_ALGORITHMS, withoutRsaKeyExchange(Security.getProperty(DISABLED_ALGORITHMS)));
	}

	static String withoutRsaKeyExchange(String disabledAlgorithms) {
		return Arrays.stream(disabledAlgorithms.split(","))
			.map(String::trim)
			.filter((algorithm) -> !algorithm.equals("TLS_RSA_*"))
			.collect(Collectors.joining(", "));
	}

}
