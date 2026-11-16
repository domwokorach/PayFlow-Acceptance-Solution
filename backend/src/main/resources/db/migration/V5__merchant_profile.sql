-- Editable merchant profile. display_name already exists; contact and business details are optional.
ALTER TABLE merchants
  ADD COLUMN contact_email VARCHAR(254),
  ADD COLUMN business_name VARCHAR(120),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE merchants ADD CONSTRAINT merchants_display_name_not_blank CHECK (btrim(display_name) <> '');

-- Merchant-level events (MERCHANT_UPDATED) have no payment. Payment events must still always carry both.
ALTER TABLE domain_events ALTER COLUMN payment_id DROP NOT NULL, ALTER COLUMN status DROP NOT NULL;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_payment_events_complete
  CHECK (type <> 'PAYMENT_STATUS_CHANGED' OR (payment_id IS NOT NULL AND status IS NOT NULL));
