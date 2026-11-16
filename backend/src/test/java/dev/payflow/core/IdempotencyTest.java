package dev.payflow.core;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import dev.payflow.security.ApiKeyAuthentication;
import java.sql.ResultSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentMatchers;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Duplicate-request protection rules, with the idempotency table mocked. */
class IdempotencyTest {
    private JdbcTemplate jdbc; private Idempotency idem;
    private static final String REQUEST_ID = "request-00000001"; // the Idempotency-Key header value

    @BeforeEach void setUp() { jdbc = mock(JdbcTemplate.class); idem = new Idempotency(jdbc); SecurityContextHolder.getContext().setAuthentication(new ApiKeyAuthentication("demo_merchant")); }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    /** Makes the stored-row lookup return the given fingerprint and response id (or none yet). */
    @SuppressWarnings("unchecked")
    private void stored(String fingerprint, UUID responseId) {
        ResultSet rs = mock(ResultSet.class);
        try { when(rs.getString(1)).thenReturn(fingerprint); when(rs.getObject(2)).thenReturn(responseId); } catch (Exception e) { throw new AssertionError(e); }
        when(jdbc.queryForObject(anyString(), any(RowMapper.class), any(Object[].class))).thenAnswer(inv -> ((RowMapper<?>) inv.getArgument(1)).mapRow(rs, 0));
    }

    @ParameterizedTest @NullSource @ValueSource(strings = {"", "short", "has spaces in it", "bad/chars!!"})
    void malformedKeysAreRejectedBeforeAnyDatabaseWork(String key) {
        var e = assertThrows(ResponseStatusException.class, () -> idem.execute(key, "CREATE|100", id -> "replayed", () -> new Idempotency.Outcome<>(UUID.randomUUID(), "first")));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        verifyNoInteractions(jdbc);
    }

    @Test void keysLongerThan128CharactersAreRejected() {
        var e = assertThrows(ResponseStatusException.class, () -> idem.execute("a".repeat(129), "CREATE|100", id -> "r", () -> new Idempotency.Outcome<>(UUID.randomUUID(), "first")));
        assertEquals(HttpStatus.BAD_REQUEST, e.getStatusCode());
        assertDoesNotThrow(() -> { stored(Idempotency.fingerprint("CREATE|100"), null); idem.execute("a".repeat(128), "CREATE|100", id -> "r", () -> new Idempotency.Outcome<>(UUID.randomUUID(), "first")); });
    }

    @Test void firstUseRunsTheOperationOnceAndStoresItsResponseId() {
        stored(Idempotency.fingerprint("CREATE|100"), null);
        UUID response = UUID.randomUUID(); AtomicInteger runs = new AtomicInteger();
        String result = idem.execute(REQUEST_ID, "CREATE|100", id -> "replayed", () -> { runs.incrementAndGet(); return new Idempotency.Outcome<>(response, "first"); });
        assertEquals("first", result); assertEquals(1, runs.get());
        verify(jdbc).update(contains("UPDATE idempotency_keys SET response_id"), eq(response), eq("demo_merchant"), eq(REQUEST_ID));
    }

    @Test void aRepeatedRequestReplaysTheStoredResponseAndNeverRunsTheOperationAgain() {
        UUID response = UUID.randomUUID();
        stored(Idempotency.fingerprint("CREATE|100"), response);
        AtomicInteger runs = new AtomicInteger();
        String result = idem.execute(REQUEST_ID, "CREATE|100", id -> "replayed:" + id, () -> { runs.incrementAndGet(); return new Idempotency.Outcome<>(UUID.randomUUID(), "first"); });
        assertEquals("replayed:" + response, result); assertEquals(0, runs.get());
        verify(jdbc, never()).update(contains("UPDATE idempotency_keys SET response_id"), ArgumentMatchers.<Object[]>any());
    }

    @Test void reusingAKeyForADifferentRequestIsAConflict() {
        stored(Idempotency.fingerprint("CREATE|100"), UUID.randomUUID());
        AtomicInteger runs = new AtomicInteger();
        var e = assertThrows(ResponseStatusException.class, () -> idem.execute(REQUEST_ID, "CREATE|999", id -> "replayed", () -> { runs.incrementAndGet(); return new Idempotency.Outcome<>(UUID.randomUUID(), "first"); }));
        assertEquals(HttpStatus.CONFLICT, e.getStatusCode());
        assertEquals(0, runs.get());
    }

    @Test void keysAreScopedToTheCallingMerchant() {
        stored(Idempotency.fingerprint("CREATE|100"), null);
        idem.execute(REQUEST_ID, "CREATE|100", id -> "r", () -> new Idempotency.Outcome<>(UUID.randomUUID(), "first"));
        verify(jdbc).update(contains("INSERT INTO idempotency_keys"), eq("demo_merchant"), eq(REQUEST_ID), eq(Idempotency.fingerprint("CREATE|100")));
    }
}
