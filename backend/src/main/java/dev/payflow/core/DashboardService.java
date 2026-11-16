package dev.payflow.core;

import dev.payflow.security.MerchantContext;
import dev.payflow.model.PaymentDtos.*;
import dev.payflow.visa.VisaPaymentWorkflow;
import dev.payflow.visa.VisaProperties;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Every figure is aggregated from PostgreSQL at request time; nothing is cached or synthesised. */
@Service
public class DashboardService {
    private static final String SETTLED = "('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')";
    private final JdbcTemplate jdbc;
    private final VisaProperties visa;

    public DashboardService(JdbcTemplate jdbc, VisaProperties visa) { this.jdbc = jdbc; this.visa = visa; }

    private static final String TOTALS_SQL = """
        SELECT count(*) AS total,
          count(*) FILTER (WHERE status NOT IN ('DECLINED','PENDING_AUTHORIZATION','REVIEW_REQUIRED')) AS successful,
          count(*) FILTER (WHERE status='DECLINED') AS declined,
          count(*) FILTER (WHERE status='AUTHORIZED') AS authorized,
          count(*) FILTER (WHERE status IN %s) AS captured_count,
          coalesce(sum(amount_minor) FILTER (WHERE status IN %s),0) AS captured,
          coalesce(sum(refunded_amount_minor),0) AS refunded,
          count(*) FILTER (WHERE status='PENDING_AUTHORIZATION') AS pending_auth,
          count(*) FILTER (WHERE status='CAPTURE_PENDING') AS pending_capture,
          count(*) FILTER (WHERE status='REFUND_PENDING') AS pending_refund,
          count(*) FILTER (WHERE status='REVIEW_REQUIRED') AS review
        FROM payments WHERE merchant_id=? AND created_at >= ? AND created_at < ?""".formatted(SETTLED, SETTLED);

    private Totals totals(Instant from, Instant to) {
        return jdbc.queryForObject(TOTALS_SQL, (rs, n) -> new Totals(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getLong(4),
            rs.getLong(5), rs.getLong(6), rs.getLong(7), rs.getLong(8), rs.getLong(9), rs.getLong(10), rs.getLong(11)),
            MerchantContext.current(), java.sql.Timestamp.from(from), java.sql.Timestamp.from(to));
    }

    /** days: 7, 30 or 0 for all time. The previous window (same length, immediately before) is null for all time. */
    @Transactional(readOnly = true)
    public DashboardSummary summary(int days) {
        if (days != 0 && days != 7 && days != 30) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "days must be 0, 7 or 30");
        Instant now = Instant.now(), epoch = Instant.EPOCH, future = now.plusSeconds(60);
        Totals all = totals(epoch, future);
        Instant from = days == 0 ? epoch : now.minusSeconds(days * 86_400L);
        Totals current = days == 0 ? all : totals(from, future);
        Totals previous = days == 0 ? null : totals(now.minusSeconds(2L * days * 86_400L), from);

        List<DayStat> daily = daily(days, from);
        List<DailyVolume> volume30 = daily(30, now.minusSeconds(30L * 86_400L)).stream()
            .map(d -> new DailyVolume(d.date(), d.capturedMinor())).toList();

        Map<String, Long> statusCounts = new LinkedHashMap<>();
        jdbc.query("SELECT status, count(*) FROM payments WHERE merchant_id=? AND created_at >= ? GROUP BY status ORDER BY status",
            (org.springframework.jdbc.core.RowCallbackHandler) rs -> statusCounts.put(rs.getString(1), rs.getLong(2)),
            MerchantContext.current(), java.sql.Timestamp.from(from));

