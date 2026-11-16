-- Transactional outbox for dashboard updates. Rows are written in the same transaction as the state change,
-- so an event can never describe a change that was rolled back. seq doubles as the SSE Last-Event-ID.
CREATE TABLE domain_events (
  seq BIGSERIAL PRIMARY KEY,
  merchant_id VARCHAR(60) NOT NULL REFERENCES merchants(id),
  type VARCHAR(40) NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments(id),
  status VARCHAR(24) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_domain_events_merchant_seq ON domain_events (merchant_id, seq);

-- Append-only record of provider outcomes and recovery actions.
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  merchant_id VARCHAR(60) NOT NULL REFERENCES merchants(id),
  actor VARCHAR(24) NOT NULL,
  action VARCHAR(40) NOT NULL,
  payment_id UUID REFERENCES payments(id),
  operation_id UUID REFERENCES visa_operations(id),
  detail VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_payment ON audit_log (payment_id, created_at DESC);
