package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.payflow.core.DashboardService;
import dev.payflow.core.PaymentService;
import dev.payflow.core.ReconciliationService;
import dev.payflow.model.PaymentDtos.*;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@org.junit.jupiter.api.extension.ExtendWith(AsDemoMerchant.class)
@Testcontainers
@SpringBootTest(properties = "payflow.reconciler.enabled=false")
class PaymentEventsIntegrationTest {
    @Container static PostgreSQLContainer pg = new PostgreSQLContainer("postgres:17-alpine");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", pg::getJdbcUrl);
        r.add("spring.datasource.username", pg::getUsername);
        r.add("spring.datasource.password", pg::getPassword);
        r.add("payflow.visa.enabled", () -> "true");
        r.add("payflow.visa.merchant-id", () -> "test_mid");
        r.add("payflow.visa.key-id", () -> "test_kid");
        r.add("payflow.visa.shared-secret", () -> "dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ=");
    }

    @MockitoBean VisaSandboxGateway gateway;
    @Autowired VisaPaymentWorkflow workflow;
    @Autowired PaymentService payments;
    @Autowired DashboardService dashboard;
    @Autowired ReconciliationService reconciliation;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;
    @Autowired dev.payflow.events.EventPublisher publisher;

    private static String key() { return "k_" + UUID.randomUUID().toString().replace("-", ""); }
    private List<String> eventStatuses(UUID id) {
        return jdbc.queryForList("SELECT status FROM domain_events WHERE payment_id=? ORDER BY seq", String.class, id);
    }

    @Test void everyStateChangeWritesAnOrderedEvent() {
        when(gateway.authorize(any(), eq(12000L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.AUTHORIZED, "A1", "AUTHORIZED"));
        PaymentView p = workflow.authorize(new CreatePaymentRequest(12000, "GBP", false, "VISA_SANDBOX"), key());
        when(gateway.capture(any(), any(), anyLong(), any())).thenReturn(new ProviderResult(ProviderState.PENDING, "C1", "PENDING"));
        workflow.capture(p.id(), key());
        when(gateway.status("C1")).thenReturn(new ProviderResult(ProviderState.CONFIRMED, "C1", "SETTLED"));
        workflow.reconcile(p.id(), "test");
        assertEquals(List.of("PENDING_AUTHORIZATION", "AUTHORIZED", "CAPTURE_PENDING", "CAPTURED"), eventStatuses(p.id()));
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payment_id=? AND action='RECONCILE_LOOKUP' AND actor='test'", Long.class, p.id()));
        assertEquals(3L, jdbc.queryForObject("SELECT count(*) FROM audit_log WHERE payment_id=? AND action='PROVIDER_OUTCOME'", Long.class, p.id())); // authorize, capture (still pending), reconcile
    }

    @Test void rolledBackTransactionEmitsNoEvent() {
        PaymentView p = payments.create(new CreatePaymentRequest(1500, "GBP", false), key());
        long before = jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE payment_id=?", Long.class, p.id());
        assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(s -> {
            jdbc.update("UPDATE payments SET status='DECLINED' WHERE id=?", p.id());
            publisher.paymentChanged(p.id());
            // fail after publishing: the outbox row must roll back with the status change
            throw new IllegalStateException("boom");
        }));
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM domain_events WHERE payment_id=?", Long.class, p.id()));
        assertEquals("AUTHORIZED", payments.get(p.id()).status());
    }

    @Test void simulatedFlowPublishesEvents() {
        PaymentView p = payments.create(new CreatePaymentRequest(2000, "GBP", false), key());
        payments.capture(p.id(), key());
        payments.refund(p.id(), new RefundRequest(500), key());
        assertEquals(List.of("AUTHORIZED", "CAPTURED", "PARTIALLY_REFUNDED"), eventStatuses(p.id()));
    }

    @Test void concurrentCapturesCallProviderOnceAndPostLedgerOnce() throws Exception {
        when(gateway.authorize(any(), eq(9100L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.AUTHORIZED, "A9", "AUTHORIZED"));
        PaymentView p = workflow.authorize(new CreatePaymentRequest(9100, "GBP", false, "VISA_SANDBOX"), key());
        when(gateway.capture(any(), any(), anyLong(), any())).thenAnswer(i -> {
            Thread.sleep(150); // widen the race window
            return new ProviderResult(ProviderState.CONFIRMED, "C9", "SETTLED");
        });
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Future<String>> results = new java.util.ArrayList<>();
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < 6; i++) {
            String k = key();
            results.add(pool.submit(() -> { go.await(); try { return dev.payflow.security.MerchantContext.callAs("demo_merchant", () -> workflow.capture(p.id(), k).status()); }
                catch (org.springframework.web.server.ResponseStatusException e) { return "CONFLICT"; } }));
        }
        go.countDown();
        long ok = 0;
        for (Future<String> f : results) if ("CAPTURED".equals(f.get(20, TimeUnit.SECONDS))) ok++;
        pool.shutdown();
        assertEquals(1, ok);
        verify(gateway, times(1)).capture(any(), any(), anyLong(), any());
        assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM ledger_entries WHERE payment_id=?", Long.class, p.id()));
    }

    @Test void providerClientErrorIsADefinitiveRejectionNotUnknown() {
        when(gateway.authorize(any(), eq(4040L), eq("GBP"))).thenThrow(new VisaProviderException("Visa returned HTTP 400", 400));
        assertEquals("DECLINED", workflow.authorize(new CreatePaymentRequest(4040, "GBP", false, "VISA_SANDBOX"), key()).status());
    }

    @Test void providerServerErrorAndTimeoutStayUnknown() {
        when(gateway.authorize(any(), eq(5050L), eq("GBP"))).thenThrow(new VisaProviderException("Visa returned HTTP 503", 503));
        assertEquals("REVIEW_REQUIRED", workflow.authorize(new CreatePaymentRequest(5050, "GBP", false, "VISA_SANDBOX"), key()).status());
        when(gateway.authorize(any(), eq(5051L), eq("GBP"))).thenThrow(new VisaProviderException("Visa returned HTTP 429", 429));
        assertEquals("REVIEW_REQUIRED", workflow.authorize(new CreatePaymentRequest(5051, "GBP", false, "VISA_SANDBOX"), key()).status());
    }

    @Test void summaryAndReconciliationComeFromPersistedRows() {
        PaymentView p = payments.create(new CreatePaymentRequest(10000, "GBP", false), key());
        payments.capture(p.id(), key());
        payments.refund(p.id(), new RefundRequest(2500), key());
        payments.create(new CreatePaymentRequest(700, "GBP", true), key());

        DashboardSummary s = dashboard.summary(30);
        long expectedCaptured = jdbc.queryForObject("SELECT coalesce(sum(amount_minor),0) FROM payments WHERE status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')", Long.class);
        long expectedDeclined = jdbc.queryForObject("SELECT count(*) FROM payments WHERE status='DECLINED'", Long.class);
        assertEquals(expectedCaptured, s.totals().capturedVolumeMinor());
        assertEquals(expectedDeclined, s.totals().declined());
        assertEquals(s.totals().total(), s.statusCounts().values().stream().mapToLong(Long::longValue).sum());
        assertEquals(30, s.daily().size());
        assertNull(dashboard.summary(0).previous());
        assertTrue(s.providers().stream().anyMatch(x -> x.name().equals("SIMULATED")));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> dashboard.summary(5));

        var report = reconciliation.report();
        assertEquals(0, report.unbalancedJournals());
        assertTrue(report.discrepancies().stream().noneMatch(d -> d.paymentId().equals(p.id())));
        // corrupt a record directly: reconciliation must notice
        jdbc.update("UPDATE payments SET refunded_amount_minor=1 WHERE id=?", p.id());
        assertTrue(reconciliation.report().discrepancies().stream().anyMatch(d -> d.paymentId().equals(p.id())));
    }
}
