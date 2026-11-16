package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VisaAcceptanceGatewayTest {
    private record Seen(String method, String path, String auth, String body) {}
    private HttpServer server;
    private final List<Seen> seen = new CopyOnWriteArrayList<>();
    private volatile int status = 201;
    private volatile String response = "{}";
    private VisaAcceptanceGateway gateway;

    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            seen.add(new Seen(ex.getRequestMethod(), ex.getRequestURI().getPath(),
                ex.getRequestHeaders().getFirst("Authorization"),
                new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            byte[] out = response.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(status, out.length);
            ex.getResponseBody().write(out); ex.close();
        });
        server.start();
        gateway = new VisaAcceptanceGateway(URI.create("http://127.0.0.1:" + server.getAddress().getPort()),
            "mid", "kid", Base64.getEncoder().encodeToString("secret-secret-secret-secret-1234".getBytes()));
    }
    @AfterEach void stop() { server.stop(0); }

    @Test void authorizeHitsPaymentsPathWithSignedFixtureBody() {
        response = "{\"id\":\"AUTH1\",\"status\":\"AUTHORIZED\"}";
        UUID pid = UUID.randomUUID();
        ProviderResult r = gateway.authorize(pid, 12500, "GBP");
        assertEquals(ProviderState.AUTHORIZED, r.state());
        assertEquals("AUTH1", r.transactionId());
        Seen s = seen.getFirst();
        assertEquals("POST", s.method());
        assertEquals("/pts/v2/payments", s.path());
        assertTrue(s.auth().startsWith("Bearer "));
        assertTrue(s.body().contains("\"totalAmount\":\"125.00\""));
        assertTrue(s.body().contains(pid.toString()));
        assertTrue(s.body().contains("\"capture\":false"));
    }

    @Test void captureAndRefundPaths() {
        response = "{\"id\":\"CAP1\",\"status\":\"PENDING\"}";
        assertEquals(ProviderState.PENDING, gateway.capture("AUTH1", UUID.randomUUID(), 100, "GBP").state());
        assertEquals("/pts/v2/payments/AUTH1/captures", seen.get(0).path());
        gateway.refund("CAP1", UUID.randomUUID(), 2500, "GBP");
        assertEquals("/pts/v2/captures/CAP1/refunds", seen.get(1).path());
        assertTrue(seen.get(1).body().contains("\"totalAmount\":\"25.00\""));
    }

    @Test void statusLookupIsSignedGet() {
        response = "{\"applicationInformation\":{\"status\":\"SETTLED\"}}";
        assertEquals(ProviderState.CONFIRMED, gateway.status("CAP1").state());
        assertEquals("GET", seen.getFirst().method());
        assertEquals("/tss/v2/transactions/CAP1", seen.getFirst().path());
        assertTrue(seen.getFirst().auth().startsWith("Bearer "));
    }

    @Test void unknownStatusIsNotTreatedAsSettled() {
        response = "{\"id\":\"X\",\"status\":\"SOMETHING_NEW\"}";
        assertEquals(ProviderState.UNSUPPORTED, gateway.capture("A1", UUID.randomUUID(), 100, "GBP").state());
    }

    @Test void statusLookupRetriesTransientFailuresButPostsDoNot() {
        status = 503; response = "{}";
        assertThrows(VisaProviderException.class, () -> gateway.status("CAP1"));
        assertEquals(3, seen.size()); // initial attempt + two backoff retries, all GETs
        assertTrue(seen.stream().allMatch(x -> x.method().equals("GET")));
        seen.clear();
        assertThrows(VisaProviderException.class, () -> gateway.capture("A1", UUID.randomUUID(), 100, "GBP"));
        assertEquals(1, seen.size());
    }

    @Test void clientErrorsAreNotRetried() {
        status = 404; response = "{}";
        assertThrows(VisaProviderException.class, () -> gateway.status("CAP1"));
        assertEquals(1, seen.size());
    }

    @Test void nonSuccessHttpThrows() {
        status = 503; response = "{\"secret\":\"leak\"}";
        VisaProviderException e = assertThrows(VisaProviderException.class, () -> gateway.authorize(UUID.randomUUID(), 100, "GBP"));
        assertEquals(503, e.httpStatus());
        assertFalse(e.getMessage().contains("leak"));
        assertEquals(1, seen.size()); // no automatic retry
    }
}
