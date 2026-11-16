package dev.payflow.visa;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import tools.jackson.databind.json.JsonMapper;

/** JWT v2 (shared secret, HS256). POST tokens carry a digest of the exact transmitted body bytes. */
public class VisaJwtSigner {
    static final long TTL_SECONDS = 60; // Visa requires expiry within 100 seconds
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Base64.Encoder B64URL = Base64.getUrlEncoder().withoutPadding();
    private final String merchantId, keyId;
    private final byte[] secret;
    private final Clock clock;

    public VisaJwtSigner(String merchantId, String keyId, String base64Secret, Clock clock) {
        this.merchantId = merchantId; this.keyId = keyId; this.clock = clock;
        this.secret = Base64.getDecoder().decode(base64Secret.trim());
    }

    /** @param body exact POST bytes, or null for GET (no digest claims). */
    public String sign(byte[] body) {
        try {
            Map<String,Object> header = new LinkedHashMap<>();
            header.put("alg", "HS256"); header.put("typ", "JWT");
            header.put("kid", keyId); header.put("v-c-merchant-id", merchantId);
            long iat = clock.instant().getEpochSecond();
            Map<String,Object> claims = new LinkedHashMap<>();
            claims.put("iat", iat); claims.put("exp", iat + TTL_SECONDS);
            claims.put("jti", UUID.randomUUID().toString());
            if (body != null) {
                claims.put("digest", Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(body)));
                claims.put("digestAlgorithm", "SHA-256");
            }
            String signingInput = B64URL.encodeToString(JSON.writeValueAsBytes(header)) + "."
                + B64URL.encodeToString(JSON.writeValueAsBytes(claims));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return signingInput + "." + B64URL.encodeToString(mac.doFinal(signingInput.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IllegalStateException("Unable to sign Visa request", e);
        }
    }
}
