package com.loccoc.payment.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import vn.payos.PayOS;

@Configuration
@Slf4j
public class PayOSConfig {

    @Value("${payos.client-id}")
    private String clientId;

    @Value("${payos.api-key}")
    private String apiKey;

    @Value("${payos.checksum-key}")
    private String checksumKey;

    @Bean
    public PayOS payOS() {
        log.info("Initializing PayOS Bean -> ClientID: {}, ApiKey length: {}, ChecksumKey length: {}",
                clientId != null && clientId.length() > 8 ? clientId.substring(0, 8) + "..." : clientId,
                apiKey != null ? apiKey.length() : 0,
                checksumKey != null ? checksumKey.length() : 0);
        return new PayOS(clientId, apiKey, checksumKey);
    }
}
