package dev.payflow.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** API keys are high-entropy secrets, stored only as SHA-256 digests; a database leak does not reveal usable keys. */
@Service
public class ApiKeyService {
    private final JdbcTemplate jdbc;
    public ApiKeyService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** @return the owning merchant id, or null when the key is unknown or revoked */
    public String merchantFor(String key) {
        if (key == null || key.isBlank() || key.length() > 256) return null;
        List<String> found = jdbc.queryForList(
            "SELECT merchant_id FROM api_keys WHERE key_hash=? AND revoked_at IS NULL", String.class, hash(key));
        return found.isEmpty() ? null : found.getFirst();
    }
}
