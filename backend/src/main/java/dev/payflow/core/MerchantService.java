package dev.payflow.core;

import dev.payflow.events.EventPublisher;
import dev.payflow.model.MerchantDtos.MerchantView;
import dev.payflow.model.MerchantDtos.UpdateMerchantRequest;
import dev.payflow.security.MerchantContext;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Merchant profile reads and updates. Every operation is scoped to the authenticated merchant; there is no cross-merchant access. */
@Service
public class MerchantService {
    private static final RowMapper<MerchantView> MAP = (rs, n) -> new MerchantView(rs.getString("id"), rs.getString("display_name"),
        rs.getString("contact_email"), rs.getString("business_name"),
        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());
    private static final String COLUMNS = "id, display_name, contact_email, business_name, created_at, updated_at";

    private final JdbcTemplate jdbc;
    private final EventPublisher events;
    private final AuditLog audit;
    public MerchantService(JdbcTemplate jdbc, EventPublisher events, AuditLog audit) { this.jdbc = jdbc; this.events = events; this.audit = audit; }

    /** The caller's own merchant. A key belongs to exactly one merchant, so this is a list of at most one. */
    public List<MerchantView> list() {
        return jdbc.query("SELECT " + COLUMNS + " FROM merchants WHERE id=?", MAP, MerchantContext.current());
    }

    @Transactional
    public MerchantView update(String merchantId, UpdateMerchantRequest r) {
        // Same convention as payments: another merchant's id is indistinguishable from one that does not exist.
        if (!merchantId.equals(MerchantContext.current())) throw notFound();
        String name = trim(r.displayName()), email = trim(r.contactEmail()), business = trim(r.businessName());
        List<String> changed = new ArrayList<>();
        if (name != null) changed.add("displayName");
        if (email != null) changed.add("contactEmail");
        if (business != null) changed.add("businessName");
        if (changed.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No changes supplied");

        List<MerchantView> rows = jdbc.query("""
            UPDATE merchants SET
              display_name  = COALESCE(?, display_name),
              contact_email = CASE WHEN ?::text IS NULL THEN contact_email ELSE NULLIF(?::text, '') END,
              business_name = CASE WHEN ?::text IS NULL THEN business_name ELSE NULLIF(?::text, '') END,
              updated_at = now()
            WHERE id = ? RETURNING """ + " " + COLUMNS, MAP, name, email, email, business, business, merchantId);
        if (rows.isEmpty()) throw notFound();
        // Field names only: values (such as the email address) never go into the audit log or the event stream.
        audit.record("merchant", "MERCHANT_UPDATED", null, null, "fields: " + String.join(",", changed));
        events.merchantUpdated(merchantId); // broadcast only after this transaction commits
        return rows.getFirst();
    }

    private static String trim(String v) { return v == null ? null : v.trim(); }
    private static ResponseStatusException notFound() { return new ResponseStatusException(HttpStatus.NOT_FOUND, "Merchant not found"); }
}
