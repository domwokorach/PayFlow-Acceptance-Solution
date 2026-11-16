package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.*;

import dev.payflow.core.PaymentService;
import dev.payflow.model.PaymentDtos.*;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Exercises the real HTTP stream: auth, live delivery after commit, resume via Last-Event-ID, and resync. */
@org.junit.jupiter.api.extension.ExtendWith(AsDemoMerchant.class)
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "payflow.reconciler.enabled=false")
class SseStreamIntegrationTest {
    @Container static PostgreSQLContainer pg = new PostgreSQLContainer("postgres:17-alpine");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
    }

    @LocalServerPort int port;
    @Autowired PaymentService payments;
    private final HttpClient http = HttpClient.newHttpClient();

    /** Frames are "event:/id:/data:" blocks separated by blank lines; comments (heartbeats) are skipped. */
    private record Frame(String event, String id, String data) {}
    private static class Stream implements AutoCloseable {
        final BlockingQueue<Frame> frames = new LinkedBlockingQueue<>();
        final HttpResponse<java.io.InputStream> response;
        Stream(HttpResponse<java.io.InputStream> response) {
            this.response = response;
            Thread t = new Thread(() -> {
                try (var r = new BufferedReader(new InputStreamReader(response.body()))) {
                    String ev = null, id = null, data = null, line;
                    while ((line = r.readLine()) != null) {
                        if (line.isEmpty()) { if (ev != null || data != null) frames.add(new Frame(ev, id, data)); ev = id = data = null; }
                        else if (line.startsWith("event:")) ev = line.substring(6).trim();
                        else if (line.startsWith("id:")) id = line.substring(3).trim();
                        else if (line.startsWith("data:")) data = line.substring(5).trim();
                    }
                } catch (Exception ignored) { /* closed */ }
            });
            t.setDaemon(true); t.start();
        }
        Frame next() throws Exception { Frame f = frames.poll(10, TimeUnit.SECONDS); assertNotNull(f, "timed out waiting for SSE frame"); return f; }
        @Override public void close() { try { response.body().close(); } catch (Exception ignored) { } }
    }

    private Stream open(String query, String lastEventIdHeader) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/events/stream" + query))
            .header("X-Demo-Api-Key", "local-only-change-me").header("Accept", "text/event-stream");
        if (lastEventIdHeader != null) b.header("Last-Event-ID", lastEventIdHeader);
        HttpResponse<java.io.InputStream> res = http.send(b.build(), HttpResponse.BodyHandlers.ofInputStream());
        assertEquals(200, res.statusCode());
        return new Stream(res);
    }
    private static String key() { return "k_" + UUID.randomUUID().toString().replace("-", ""); }

    @Test void streamRequiresApiKey() throws Exception {
        var res = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/events/stream")).build(),
            HttpResponse.BodyHandlers.ofString());
        assertEquals(401, res.statusCode());
    }

    @Test void liveEventArrivesAfterCommitWithStableId() throws Exception {
        try (Stream s = open("", null)) {
            assertEquals("ready", s.next().event());
            PaymentView p = payments.create(new CreatePaymentRequest(3100, "GBP", false), key());
            Frame f = s.next();
            assertEquals("PAYMENT_STATUS_CHANGED", f.event());
            assertTrue(f.data().contains(p.id().toString()));
            assertTrue(f.data().contains("\"status\":\"AUTHORIZED\""));
            assertTrue(f.data().contains("\"eventId\":\"evt_" + f.id() + "\""));
        }
    }

    @Test void reconnectReplaysMissedEventsInOrderAndOnlyThose() throws Exception {
        String cursor;
        try (Stream s = open("", null)) {
            s.next(); // ready
            payments.create(new CreatePaymentRequest(1111, "GBP", false), key());
            cursor = s.next().id();
        } // connection dropped
        List<UUID> missed = new ArrayList<>();
        for (int i = 0; i < 3; i++) missed.add(payments.create(new CreatePaymentRequest(2000 + i, "GBP", false), key()).id());
        try (Stream s = open("?lastEventId=" + cursor, null)) {
            s.next(); // ready
            long last = Long.parseLong(cursor);
            for (UUID id : missed) {
                Frame f = s.next();
                assertTrue(f.data().contains(id.toString()), "replayed in order");
                long seq = Long.parseLong(f.id());
                assertTrue(seq > last); last = seq;
            }
            assertNull(s.frames.poll(300, TimeUnit.MILLISECONDS), "nothing beyond what was missed");
        }
        try (Stream s = open("", cursor)) { // header form of the same cursor
            s.next();
            assertTrue(s.next().data().contains(missed.getFirst().toString()));
        }
    }

    @Test void cursorAheadOfServerTriggersResync() throws Exception {
        try (Stream s = open("?lastEventId=999999999", null)) {
            s.next(); // ready
            Frame f = s.next();
            assertEquals("resync", f.event());
        }
    }
}
