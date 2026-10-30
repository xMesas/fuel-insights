package com.fuelinsights.ingestion;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MinistryTlsTest {

	@Test
	void onlyTheRsaKeyExchangeBanIsLifted() {
		String jdkDefault = "SSLv3, TLSv1, TLSv1.1, RC4, ECDH, TLS_RSA_*, rsa_pkcs1_sha1 usage HandshakeSignature";

		assertThat(MinistryTls.withoutRsaKeyExchange(jdkDefault))
			.isEqualTo("SSLv3, TLSv1, TLSv1.1, RC4, ECDH, rsa_pkcs1_sha1 usage HandshakeSignature");
	}

}
