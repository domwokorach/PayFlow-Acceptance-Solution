package dev.payflow.security;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Registers keys from configuration at startup: PAYFLOW_DEMO_API_KEY for demo_merchant and optional
 * PAYFLOW_BOOTSTRAP_KEYS="merchantId=key,other=key". Bootstrap keys no longer configured are revoked, so
 * rotating an environment variable really invalidates the old key.
 */
@Configuration
public class ApiKeyBootstrap {
    private static final Logger log = LoggerFactory.getLogger(ApiKeyBootstrap.class);
    static final int MIN_KEY_LENGTH = 16;

    static final int STRICT_MIN_KEY_LENGTH = 32;
    static final String LOCAL_DEFAULT_KEY = "local-only-change-me";

    /** Messages never include the key. Strict mode is for internet-reachable deployments. */
    static void checkKey(String key, boolean strict) {
        if (key.length() < MIN_KEY_LENGTH) throw new IllegalArgumentException("API keys must be at least " + MIN_KEY_LENGTH + " characters");
        if (!strict) return;
        if (LOCAL_DEFAULT_KEY.equals(key)) throw new IllegalArgumentException("The well-known local API key is not allowed when PAYFLOW_REQUIRE_STRONG_KEYS=true");
        if (key.length() < STRICT_MIN_KEY_LENGTH) throw new IllegalArgumentException("API keys must be at least " + STRICT_MIN_KEY_LENGTH + " characters when PAYFLOW_REQUIRE_STRONG_KEYS=true");
    }

    @Bean ApplicationRunner registerConfiguredKeys(JdbcTemplate jdbc,
            @Value("${payflow.demo-api-key:}") String demoKey, @Value("${payflow.bootstrap-keys:}") String extra,
            @Value("${payflow.require-strong-keys:false}") boolean strict) {
        return args -> {
            List<String[]> pairs = new ArrayList<>();
            if (!demoKey.isBlank()) pairs.add(new String[] {"demo_merchant", demoKey});
            for (String item : extra.split(",")) {
                if (item.isBlank()) continue;
                int eq = item.indexOf('=');
                if (eq < 1) throw new IllegalArgumentException("PAYFLOW_BOOTSTRAP_KEYS entries must be merchantId=key");
                pairs.add(new String[] {item.substring(0, eq).trim(), item.substring(eq + 1).trim()});
            }
            List<String> current = new ArrayList<>();
            for (String[] p : pairs) {
                if (!p[0].matches("[A-Za-z0-9_-]{1,60}")) throw new IllegalArgumentException("Invalid merchant id");
                checkKey(p[1], strict);
                String hash = ApiKeyService.hash(p[1]);
                current.add(hash);
                jdbc.update("INSERT INTO merchants (id, display_name) VALUES (?, ?) ON CONFLICT (id) DO NOTHING", p[0], p[0]);
                jdbc.update("""
                    INSERT INTO api_keys (id, merchant_id, key_hash, label) VALUES (?, ?, ?, 'bootstrap')
                    ON CONFLICT (key_hash) DO UPDATE SET revoked_at = NULL WHERE api_keys.merchant_id = EXCLUDED.merchant_id""",
                    UUID.randomUUID(), p[0], hash);
            }
            int revoked = jdbc.update("UPDATE api_keys SET revoked_at=now() WHERE label='bootstrap' AND revoked_at IS NULL AND NOT (key_hash = ANY (?))",
                ps -> ps.setArray(1, ps.getConnection().createArrayOf("text", current.toArray())));
            if (current.isEmpty()) log.warn("No API keys configured: every /api/v1 request will be rejected");
            if (revoked > 0) log.info("Revoked {} bootstrap API key(s) no longer configured", revoked);
        };
    }
}
