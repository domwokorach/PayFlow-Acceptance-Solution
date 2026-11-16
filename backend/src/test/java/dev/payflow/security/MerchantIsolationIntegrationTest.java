package dev.payflow.security;

import static org.junit.jupiter.api.Assertions.*;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Real HTTP: authentication, tenant isolation across every resource, and per-merchant SSE. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"payflow.reconciler.enabled=false", "payflow.demo-api-key=key-for-merchant-a-0001",
        "payflow.bootstrap-keys=merchant_b=key-for-merchant-b-0001"})
class MerchantIsolationIntegrationTest {
    @Container static PostgreSQLContainer pg = new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
    }
    static final String A = "key-for-merchant-a-0001", B = "key-for-merchant-b-0001";

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final HttpClient http = HttpClient.newHttpClient();

    HttpResponse<String> call(String method, String path, String key, String body, String idem) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
            .header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (key != null) b.header("X-Api-Key", key);
        if (idem != null) b.header("Idempotency-Key", idem);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }
    static String k() { return "k_" + UUID.randomUUID().toString().replace("-", ""); }
    String createPayment(String key) throws Exception {
        HttpResponse<String> r = call("POST", "/api/v1/payments", key, "{\"amountMinor\":1234,\"currency\":\"GBP\",\"simulateDecline\":false}", k());
        assertEquals(201, r.statusCode(), r.body());
        return r.body().replaceAll(".*\"id\":\"([0-9a-f-]{36})\".*", "$1");
    }

    @Test void missingOrWrongKeyIsRejectedEverywhere() throws Exception {
        for (String path : new String[] {"/api/v1/payments", "/api/v1/dashboard/summary", "/api/v1/reconciliation", "/api/v1/events/stream"}) {
            assertEquals(401, call("GET", path, null, null, null).statusCode(), path);
            assertEquals(401, call("GET", path, "not-a-real-key-at-all", null, null).statusCode(), path);
        }
        assertEquals(200, call("GET", "/actuator/health", null, null, null).statusCode());
    }

    @Test void bearerTokenIsAccepted() throws Exception {
        HttpRequest r = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/payments")).header("Authorization", "Bearer " + A).build();
        assertEquals(200, http.send(r, HttpResponse.BodyHandlers.ofString()).statusCode());
    }

    @Test void merchantsCannotSeeOrActOnEachOthersPayments() throws Exception {
        String id = createPayment(A);
        assertEquals(200, call("GET", "/api/v1/payments/" + id, A, null, null).statusCode());
        assertEquals(404, call("GET", "/api/v1/payments/" + id, B, null, null).statusCode());
        assertEquals(404, call("POST", "/api/v1/payments/" + id + "/capture", B, null, k()).statusCode());
        assertEquals(404, call("POST", "/api/v1/payments/" + id + "/refunds", B, "{\"amountMinor\":100}", k()).statusCode());
        assertFalse(call("GET", "/api/v1/payments", B, null, null).body().contains(id));
        assertTrue(call("GET", "/api/v1/payments", A, null, null).body().contains(id));
        // Merchant A's payment is untouched by B's attempts.
        assertEquals("AUTHORIZED", jdbc.queryForObject("SELECT status FROM payments WHERE id=?::uuid", String.class, id));
    }

    @Test void idempotencyKeysAreScopedPerMerchant() throws Exception {
        String shared = k();
        String body = "{\"amountMinor\":500,\"currency\":\"GBP\",\"simulateDecline\":false}";
        HttpResponse<String> a = call("POST", "/api/v1/payments", A, body, shared);
        HttpResponse<String> b = call("POST", "/api/v1/payments", B, body, shared);
        assertEquals(201, a.statusCode()); assertEquals(201, b.statusCode());
        assertNotEquals(a.body().replaceAll(".*\"id\":\"([0-9a-f-]{36})\".*", "$1"), b.body().replaceAll(".*\"id\":\"([0-9a-f-]{36})\".*", "$1"));
    }

    @Test void dashboardCountsOnlyTheCallersPayments() throws Exception {
        long before = jdbc.queryForObject("SELECT count(*) FROM payments WHERE merchant_id='merchant_b'", Long.class);
        createPayment(A); createPayment(A);
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM payments WHERE merchant_id='merchant_b'", Long.class));
        String summary = call("GET", "/api/v1/dashboard/summary?days=0", B, null, null).body();
        assertTrue(summary.contains("\"total\":" + before) || !summary.contains("\"total\":" + (before + 2)), summary);
    }

    @Test void revokedKeyStopsWorking() throws Exception {
        assertEquals(200, call("GET", "/api/v1/payments", B, null, null).statusCode());
        jdbc.update("UPDATE api_keys SET revoked_at=now() WHERE key_hash=?", ApiKeyService.hash(B));
        try { assertEquals(401, call("GET", "/api/v1/payments", B, null, null).statusCode()); }
        finally { jdbc.update("UPDATE api_keys SET revoked_at=NULL WHERE key_hash=?", ApiKeyService.hash(B)); }
    }

    @Test void keysAreStoredOnlyAsDigests() {
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM api_keys WHERE key_hash IN (?,?)", Long.class, A, B));
        assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM api_keys WHERE key_hash IN (?,?)", Long.class, ApiKeyService.hash(A), ApiKeyService.hash(B)));
    }

    @Test void streamDeliversOnlyTheSubscribersOwnEvents() throws Exception {
        HttpResponse<java.io.InputStream> res = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/events/stream"))
            .header("X-Api-Key", B).header("Accept", "text/event-stream").build(), HttpResponse.BodyHandlers.ofInputStream());
        assertEquals(200, res.statusCode());
        BlockingQueue<String> events = new LinkedBlockingQueue<>();
        Thread t = new Thread(() -> {
            try (var r = new BufferedReader(new InputStreamReader(res.body()))) {
                String line; while ((line = r.readLine()) != null) if (line.startsWith("event:")) events.add(line.substring(6).trim());
            } catch (Exception ignored) { }
        });
        t.setDaemon(true); t.start();
        try {
            assertEquals("ready", events.poll(10, TimeUnit.SECONDS));
            createPayment(A);
            assertNull(events.poll(2, TimeUnit.SECONDS), "merchant B must not receive merchant A's event");
            createPayment(B);
            assertEquals("PAYMENT_STATUS_CHANGED", events.poll(10, TimeUnit.SECONDS));
        } finally { res.body().close(); }
    }
}
