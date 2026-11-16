package dev.payflow.api;

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

/** Real HTTP and PostgreSQL: merchant profile updates, validation, tenant scoping, persistence and the MERCHANT_UPDATED event. */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {"payflow.reconciler.enabled=false", "payflow.demo-api-key=key-for-merchant-a-0001",
        "payflow.bootstrap-keys=merchant_b=key-for-merchant-b-0001"})
class MerchantApiIntegrationTest {
    @Container static PostgreSQLContainer pg = new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
    }
    static final String A = "key-for-merchant-a-0001", B = "key-for-merchant-b-0001", MA = "demo_merchant", MB = "merchant_b";

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final HttpClient http = HttpClient.newHttpClient();

    HttpResponse<String> call(String method, String path, String key, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (key != null) b.header("X-Api-Key", key);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> patch(String id, String key, String body) throws Exception { return call("PATCH", "/api/v1/merchants/" + id, key, body); }
    String column(String col, String id) { return jdbc.queryForObject("SELECT " + col + " FROM merchants WHERE id=?", String.class, id); }
    long merchantEvents(String id) { return jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE merchant_id=? AND type='MERCHANT_UPDATED'", Long.class, id); }

    @Test void successfulUpdateIsReturnedAndPersistedInPostgres() throws Exception {
        HttpResponse<String> r = patch(MA, A, "{\"displayName\":\"  Acme Retail  \",\"contactEmail\":\"ops@acme.example\",\"businessName\":\"Acme Retail Ltd\"}");
        assertEquals(200, r.statusCode(), r.body());
        assertTrue(r.body().contains("\"displayName\":\"Acme Retail\""), r.body()); // trimmed
        assertTrue(r.body().contains("\"contactEmail\":\"ops@acme.example\""), r.body());
        // Persisted, not just echoed.
        assertEquals("Acme Retail", column("display_name", MA));
        assertEquals("ops@acme.example", column("contact_email", MA));
        assertEquals("Acme Retail Ltd", column("business_name", MA));
        // And visible through the list endpoint.
        assertTrue(call("GET", "/api/v1/merchants", A, null).body().contains("Acme Retail Ltd"));
    }

    @Test void partialUpdateLeavesOtherFieldsAndEmptyStringClearsOptionalOnes() throws Exception {
        assertEquals(200, patch(MA, A, "{\"displayName\":\"Partial Co\",\"contactEmail\":\"a@partial.example\"}").statusCode());
        assertEquals(200, patch(MA, A, "{\"businessName\":\"Partial Co Ltd\"}").statusCode());
        assertEquals("Partial Co", column("display_name", MA));
        assertEquals("a@partial.example", column("contact_email", MA));
        assertEquals(200, patch(MA, A, "{\"contactEmail\":\"\"}").statusCode());
        assertNull(column("contact_email", MA));
        assertEquals("Partial Co Ltd", column("business_name", MA));
    }

    @Test void blankDisplayNameIsRejectedWithAFieldMessageAndNothingChanges() throws Exception {
        String before = column("display_name", MA);
        HttpResponse<String> r = patch(MA, A, "{\"displayName\":\"   \"}");
        assertEquals(400, r.statusCode());
        assertTrue(r.body().contains("\"fields\"") && r.body().contains("displayName") && r.body().contains("Display name is required"), r.body());
        assertEquals(before, column("display_name", MA));
    }

    @Test void invalidEmailIsRejectedWithAFieldMessage() throws Exception {
        for (String bad : new String[] {"not-an-email", "a@b", "a b@c.example", "@c.example"}) {
            HttpResponse<String> r = patch(MA, A, "{\"contactEmail\":\"" + bad + "\"}");
            assertEquals(400, r.statusCode(), bad);
            assertTrue(r.body().contains("contactEmail") && r.body().contains("valid email"), r.body());
        }
    }

    @Test void tooLongValuesAndEmptyBodiesAreRejected() throws Exception {
        assertEquals(400, patch(MA, A, "{\"displayName\":\"" + "x".repeat(121) + "\"}").statusCode());
        assertEquals(400, patch(MA, A, "{}").statusCode());
        assertEquals(400, patch(MA, A, "{not json").statusCode());
    }

    @Test void missingOrInvalidKeyIsUnauthorizedAndChangesNothing() throws Exception {
        String before = column("display_name", MA);
        assertEquals(401, patch(MA, null, "{\"displayName\":\"Hijacked\"}").statusCode());
        assertEquals(401, patch(MA, "not-a-real-key-at-all", "{\"displayName\":\"Hijacked\"}").statusCode());
        assertEquals(401, call("GET", "/api/v1/merchants", null, null).statusCode());
        assertEquals(before, column("display_name", MA));
    }

    @Test void aMerchantCannotUpdateAnotherMerchant() throws Exception {
        String beforeA = column("display_name", MA), beforeB = column("display_name", MB);
        assertEquals(404, patch(MA, B, "{\"displayName\":\"Taken over by B\"}").statusCode());
        assertEquals(404, patch(MB, A, "{\"displayName\":\"Taken over by A\"}").statusCode());
        assertEquals(beforeA, column("display_name", MA));
        assertEquals(beforeB, column("display_name", MB));
        // Each key sees only its own merchant.
        String listB = call("GET", "/api/v1/merchants", B, null).body();
        assertTrue(listB.contains(MB) && !listB.contains(MA), listB);
    }

    @Test void unknownMerchantIsNotFound() throws Exception {
        HttpResponse<String> r = patch("no_such_merchant", A, "{\"displayName\":\"Ghost\"}");
        assertEquals(404, r.statusCode());
        assertTrue(r.body().contains("Merchant not found"), r.body());
    }

    @Test void identifiersAndCredentialsCannotBeChangedThroughTheUpdate() throws Exception {
        long keysBefore = jdbc.queryForObject("SELECT count(*) FROM api_keys WHERE merchant_id=?", Long.class, MA);
        HttpResponse<String> r = patch(MA, A, "{\"displayName\":\"Safe Name\",\"id\":\"stolen\",\"apiKey\":\"x\",\"createdAt\":\"2000-01-01T00:00:00Z\"}");
        assertEquals(200, r.statusCode(), r.body());
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM merchants WHERE id=?", Long.class, MA));
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM merchants WHERE id='stolen'", Long.class));
        assertEquals(keysBefore, jdbc.queryForObject("SELECT count(*) FROM api_keys WHERE merchant_id=?", Long.class, MA));
        assertNotEquals("2000-01-01", column("created_at::date", MA));
        assertEquals("Safe Name", column("display_name", MA));
    }

    @Test void updateWritesAnAuditRowAndAnEventWithoutPersonalData() throws Exception {
        long events = merchantEvents(MA);
        assertEquals(200, patch(MA, A, "{\"contactEmail\":\"private@audit.example\"}").statusCode());
        assertEquals(events + 1, merchantEvents(MA));
        String audit = jdbc.queryForObject("SELECT detail FROM audit_log WHERE merchant_id=? AND action='MERCHANT_UPDATED' ORDER BY created_at DESC LIMIT 1", String.class, MA);
        assertEquals("fields: contactEmail", audit);
        // A rejected update emits nothing.
        assertEquals(400, patch(MA, A, "{\"contactEmail\":\"nope\"}").statusCode());
        assertEquals(events + 1, merchantEvents(MA));
    }

    @Test void streamDeliversMerchantUpdatedOnlyToTheOwnerAndWithoutDetails() throws Exception {
        HttpResponse<java.io.InputStream> res = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/events/stream"))
            .header("X-Api-Key", A).header("Accept", "text/event-stream").build(), HttpResponse.BodyHandlers.ofInputStream());
        BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        Thread t = new Thread(() -> {
            try (var r = new BufferedReader(new InputStreamReader(res.body()))) {
                String line; while ((line = r.readLine()) != null) if (line.startsWith("event:") || line.startsWith("data:")) lines.add(line);
            } catch (Exception ignored) { }
        });
        t.setDaemon(true); t.start();
        try {
            assertEquals("event:ready", lines.poll(10, TimeUnit.SECONDS)); lines.poll(2, TimeUnit.SECONDS);
            assertEquals(200, patch(MB, B, "{\"displayName\":\"B only\"}").statusCode());
            assertNull(lines.poll(2, TimeUnit.SECONDS), "merchant A must not receive merchant B's event");
            assertEquals(200, patch(MA, A, "{\"displayName\":\"Streamed Co\",\"contactEmail\":\"secret@stream.example\"}").statusCode());
            assertEquals("event:MERCHANT_UPDATED", lines.poll(10, TimeUnit.SECONDS));
            String data = lines.poll(5, TimeUnit.SECONDS);
            assertTrue(data.contains("\"type\":\"MERCHANT_UPDATED\"") && data.contains("\"merchantId\":\"" + MA + "\"") && data.contains("occurredAt"), data);
            assertFalse(data.contains("secret@stream.example") || data.contains("Streamed Co") || data.contains("paymentId"), data);
        } finally { res.body().close(); }
    }

    @Test void paymentsStillWorkAfterMerchantChanges() throws Exception {
        assertEquals(200, patch(MA, A, "{\"displayName\":\"Pay Co\"}").statusCode());
        HttpRequest r = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/payments")).header("Content-Type", "application/json")
            .header("X-Api-Key", A).header("Idempotency-Key", "k_" + UUID.randomUUID().toString().replace("-", ""))
            .POST(HttpRequest.BodyPublishers.ofString("{\"amountMinor\":1500,\"currency\":\"GBP\",\"simulateDecline\":false}")).build();
        assertEquals(201, http.send(r, HttpResponse.BodyHandlers.ofString()).statusCode());
    }
}
