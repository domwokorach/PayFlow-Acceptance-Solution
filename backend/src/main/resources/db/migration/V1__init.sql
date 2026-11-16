CREATE TABLE merchants (
  id VARCHAR(60) PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO merchants (id, display_name) VALUES ('demo_merchant', 'Acme Demo Store');

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  merchant_id VARCHAR(60) NOT NULL REFERENCES merchants(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status VARCHAR(24) NOT NULL CHECK (status IN ('AUTHORIZED','DECLINED','CAPTURED','PARTIALLY_REFUNDED','REFUNDED')),
  provider VARCHAR(32) NOT NULL DEFAULT 'SIMULATED',
  refunded_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (refunded_amount_minor >= 0 AND refunded_amount_minor <= amount_minor),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ,
  CONSTRAINT currency_upper CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX idx_payments_merchant_created ON payments (merchant_id, created_at DESC);
CREATE INDEX idx_payments_merchant_status ON payments (merchant_id, status);

CREATE TABLE refunds (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  journal_id UUID NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments(id),
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('CAPTURE','REFUND')),
  account_code VARCHAR(40) NOT NULL,
  direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_entries_journal ON ledger_entries(journal_id);
CREATE INDEX idx_ledger_entries_payment ON ledger_entries(payment_id);

CREATE TABLE idempotency_keys (
  merchant_id VARCHAR(60) NOT NULL REFERENCES merchants(id),
  idempotency_key VARCHAR(128) NOT NULL,
  request_fingerprint VARCHAR(64) NOT NULL,
  response_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id,idempotency_key)
);