        return new DashboardSummary(all.total(), all.authorized(), all.declined(), all.capturedVolumeMinor(),
            all.refundedVolumeMinor(), all.capturedCount(), volume30, now, days, current, previous, daily, statusCounts, providers(from));
    }

    private List<DayStat> daily(int days, Instant from) {
        Map<LocalDate, DayStat> byDay = new TreeMap<>();
        jdbc.query("""
            SELECT CAST(created_at AT TIME ZONE 'UTC' AS DATE) AS day,
              coalesce(sum(amount_minor) FILTER (WHERE status IN %s),0),
              coalesce(sum(refunded_amount_minor),0),
              count(*) FILTER (WHERE status NOT IN ('DECLINED','PENDING_AUTHORIZATION','REVIEW_REQUIRED')),
              count(*) FILTER (WHERE status='DECLINED')
            FROM payments WHERE merchant_id=? AND created_at >= ? GROUP BY day""".formatted(SETTLED),
            (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                LocalDate d = rs.getDate(1).toLocalDate();
                byDay.put(d, new DayStat(d.toString(), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)));
            }, MerchantContext.current(), java.sql.Timestamp.from(from));
        if (days == 0) return new ArrayList<>(byDay.values()); // all time: only days with activity
        List<DayStat> series = new ArrayList<>();
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        for (int i = days - 1; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            series.add(byDay.getOrDefault(d, new DayStat(d.toString(), 0, 0, 0, 0)));
        }
        return series;
    }

    private List<ProviderStat> providers(Instant from) {
        List<ProviderStat> out = new ArrayList<>();
        jdbc.query("""
            SELECT provider, count(*),
              count(*) FILTER (WHERE status NOT IN ('DECLINED','PENDING_AUTHORIZATION','REVIEW_REQUIRED')),
              count(*) FILTER (WHERE status='DECLINED'), max(created_at)
            FROM payments WHERE merchant_id=? AND created_at >= ? GROUP BY provider ORDER BY provider""",
            (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                String name = rs.getString(1);
                String[] h = health(name);
                out.add(new ProviderStat(name, rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getTimestamp(5).toInstant(), h[0], h[1]));
            }, MerchantContext.current(), java.sql.Timestamp.from(from));
        // The Visa connector is always listed so a missing configuration is visible rather than hidden.
        if (out.stream().noneMatch(p -> p.name().equals(VisaPaymentWorkflow.PROVIDER))) {
            String[] h = health(VisaPaymentWorkflow.PROVIDER);
            out.add(new ProviderStat(VisaPaymentWorkflow.PROVIDER, 0, 0, 0, null, h[0], h[1]));
        }
        return out;
    }

    /** Health is evidence-based: recent unknown outcomes or stale pending operations degrade it; no traffic is IDLE, not healthy. */
    private String[] health(String provider) {
        if (!VisaPaymentWorkflow.PROVIDER.equals(provider)) return new String[] {"HEALTHY", "Local simulator, no network calls"};
        if (!visa.configured()) return new String[] {"NOT_CONFIGURED", "Sandbox credentials are not set on the backend"};
        Map<String, Object> m = jdbc.queryForMap("""
            SELECT count(*) AS total,
              count(*) FILTER (WHERE state='UNKNOWN' AND updated_at > now() - interval '24 hours') AS unknown,
              count(*) FILTER (WHERE state='AWAITING_PROVIDER' AND updated_at < now() - interval '15 minutes') AS stale,
              max(updated_at) FILTER (WHERE state IN ('SUCCEEDED','DECLINED')) AS last_ok
            FROM visa_operations""");
        long total = ((Number) m.get("total")).longValue(), unknown = ((Number) m.get("unknown")).longValue(), stale = ((Number) m.get("stale")).longValue();
        if (total == 0) return new String[] {"IDLE", "Configured; no provider calls yet"};
        if (unknown > 0) return new String[] {"DEGRADED", unknown + " operation(s) with unknown outcome in the last 24h"};
        if (stale > 0) return new String[] {"DEGRADED", stale + " operation(s) awaiting the provider for over 15 minutes"};
        return new String[] {"HEALTHY", "No unknown or stale operations"};
    }
}
