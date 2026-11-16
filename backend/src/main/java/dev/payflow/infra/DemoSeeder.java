package dev.payflow.infra;

import dev.payflow.core.Ledger;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Synthetic history for UI development only. Off unless PAYFLOW_SEED_DEMO_DATA=true; never part of the live dashboard. */
@Configuration
@Profile("demo")
@ConditionalOnProperty(name = "payflow.seed-demo-data", havingValue = "true")
public class DemoSeeder {
    @Bean ApplicationRunner seedPayflow(JdbcTemplate jdbc, Ledger ledger, TransactionTemplate tx) {
        return args -> tx.executeWithoutResult(ignored -> {
            Long count = jdbc.queryForObject("SELECT count(*) FROM payments",Long.class);
            if (count != null && count > 0) return;
            for (int i=0;i<52;i++) {
                UUID id = UUID.randomUUID();
                long amount = (35L + (i*67L)%980L)*100L;
                String status = switch(i%7) {
                    case 0 -> "DECLINED";
                    case 1 -> "AUTHORIZED";
                    case 5 -> "PARTIALLY_REFUNDED";
                    case 6 -> "REFUNDED";
                    default -> "CAPTURED";
                };
                long refunded = status.equals("REFUNDED") ? amount :
                    status.equals("PARTIALLY_REFUNDED") ? amount/2 : 0;
                Instant created = Instant.now().minus((i*7L)%29L,ChronoUnit.DAYS)
                    .minus((i*43L)%12L,ChronoUnit.HOURS);
                jdbc.update("""
                  INSERT INTO payments (id,merchant_id,amount_minor,currency,status,refunded_amount_minor,created_at,captured_at)
                  VALUES (?, 'demo_merchant', ?, 'GBP', ?, ?, ?, ?)
                  """,id,amount,status,refunded,Timestamp.from(created),
                      (status.equals("AUTHORIZED") || status.equals("DECLINED")) ? null : Timestamp.from(created));
                if (!status.equals("AUTHORIZED") && !status.equals("DECLINED")) {
                    ledger.post(id,"CAPTURE",amount,"GBP");
                    if (refunded > 0) {
                        jdbc.update("INSERT INTO refunds (id,payment_id,amount_minor,created_at) VALUES (?,?,?,?)",
                            UUID.randomUUID(),id,refunded,Timestamp.from(created));
                        ledger.post(id,"REFUND",refunded,"GBP");
                    }
                }
            }
        });
    }
}
