package dev.payflow.core;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.payflow.events.EventPublisher;
import dev.payflow.model.MerchantDtos.MerchantView;
import dev.payflow.model.MerchantDtos.UpdateMerchantRequest;
import dev.payflow.security.ApiKeyAuthentication;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Merchant business rules with the database mocked: authorization, input handling, auditing and events. */
class MerchantServiceTest {
    private JdbcTemplate jdbc; private EventPublisher events; private AuditLog audit; private MerchantService service;

    @BeforeEach void setUp() {
        jdbc = mock(JdbcTemplate.class); events = mock(EventPublisher.class); audit = mock(AuditLog.class);
        service = new MerchantService(jdbc, events, audit);
        SecurityContextHolder.getContext().setAuthentication(new ApiKeyAuthentication("demo_merchant"));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @SuppressWarnings("unchecked")
    private void rowReturned() {
        ResultSet rs = mock(ResultSet.class);
        try {
            when(rs.getString("id")).thenReturn("demo_merchant"); when(rs.getString("display_name")).thenReturn("Acme Retail");
            when(rs.getString("contact_email")).thenReturn("ops@acme.example"); when(rs.getString("business_name")).thenReturn(null);
            when(rs.getTimestamp(anyString())).thenReturn(Timestamp.from(Instant.parse("2026-11-15T13:00:00Z")));
        } catch (Exception e) { throw new AssertionError(e); }
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(inv -> List.of(((RowMapper<MerchantView>) inv.getArgument(1)).mapRow(rs, 0)));
    }

    @Test void anotherMerchantsIdIsNotFoundAndNothingIsTouched() {
        var e = assertThrows(ResponseStatusException.class, () -> service.update("merchant_b", new UpdateMerchantRequest("Hijack", null, null)));
        assertEquals(HttpStatus.NOT_FOUND, e.getStatusCode());
        verifyNoInteractions(jdbc, events, audit);
    }
    @Test void anUpdateWithNoFieldsIsABadRequestAndWritesNothing() {
        var e = assertThrows(ResponseStatusException.class, () -> service.update("demo_merchant", new UpdateMerchantRequest(null, null, null)));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verifyNoInteractions(jdbc, events, audit);
    }
    @Test void unknownRowIsNotFoundAndEmitsNothing() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        var e = assertThrows(ResponseStatusException.class, () -> service.update("demo_merchant", new UpdateMerchantRequest("X", null, null)));
        assertEquals(HttpStatus.NOT_FOUND, e.getStatusCode());
        verifyNoInteractions(events, audit);
    }
    @Test void successTrimsInputAuditsFieldNamesOnlyAndPublishesAfterTheWrite() {
        rowReturned();
        MerchantView v = service.update("demo_merchant", new UpdateMerchantRequest("  Acme Retail  ", "ops@acme.example", null));
        assertEquals("Acme Retail", v.displayName());

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), args.capture());
        assertEquals("Acme Retail", args.getValue()[0]);                // trimmed value reaches the database
        assertNull(args.getValue()[3]);                                  // untouched business name stays null (= unchanged)
        assertEquals("demo_merchant", args.getValue()[5]);

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        verify(audit).record(eq("merchant"), eq("MERCHANT_UPDATED"), isNull(), isNull(), detail.capture());
        assertEquals("fields: displayName,contactEmail", detail.getValue());
        assertFalse(detail.getValue().contains("ops@acme.example"), "audit must not contain personal data");

        var order = inOrder(jdbc, audit, events);
        order.verify(jdbc).query(anyString(), any(RowMapper.class), any(Object[].class));
        order.verify(audit).record(any(), any(), any(), any(), any());
        order.verify(events).merchantUpdated("demo_merchant");
    }
    @Test void listIsScopedToTheAuthenticatedMerchant() {
        rowReturned();
        service.list();
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).query(anyString(), any(RowMapper.class), args.capture());
        assertArrayEquals(new Object[] {"demo_merchant"}, args.getValue());
    }
    @Test void noAuthenticatedMerchantFailsClosed() {
        SecurityContextHolder.clearContext();
        assertThrows(IllegalStateException.class, () -> service.list());
        verifyNoInteractions(jdbc);
    }
}
