package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class VisaJwtSignerTest {
    private static final byte[] SECRET = "test-shared-secret-0123456789abc".getBytes(StandardCharsets.UTF_8);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-15T10:00:00Z"), ZoneOffset.UTC);
    private final VisaJwtSigner signer = new VisaJwtSigner("mid", "kid-1", Base64.getEncoder().encodeToString(SECRET), clock);
    private final JsonMapper json = JsonMapper.builder().build();

    private JsonNode part(String jwt, int i) {
        return json.readTree(Base64.getUrlDecoder().decode(jwt.split("\\.")[i]));
    }

    @Test void postTokenHasClaimsDigestAndValidHmac() throws Exception {
        byte[] body = "{\"a\":1}".getBytes(StandardCharsets.UTF_8);
        String jwt = signer.sign(body);
        JsonNode h = part(jwt, 0), c = part(jwt, 1);
        assertEquals("HS256", h.get("alg").asString());
        assertEquals("kid-1", h.get("kid").asString());
        assertEquals("mid", h.get("v-c-merchant-id").asString());
        assertEquals(clock.instant().getEpochSecond(), c.get("iat").asLong());
        assertTrue(c.get("exp").asLong() - c.get("iat").asLong() <= 100);
        assertFalse(c.get("jti").asString().isEmpty());
        assertEquals("SHA-256", c.get("digestAlgorithm").asString());
        assertEquals(Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(body)), c.get("digest").asString());
        String[] p = jwt.split("\\.");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET, "HmacSHA256"));
        String expected = Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal((p[0] + "." + p[1]).getBytes(StandardCharsets.US_ASCII)));
        assertEquals(expected, p[2]);
    }

    @Test void getTokenHasNoDigest() {
        JsonNode c = part(signer.sign(null), 1);
        assertFalse(c.has("digest"));
        assertFalse(c.has("digestAlgorithm"));
    }

    @Test void eachTokenHasNewJti() {
        assertNotEquals(part(signer.sign(null), 1).get("jti").asString(), part(signer.sign(null), 1).get("jti").asString());
    }
}
