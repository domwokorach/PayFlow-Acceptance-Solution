-- Per-merchant API keys, stored only as SHA-256 digests.
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  merchant_id VARCHAR(60) NOT NULL REFERENCES merchants(id),
  key_hash CHAR(64) NOT NULL UNIQUE,
  label VARCHAR(60) NOT NULL DEFAULT 'api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_merchant ON api_keys (merchant_id);
