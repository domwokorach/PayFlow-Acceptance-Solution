package dev.payflow.core;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class Ledger {
    private final JdbcTemplate jdbc;
    public Ledger(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Two rows in one SQL operation: debits always equal credits by construction. */
    public void post(UUID paymentId, String operation, long amountMinor, String currency) {
        UUID journalId = UUID.randomUUID();
        String debit = "CAPTURE".equals(operation) ? "MERCHANT_CLEARING" : "MERCHANT_PAYABLE";
        String credit = "CAPTURE".equals(operation) ? "MERCHANT_PAYABLE" : "MERCHANT_CLEARING";
        jdbc.update("""
          INSERT INTO ledger_entries (id,journal_id,payment_id,operation,account_code,direction,amount_minor,currency)
          VALUES (?, ?, ?, ?, ?, 'DEBIT', ?, ?), (?, ?, ?, ?, ?, 'CREDIT', ?, ?)
          """, UUID.randomUUID(), journalId, paymentId, operation, debit, amountMinor, currency,
                 UUID.randomUUID(), journalId, paymentId, operation, credit, amountMinor, currency);
    }
}
