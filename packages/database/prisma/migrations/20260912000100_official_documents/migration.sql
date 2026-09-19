-- LOT 10: additive extension of the LOT 3 document records. No historical rows are rewritten.
BEGIN;
CREATE TYPE official_document_type AS ENUM ('REPORT_CARD','TRANSCRIPT','SCHOOL_CERTIFICATE','ENROLLMENT_CERTIFICATE','STUDENT_CARD','RECEIPT');
CREATE TYPE document_generation_status AS ENUM ('PENDING','PROCESSING','READY','FAILED','REVOKED');

ALTER TABLE document_templates
  ADD COLUMN document_type official_document_type,
  ADD COLUMN locale varchar(10),
  ADD COLUMN version integer,
  ADD COLUMN published_at timestamptz(6),
  ADD CONSTRAINT document_template_version_check CHECK (document_type IS NULL OR (version IS NOT NULL AND version > 0 AND locale IN ('fr','en','ar') AND published_at IS NOT NULL));
CREATE UNIQUE INDEX document_templates_tenant_id_document_type_locale_version_key ON document_templates(tenant_id,document_type,locale,version);

ALTER TABLE documents
  ADD COLUMN document_type official_document_type,
  ADD COLUMN generation_status document_generation_status,
  ADD COLUMN locale varchar(10),
  ADD COLUMN snapshot jsonb,
  ADD COLUMN template_version integer,
  ADD COLUMN idempotency_key uuid,
  ADD COLUMN enrollment_id uuid,
  ADD COLUMN report_card_id uuid,
  ADD COLUMN receipt_id uuid,
  ADD COLUMN requested_by_membership_id uuid,
  ADD COLUMN checksum char(64),
  ADD COLUMN verification_token_hash char(64),
  ADD COLUMN issued_at timestamptz(6),
  ADD COLUMN revoked_at timestamptz(6),
  ADD COLUMN revoked_by_membership_id uuid,
  ADD COLUMN revocation_reason varchar(500),
  ADD COLUMN supersedes_id uuid,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz(6),
  ADD COLUMN failure_code varchar(80);
