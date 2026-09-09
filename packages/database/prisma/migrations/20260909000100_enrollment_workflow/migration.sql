-- LOT 7: additive only. No previous enrollment is reclassified or deleted.
CREATE TYPE enrollment_type AS ENUM ('NEW', 'RE_ENROLLMENT', 'TRANSFER');
CREATE TYPE enrollment_event_kind AS ENUM ('BASELINE', 'CREATED', 'UPDATED', 'CONFIRMED', 'CANCELLED', 'TRANSFERRED', 'COMPLETED');
ALTER TABLE enrollments ADD COLUMN type enrollment_type;
CREATE UNIQUE INDEX enrollments_tenant_id_id_academic_year_id_key ON enrollments (tenant_id, id, academic_year_id);

CREATE TABLE enrollment_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  tenant_id UUID NOT NULL,
  enrollment_id UUID NOT NULL,
  academic_year_id UUID NOT NULL,
  kind enrollment_event_kind NOT NULL,
  from_class_id UUID,
  to_class_id UUID NOT NULL,
  from_class_name VARCHAR(120),
  to_class_name VARCHAR(120) NOT NULL,
  from_status enrollment_status,
  to_status enrollment_status NOT NULL,
  type enrollment_type,
  effective_date DATE NOT NULL,
  reason VARCHAR(1000),
  actor_membership_id UUID,
  actor_name VARCHAR(200),
  request_id VARCHAR(100),
  recorded_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT enrollment_events_enrollment_fkey FOREIGN KEY (tenant_id, enrollment_id, academic_year_id) REFERENCES enrollments (tenant_id, id, academic_year_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_events_from_class_fkey FOREIGN KEY (tenant_id, from_class_id, academic_year_id) REFERENCES school_classes (tenant_id, id, academic_year_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_events_to_class_fkey FOREIGN KEY (tenant_id, to_class_id, academic_year_id) REFERENCES school_classes (tenant_id, id, academic_year_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_events_actor_fkey FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT enrollment_events_actor_check CHECK (kind = 'BASELINE' OR (actor_membership_id IS NOT NULL AND actor_name IS NOT NULL AND request_id IS NOT NULL)),
  CONSTRAINT enrollment_events_reason_check CHECK (kind NOT IN ('TRANSFERRED', 'CANCELLED', 'COMPLETED') OR (reason IS NOT NULL AND length(btrim(reason)) >= 3)),
  CONSTRAINT enrollment_events_transfer_check CHECK (kind <> 'TRANSFERRED' OR (from_class_id IS NOT NULL AND from_class_id <> to_class_id)),
  CONSTRAINT enrollment_events_class_snapshot_check CHECK ((from_class_id IS NULL) = (from_class_name IS NULL))
);
CREATE UNIQUE INDEX enrollment_events_tenant_id_id_key ON enrollment_events (tenant_id, id);
CREATE INDEX enrollment_events_tenant_id_enrollment_id_recorded_at_id_idx ON enrollment_events (tenant_id, enrollment_id, recorded_at, id);
CREATE INDEX enrollment_events_tenant_id_from_class_id_idx ON enrollment_events (tenant_id, from_class_id);
CREATE INDEX enrollment_events_tenant_id_to_class_id_idx ON enrollment_events (tenant_id, to_class_id);
CREATE INDEX enrollment_events_tenant_id_actor_membership_id_idx ON enrollment_events (tenant_id, actor_membership_id);

-- A baseline records only the state actually known at upgrade, not an invented actor or transfer.
INSERT INTO enrollment_events (tenant_id, enrollment_id, academic_year_id, kind, to_class_id, to_class_name, to_status, effective_date)
SELECT e.tenant_id, e.id, e.academic_year_id, 'BASELINE', e.school_class_id, c.name, e.status, e.enrolled_on
FROM enrollments e JOIN school_classes c ON (c.tenant_id, c.id) = (e.tenant_id, e.school_class_id);

CREATE FUNCTION gestschool_enrollment_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Enrollment history is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER enrollment_events_append_only BEFORE UPDATE OR DELETE ON enrollment_events
FOR EACH ROW EXECUTE FUNCTION gestschool_enrollment_history_append_only();
CREATE TRIGGER enrollment_events_no_truncate BEFORE TRUNCATE ON enrollment_events
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_enrollment_history_append_only();
CREATE TRIGGER enrollments_no_delete BEFORE DELETE ON enrollments
FOR EACH ROW EXECUTE FUNCTION gestschool_enrollment_history_append_only();
CREATE TRIGGER enrollments_no_truncate BEFORE TRUNCATE ON enrollments
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_enrollment_history_append_only();
