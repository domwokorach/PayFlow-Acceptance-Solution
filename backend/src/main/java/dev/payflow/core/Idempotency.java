package dev.payflow.core;

import dev.payflow.security.MerchantContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class Idempotency {
    public record Outcome<T>(UUID responseId, T response) {}
    private record Stored(String fingerprint, UUID responseId) {}
    private final JdbcTemplate jdbc;
    public Idempotency(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static String fingerprint(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    /** Must run within caller's DB transaction. ON CONFLICT serializes concurrent keys. */
    public <T> T execute(String key, String requestDescription, Function<UUID,T> replay,
                         Supplier<Outcome<T>> firstExecution) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{8,128}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key must be 8-128 letters, digits, - or _");
        }
        String fingerprint = fingerprint(requestDescription);
        jdbc.update("""
          INSERT INTO idempotency_keys (merchant_id,idempotency_key,request_fingerprint)
          VALUES (?, ?, ?) ON CONFLICT (merchant_id,idempotency_key) DO NOTHING
          """, MerchantContext.current(), key, fingerprint);
        Stored stored = jdbc.queryForObject("""
          SELECT request_fingerprint,response_id FROM idempotency_keys
          WHERE merchant_id=? AND idempotency_key=? FOR UPDATE
          """, (rs,n) -> new Stored(rs.getString(1), (UUID) rs.getObject(2)), MerchantContext.current(), key);
        if (stored == null || !stored.fingerprint().equals(fingerprint)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Idempotency-Key already used for another request");
        }
        if (stored.responseId() != null) return replay.apply(stored.responseId());
        Outcome<T> result = firstExecution.get();
        jdbc.update("""
          UPDATE idempotency_keys SET response_id=?
          WHERE merchant_id=? AND idempotency_key=?
          """, result.responseId(), MerchantContext.current(), key);
        return result.response();
    }
}
