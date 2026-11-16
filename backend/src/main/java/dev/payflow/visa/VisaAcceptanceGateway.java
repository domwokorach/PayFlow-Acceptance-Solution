package dev.payflow.visa;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** HTTP client for Visa Acceptance's test endpoint. Financial POSTs are never retried; read-only status lookups are. No card data from callers. */
public class VisaAcceptanceGateway implements VisaSandboxGateway {
    public static final URI SANDBOX = URI.create("https://apitest.visaacceptance.com");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final URI base;
    private final String merchantId;
    private final VisaJwtSigner signer;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    /** The base URI is a parameter only so tests can target a localhost fake; Spring wiring always uses SANDBOX. */
    public VisaAcceptanceGateway(URI base, String merchantId, String keyId, String base64Secret) {
        this.base = base; this.merchantId = merchantId;
        this.signer = new VisaJwtSigner(merchantId, keyId, base64Secret, Clock.systemUTC());
    }

    private static String amount(long minor) { return BigDecimal.valueOf(minor, 2).toPlainString(); }

    private static Map<String,Object> amountDetails(long minor, String currency) {
        return Map.of("totalAmount", amount(minor), "currency", currency);
    }

    @Override public ProviderResult authorize(UUID paymentId, long amountMinor, String currency) {
        Map<String,Object> body = new LinkedHashMap<>();
        body.put("clientReferenceInformation", Map.of("code", paymentId.toString()));
        body.put("processingInformation", Map.of("capture", false));
        // Fixed published sandbox test-card fixture. Never populated from user input.
        body.put("paymentInformation", Map.of("card", Map.of("number", "4111111111111111",
            "expirationMonth", "12", "expirationYear", "2031", "securityCode", "123", "type", "001")));
        body.put("orderInformation", Map.of("amountDetails", amountDetails(amountMinor, currency),
            "billTo", Map.of("firstName", "Test", "lastName", "Customer", "address1", "1 Market St",
                "locality", "London", "postalCode", "EC1A 1BB", "country", "GB", "email", "test@example.com")));
        JsonNode r = post("/pts/v2/payments", body);
        return new ProviderResult(ProviderState.fromVisa(r.path("status").asString("")), id(r), r.path("status").asString(""));
    }

    @Override public ProviderResult capture(String authorizationId, UUID paymentId, long amountMinor, String currency) {
        Map<String,Object> body = Map.of("clientReferenceInformation", Map.of("code", paymentId.toString()),
            "orderInformation", Map.of("amountDetails", amountDetails(amountMinor, currency)));
        JsonNode r = post("/pts/v2/payments/" + segment(authorizationId) + "/captures", body);
        return new ProviderResult(ProviderState.fromVisa(r.path("status").asString("")), id(r), r.path("status").asString(""));
    }

    @Override public ProviderResult refund(String captureId, UUID refundId, long amountMinor, String currency) {
        Map<String,Object> body = Map.of("clientReferenceInformation", Map.of("code", refundId.toString()),
            "orderInformation", Map.of("amountDetails", amountDetails(amountMinor, currency)));
        JsonNode r = post("/pts/v2/captures/" + segment(captureId) + "/refunds", body);
        return new ProviderResult(ProviderState.fromVisa(r.path("status").asString("")), id(r), r.path("status").asString(""));
    }

    @Override public ProviderResult status(String transactionId) {
        JsonNode r = sendIdempotent(() -> builder("/tss/v2/transactions/" + segment(transactionId), signer.sign(null)).GET().build());
        String s = r.path("applicationInformation").path("status").asString(r.path("status").asString(""));
        return new ProviderResult(ProviderState.fromVisa(s), transactionId, s);
    }

    private static String segment(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,64}")) throw new VisaProviderException("Invalid provider reference", 0);
        return id;
    }
    private static String id(JsonNode r) {
        String id = r.path("id").asString("");
        if (id.isEmpty()) throw new VisaProviderException("Visa response missing id", 0);
        return id;
    }

    private HttpRequest.Builder builder(String path, String jwt) {
        return HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(20))
            .header("Authorization", "Bearer " + jwt).header("v-c-merchant-id", merchantId)
            .header("Accept", "application/json");
    }

    private JsonNode post(String path, Object payload) {
        byte[] bytes = JSON.writeValueAsBytes(payload); // digest and transmission use these exact bytes
        HttpRequest req = builder(path, signer.sign(bytes)).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
        return send(req);
    }

    private static final long[] RETRY_BACKOFF_MS = {200, 600};
    /** Read-only requests are safe to repeat: retry transient failures (network, 429, 5xx) with backoff and a fresh JWT. */
    private JsonNode sendIdempotent(java.util.function.Supplier<HttpRequest> request) {
        for (int attempt = 0; ; attempt++) {
            try {
                return send(request.get());
            } catch (VisaProviderException e) {
                boolean transientFailure = e.httpStatus() == 0 || e.httpStatus() == 429 || e.httpStatus() >= 500;
                if (!transientFailure || attempt >= RETRY_BACKOFF_MS.length) throw e;
                try { Thread.sleep(RETRY_BACKOFF_MS[attempt]); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw e; }
            }
        }
    }

    private JsonNode send(HttpRequest req) {
        HttpResponse<byte[]> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new VisaProviderException("Visa call interrupted", 0);
        } catch (IOException e) {
            throw new VisaProviderException("Visa call failed: " + e.getClass().getSimpleName(), 0);
        }
        if (res.statusCode() / 100 != 2) throw new VisaProviderException("Visa returned HTTP " + res.statusCode(), res.statusCode());
        try {
            return JSON.readTree(new String(res.body(), StandardCharsets.UTF_8));
        } catch (RuntimeException e) {
            throw new VisaProviderException("Visa response was not valid JSON", res.statusCode());
        }
    }
}