CREATE UNIQUE INDEX documents_verification_token_hash_key ON documents(verification_token_hash);
CREATE UNIQUE INDEX documents_tenant_id_idempotency_key_key ON documents(tenant_id,idempotency_key);
CREATE INDEX documents_tenant_id_generation_status_created_at_idx ON documents(tenant_id,generation_status,created_at);
CREATE UNIQUE INDEX enrollments_tenant_id_id_student_id_key ON enrollments(tenant_id,id,student_id);
CREATE UNIQUE INDEX report_cards_tenant_id_id_student_id_key ON report_cards(tenant_id,id,student_id);
ALTER TABLE documents
  ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_enrollment_source_fkey FOREIGN KEY (tenant_id,enrollment_id,student_id) REFERENCES enrollments(tenant_id,id,student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_report_source_fkey FOREIGN KEY (tenant_id,report_card_id,student_id) REFERENCES report_cards(tenant_id,id,student_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_receipt_source_fkey FOREIGN KEY (tenant_id,receipt_id) REFERENCES receipts(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_requester_fkey FOREIGN KEY (tenant_id,requested_by_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_revoker_fkey FOREIGN KEY (tenant_id,revoked_by_membership_id) REFERENCES memberships(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_supersedes_fkey FOREIGN KEY (tenant_id,supersedes_id) REFERENCES documents(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT documents_attempts_check CHECK (attempts BETWEEN 0 AND 3),
  ADD CONSTRAINT documents_official_shape_check CHECK (
    (document_type IS NULL AND generation_status IS NULL) OR
    (document_type IS NOT NULL AND generation_status IS NOT NULL AND student_id IS NOT NULL AND document_template_id IS NOT NULL
      AND template_version IS NOT NULL AND template_version > 0 AND locale IS NOT NULL AND locale IN ('fr','en','ar')
      AND idempotency_key IS NOT NULL AND requested_by_membership_id IS NOT NULL AND snapshot IS NOT NULL AND jsonb_typeof(snapshot)='object'
      AND snapshot->>'schemaVersion'='1' AND snapshot->>'documentType'=document_type::text AND snapshot->>'locale'=locale
      AND mime_type='application/pdf' AND num_nonnulls(enrollment_id,report_card_id,receipt_id)=1
      AND ((document_type IN ('REPORT_CARD','TRANSCRIPT') AND report_card_id IS NOT NULL)
        OR (document_type='RECEIPT' AND receipt_id IS NOT NULL)
        OR (document_type IN ('SCHOOL_CERTIFICATE','ENROLLMENT_CERTIFICATE','STUDENT_CARD') AND enrollment_id IS NOT NULL)))),
  ADD CONSTRAINT documents_ready_check CHECK (generation_status NOT IN ('READY','REVOKED') OR
    (checksum IS NOT NULL AND checksum ~ '^[0-9a-f]{64}$' AND verification_token_hash IS NOT NULL AND verification_token_hash ~ '^[0-9a-f]{64}$'
      AND size_bytes > 0 AND issued_at IS NOT NULL AND object_key = 'tenants/' || tenant_id || '/documents/' || id || '/' || checksum || '.pdf')),
  ADD CONSTRAINT documents_revocation_check CHECK ((generation_status='REVOKED') = (revoked_at IS NOT NULL) AND (generation_status <> 'REVOKED' OR length(revocation_reason)>=5)),
  ADD CONSTRAINT documents_lease_check CHECK ((generation_status='PROCESSING') = (lease_token IS NOT NULL AND lease_until IS NOT NULL));

CREATE TABLE document_counters (
  tenant_id uuid NOT NULL,
  prefix varchar(8) NOT NULL,
  year integer NOT NULL,
  value integer NOT NULL DEFAULT 0,
  CONSTRAINT document_counters_pkey PRIMARY KEY(tenant_id,prefix,year),
  CONSTRAINT document_counters_tenant_id_fkey FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT document_counter_positive_check CHECK (value >= 0 AND year BETWEEN 2000 AND 9999)
);

CREATE FUNCTION protect_official_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.document_type IS NOT NULL THEN RAISE EXCEPTION 'official documents cannot be deleted' USING ERRCODE='55000'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' AND NEW.document_type IS NOT NULL THEN
    IF NEW.generation_status <> 'PENDING' OR NOT EXISTS (
      SELECT 1 FROM document_templates t WHERE t.tenant_id=NEW.tenant_id AND t.id=NEW.document_template_id
        AND t.document_type=NEW.document_type AND t.locale=NEW.locale AND t.version=NEW.template_version AND t.published_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'official document template mismatch' USING ERRCODE='23514'; END IF;
    IF NEW.receipt_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM receipts r JOIN payments p ON (p.tenant_id,p.id)=(r.tenant_id,r.payment_id)
      WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.receipt_id AND p.student_id=NEW.student_id AND p.status='COMPLETED'
    ) THEN RAISE EXCEPTION 'official document receipt mismatch' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.document_type IS NOT NULL OR NEW.document_type IS NOT NULL) THEN
    IF ROW(NEW.tenant_id,NEW.student_id,NEW.document_template_id,NEW.reference,NEW.file_name,NEW.mime_type,NEW.status,NEW.created_at,
      NEW.document_type,NEW.locale,NEW.snapshot,NEW.template_version,NEW.idempotency_key,NEW.enrollment_id,NEW.report_card_id,NEW.receipt_id,NEW.requested_by_membership_id,NEW.supersedes_id)
      IS DISTINCT FROM ROW(OLD.tenant_id,OLD.student_id,OLD.document_template_id,OLD.reference,OLD.file_name,OLD.mime_type,OLD.status,OLD.created_at,
      OLD.document_type,OLD.locale,OLD.snapshot,OLD.template_version,OLD.idempotency_key,OLD.enrollment_id,OLD.report_card_id,OLD.receipt_id,OLD.requested_by_membership_id,OLD.supersedes_id)
    THEN RAISE EXCEPTION 'official document snapshot is immutable' USING ERRCODE='55000'; END IF;
    IF OLD.generation_status IN ('READY','REVOKED','FAILED') AND
      ROW(NEW.object_key,NEW.size_bytes,NEW.checksum,NEW.verification_token_hash,NEW.issued_at,NEW.attempts,NEW.lease_token,NEW.lease_until,NEW.failure_code)
      IS DISTINCT FROM ROW(OLD.object_key,OLD.size_bytes,OLD.checksum,OLD.verification_token_hash,OLD.issued_at,OLD.attempts,OLD.lease_token,OLD.lease_until,OLD.failure_code)
    THEN RAISE EXCEPTION 'official document file is immutable' USING ERRCODE='55000'; END IF;
    IF OLD.generation_status='REVOKED' AND ROW(NEW.revoked_at,NEW.revoked_by_membership_id,NEW.revocation_reason) IS DISTINCT FROM ROW(OLD.revoked_at,OLD.revoked_by_membership_id,OLD.revocation_reason)
    THEN RAISE EXCEPTION 'revocation is immutable' USING ERRCODE='55000'; END IF;
    IF NEW.generation_status IS DISTINCT FROM OLD.generation_status AND NOT (
      (OLD.generation_status='PENDING' AND NEW.generation_status IN ('PROCESSING','FAILED')) OR
      (OLD.generation_status='PROCESSING' AND NEW.generation_status IN ('PENDING','READY','REVOKED','FAILED')) OR
      (OLD.generation_status='READY' AND NEW.generation_status='REVOKED')
    ) THEN RAISE EXCEPTION 'invalid official document transition' USING ERRCODE='55000'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER official_document_guard BEFORE INSERT OR UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION protect_official_document();

CREATE FUNCTION protect_document_template_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.document_type IS NOT NULL THEN RAISE EXCEPTION 'published document template versions are immutable' USING ERRCODE='55000'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_template_version_guard BEFORE UPDATE OR DELETE ON document_templates FOR EACH ROW EXECUTE FUNCTION protect_document_template_version();
COMMIT;
