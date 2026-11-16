-- Visa sandbox support: new lifecycle states, provider references and an operation journal.
ALTER TABLE payments DROP CONSTRAINT payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'PENDING_AUTHORIZATION','AUTHORIZED','DECLINED','CAPTURE_PENDING','CAPTURED',
  'REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','REVIEW_REQUIRED'));
ALTER TABLE payments ADD COLUMN provider_authorization_id VARCHAR(64);
ALTER TABLE payments ADD COLUMN provider_capture_id VARCHAR(64);

ALTER TABLE refunds ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED'
  CHECK (status IN ('PENDING','COMPLETED','FAILED'));

CREATE TABLE visa_operations (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  refund_id UUID REFERENCES refunds(id),
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('AUTHORIZE','CAPTURE','REFUND')),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  request_fingerprint VARCHAR(64) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  state VARCHAR(20) NOT NULL CHECK (state IN ('IN_FLIGHT','SUCCEEDED','DECLINED','AWAITING_PROVIDER','UNKNOWN')),
  provider_transaction_id VARCHAR(64),
  provider_status VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visa_operations_payment ON visa_operations(payment_id, created_at DESC);
