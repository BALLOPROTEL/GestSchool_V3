BEGIN;
-- Explicitly reject SQL NULL in required snapshot keys and revocation metadata.
ALTER TABLE documents
  ADD CONSTRAINT documents_snapshot_identity_check CHECK (document_type IS NULL OR
    snapshot @> jsonb_build_object('schemaVersion',1,'documentType',document_type::text,'locale',locale)),
  ADD CONSTRAINT documents_revocation_reason_required CHECK (generation_status <> 'REVOKED' OR
    (revocation_reason IS NOT NULL AND length(btrim(revocation_reason)) >= 5)),
  ADD CONSTRAINT documents_lease_pair_check CHECK ((lease_token IS NULL) = (lease_until IS NULL));

CREATE FUNCTION protect_document_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.document_type IS NOT NULL AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'official document identity is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER official_document_identity_guard BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION protect_document_identity();

CREATE FUNCTION protect_document_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'document history cannot be truncated' USING ERRCODE='55000';
END $$;
CREATE TRIGGER documents_no_truncate BEFORE TRUNCATE ON documents FOR EACH STATEMENT EXECUTE FUNCTION protect_document_history();
CREATE TRIGGER document_templates_no_truncate BEFORE TRUNCATE ON document_templates FOR EACH STATEMENT EXECUTE FUNCTION protect_document_history();
COMMIT;
