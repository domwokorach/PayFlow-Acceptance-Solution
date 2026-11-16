package dev.payflow.visa;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.payflow.core.PaymentService;
import dev.payflow.model.PaymentDtos.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@org.junit.jupiter.api.extension.ExtendWith(AsDemoMerchant.class)
@Testcontainers
@SpringBootTest
class VisaPaymentWorkflowIntegrationTest {
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
    @Autowired JdbcTemplate jdbc;

    private static String key() { return "k_" + UUID.randomUUID().toString().replace("-", ""); }
    private PaymentView authorized() {
        when(gateway.authorize(any(), eq(10000L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.AUTHORIZED, "AUTH1", "AUTHORIZED"));
        return workflow.authorize(new CreatePaymentRequest(10000, "GBP", false, "VISA_SANDBOX"), key());
    }
    private void assertLedgerBalanced(UUID id) {
        Long d = jdbc.queryForObject("SELECT coalesce(sum(amount_minor),0) FROM ledger_entries WHERE payment_id=? AND direction='DEBIT'", Long.class, id);
        Long c = jdbc.queryForObject("SELECT coalesce(sum(amount_minor),0) FROM ledger_entries WHERE payment_id=? AND direction='CREDIT'", Long.class, id);
        assertEquals(d, c);
    }

    @Test void fullLifecycleAuthorizeCaptureReconcileRefund() {
        PaymentView p = authorized();
        assertEquals("AUTHORIZED", p.status());
        assertEquals("VISA_SANDBOX", p.provider());

        when(gateway.capture(eq("AUTH1"), eq(p.id()), eq(10000L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.PENDING, "CAP1", "PENDING"));
        assertEquals("CAPTURE_PENDING", workflow.capture(p.id(), key()).status());
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM ledger_entries WHERE payment_id=?", Long.class, p.id()));

        when(gateway.status("CAP1")).thenReturn(new ProviderResult(ProviderState.CONFIRMED, "CAP1", "SETTLED"));
        assertEquals("CAPTURED", workflow.reconcile(p.id(), "test").status());
        assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM ledger_entries WHERE payment_id=?", Long.class, p.id()));
    }

    @Test void reconcileTwiceDoesNotDoublePostLedger() {
        PaymentView p = authorized();
        when(gateway.capture(any(), any(), anyLong(), any())).thenReturn(new ProviderResult(ProviderState.PENDING, "CAP2", "PENDING"));
        workflow.capture(p.id(), key());
        when(gateway.status("CAP2")).thenReturn(new ProviderResult(ProviderState.CONFIRMED, "CAP2", "SETTLED"));
        workflow.reconcile(p.id(), "test");
        assertThrows(ResponseStatusException.class, () -> workflow.reconcile(p.id(), "test"));
        assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM ledger_entries WHERE payment_id=?", Long.class, p.id()));
        assertLedgerBalanced(p.id());
    }

    @Test void partialRefundPendingThenCompleted() {
        PaymentView p = authorized();
        when(gateway.capture(any(), any(), anyLong(), any())).thenReturn(new ProviderResult(ProviderState.CONFIRMED, "CAP3", "SETTLED"));
        assertEquals("CAPTURED", workflow.capture(p.id(), key()).status());

        when(gateway.refund(eq("CAP3"), any(), eq(2500L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.PENDING, "REF1", "PENDING"));
        RefundView r = workflow.refund(p.id(), new RefundRequest(2500), key());
        assertEquals("PENDING", r.status());
        assertEquals("REFUND_PENDING", payments.get(p.id()).status());
        assertEquals(0L, payments.get(p.id()).refundedAmountMinor());

        when(gateway.status("REF1")).thenReturn(new ProviderResult(ProviderState.CONFIRMED, "REF1", "COMPLETED"));
        PaymentView after = workflow.reconcile(p.id(), "test");
        assertEquals("PARTIALLY_REFUNDED", after.status());
        assertEquals(2500L, after.refundedAmountMinor());
        assertEquals(4L, jdbc.queryForObject("SELECT count(*) FROM ledger_entries WHERE payment_id=?", Long.class, p.id()));
        assertLedgerBalanced(p.id());
    }

    @Test void idempotentReplayDoesNotCallVisaAgain() {
        when(gateway.authorize(any(), eq(7777L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.AUTHORIZED, "AUTHR", "AUTHORIZED"));
        String k = key();
        CreatePaymentRequest req = new CreatePaymentRequest(7777, "GBP", false, "VISA_SANDBOX");
        PaymentView a = workflow.authorize(req, k);
        PaymentView b = workflow.authorize(req, k);
        assertEquals(a.id(), b.id());
        verify(gateway, times(1)).authorize(any(), eq(7777L), any());
        assertThrows(ResponseStatusException.class, () -> workflow.authorize(new CreatePaymentRequest(8888, "GBP", false, "VISA_SANDBOX"), k));
    }

    @Test void ambiguousNetworkFailureRequiresReviewAndIsNeverRetried() {
        when(gateway.authorize(any(), eq(5555L), eq("GBP"))).thenThrow(new VisaProviderException("timeout", 0));
        String k = key();
        CreatePaymentRequest req = new CreatePaymentRequest(5555, "GBP", false, "VISA_SANDBOX");
        PaymentView p = workflow.authorize(req, k);
        assertEquals("REVIEW_REQUIRED", p.status());
        assertEquals("UNKNOWN", jdbc.queryForObject("SELECT state FROM visa_operations WHERE payment_id=?", String.class, p.id()));
        assertEquals(p.id(), workflow.authorize(req, k).id());
        verify(gateway, times(1)).authorize(any(), eq(5555L), any());
        assertThrows(ResponseStatusException.class, () -> workflow.capture(p.id(), key())); // not AUTHORIZED
    }

    @Test void declinedAuthorization() {
        when(gateway.authorize(any(), eq(3333L), eq("GBP"))).thenReturn(new ProviderResult(ProviderState.DECLINED, "D1", "DECLINED"));
        assertEquals("DECLINED", workflow.authorize(new CreatePaymentRequest(3333, "GBP", false, "VISA_SANDBOX"), key()).status());
    }

    @Test void credentialRejectionIsDeclinedAndExposesTheProviderStatusSoClientsCanTellItFromACardDecline() {
        when(gateway.authorize(any(), eq(7700L), eq("GBP"))).thenThrow(new VisaProviderException("Visa returned HTTP 401", 401));
        PaymentView p = workflow.authorize(new CreatePaymentRequest(7700, "GBP", false, "VISA_SANDBOX"), key());
        assertEquals("DECLINED", p.status());
        assertEquals("HTTP_401", p.providerStatus());
        assertEquals("HTTP_401", payments.get(p.id()).providerStatus());
        assertTrue(payments.list("", "DECLINED").stream().anyMatch(x -> x.id().equals(p.id()) && "HTTP_401".equals(x.providerStatus())));
    }

    @Test void providerOutageNeedsReviewAndExposesWhy() {
        when(gateway.authorize(any(), eq(7800L), eq("GBP"))).thenThrow(new VisaProviderException("Visa returned HTTP 503", 503));
        PaymentView p = workflow.authorize(new CreatePaymentRequest(7800, "GBP", false, "VISA_SANDBOX"), key());
        assertEquals("REVIEW_REQUIRED", p.status());
        assertTrue(p.providerStatus().contains("503"), p.providerStatus());
    }

    @Test void simulatedPaymentsHaveNoProviderStatus() {
        PaymentView p = payments.create(new CreatePaymentRequest(1200, "GBP", false), key());
        assertNull(p.providerStatus());
    }
}
