-- LOT 9: preserve every historical model, row, FK, CHECK and trigger.
-- Nullable numeric values represent explicit outcomes, never an implicit zero.
CREATE TYPE grade_outcome AS ENUM ('SCORED', 'ABSENT', 'EXCUSED', 'NOT_GRADED');
ALTER TABLE assessments
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN archived_at TIMESTAMPTZ(6),
  ADD COLUMN created_by_membership_id UUID,
  ADD COLUMN submitted_by_membership_id UUID,
  ADD CONSTRAINT assessments_finite_values_check CHECK (max_score < 100000 AND weight < 100000),
  ADD CONSTRAINT assessments_version_check CHECK (version > 0),
  ADD CONSTRAINT assessments_creator_fkey FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT assessments_submitter_fkey FOREIGN KEY (tenant_id, submitted_by_membership_id) REFERENCES memberships (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX assessments_tenant_id_academic_period_id_class_subject_id_idx ON assessments (tenant_id, academic_period_id, class_subject_id);
ALTER TABLE grades ADD COLUMN outcome grade_outcome NOT NULL DEFAULT 'SCORED';
ALTER TABLE grades ALTER COLUMN score DROP NOT NULL;
ALTER TABLE grades ADD CONSTRAINT grades_outcome_check CHECK (
  (outcome = 'SCORED' AND score IS NOT NULL) OR (outcome <> 'SCORED' AND score IS NULL)
);
ALTER TABLE grade_changes
  ADD COLUMN previous_outcome grade_outcome,
  ADD COLUMN new_outcome grade_outcome NOT NULL DEFAULT 'SCORED',
  ADD COLUMN previous_comment VARCHAR(500),
  ADD COLUMN new_comment VARCHAR(500),
  ADD COLUMN request_id VARCHAR(100);
ALTER TABLE grade_changes ALTER COLUMN new_score DROP NOT NULL;
ALTER TABLE grade_changes ADD CONSTRAINT grade_changes_outcome_check CHECK (
  (new_outcome = 'SCORED' AND new_score IS NOT NULL) OR (new_outcome <> 'SCORED' AND new_score IS NULL)
);
ALTER TABLE report_card_lines ADD COLUMN outcome grade_outcome NOT NULL DEFAULT 'SCORED';
ALTER TABLE report_card_lines ALTER COLUMN average DROP NOT NULL;
ALTER TABLE report_card_lines ADD CONSTRAINT report_card_lines_outcome_check CHECK (
  (outcome = 'SCORED' AND average IS NOT NULL) OR (outcome <> 'SCORED' AND average IS NULL)
);

-- One persisted finalization event. Published report rows themselves NEVER change,
-- including when locking: the original LOT 3 snapshot trigger is left untouched.
CREATE UNIQUE INDEX report_card_lock_once ON audit_logs (tenant_id, entity_id)
  WHERE action = 'report_card.locked';

-- A dated eligibility rule shared by the API's bulk queries and database guards.
-- The latest effective event wins, with deterministic recorded_at/id tie-breaking.
-- Legacy enrollments without events use only their recorded dates and status.
CREATE FUNCTION gestschool_result_class_at(tid UUID, sid UUID, yid UUID, day DATE)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN ev.id IS NOT NULL THEN CASE WHEN ev.to_status = 'ACTIVE' THEN ev.to_class_id END
    WHEN NOT EXISTS (SELECT 1 FROM enrollment_events h WHERE h.tenant_id=e.tenant_id AND h.enrollment_id=e.id)
      AND e.status IN ('ACTIVE','COMPLETED','WITHDRAWN')
      AND (e.ended_on IS NULL OR day < e.ended_on) THEN e.school_class_id
  END
  FROM enrollments e
  LEFT JOIN LATERAL (
    SELECT h.id, h.to_class_id, h.to_status FROM enrollment_events h
    WHERE h.tenant_id=e.tenant_id AND h.enrollment_id=e.id AND h.effective_date<=day
    ORDER BY h.effective_date DESC, h.recorded_at DESC, h.id DESC LIMIT 1
  ) ev ON TRUE
  WHERE e.tenant_id=tid AND e.student_id=sid AND e.academic_year_id=yid AND e.enrolled_on<=day
$$;

CREATE FUNCTION gestschool_assessment_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context RECORD;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assessments are archived, never deleted' USING ERRCODE='23514'; END IF;
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  SELECT c.id AS class_id,c.academic_year_id,y.status AS year_status,p.status AS period_status,
    p.academic_year_id AS period_year,p.starts_on,p.ends_on INTO context
  FROM class_subjects cs JOIN school_classes c ON (c.tenant_id,c.id)=(cs.tenant_id,cs.school_class_id)
  JOIN academic_years y ON (y.tenant_id,y.id)=(c.tenant_id,c.academic_year_id)
  JOIN academic_periods p ON p.tenant_id=cs.tenant_id AND p.id=NEW.academic_period_id
  WHERE cs.tenant_id=NEW.tenant_id AND cs.id=NEW.class_subject_id;
  IF NOT FOUND OR context.academic_year_id<>context.period_year OR
    NEW.assessed_on NOT BETWEEN context.starts_on AND context.ends_on THEN
    RAISE EXCEPTION 'Incoherent assessment context' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'DRAFT' OR context.year_status IN ('CLOSED','ARCHIVED') OR context.period_status='ARCHIVED' THEN
      RAISE EXCEPTION 'Assessment requires an open context and draft status' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='LOCKED' THEN RAISE EXCEPTION 'Assessment locked' USING ERRCODE='23514'; END IF;
  IF NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.class_subject_id<>OLD.class_subject_id OR
    NEW.academic_period_id<>OLD.academic_period_id OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id OR
    NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Immutable assessment context/version' USING ERRCODE='23514'; END IF;
  IF NEW.status<>OLD.status AND NOT (
    (OLD.status='DRAFT' AND NEW.status='SUBMITTED') OR
    (OLD.status='SUBMITTED' AND NEW.status IN ('DRAFT','VALIDATED')) OR
    (OLD.status='VALIDATED' AND NEW.status='PUBLISHED') OR
    (OLD.status='PUBLISHED' AND NEW.status='LOCKED')
  ) THEN RAISE EXCEPTION 'Invalid assessment transition' USING ERRCODE='23514'; END IF;
  IF OLD.status<>'DRAFT' AND
    ROW(NEW.title,NEW.reference,NEW.assessed_on,NEW.max_score,NEW.weight,NEW.archived_at)
    IS DISTINCT FROM ROW(OLD.title,OLD.reference,OLD.assessed_on,OLD.max_score,OLD.weight,OLD.archived_at)
  THEN RAISE EXCEPTION 'Assessment content frozen after submission' USING ERRCODE='23514'; END IF;
  IF NEW.status<>'LOCKED' AND (context.year_status IN ('CLOSED','ARCHIVED') OR context.period_status='ARCHIVED') THEN
    RAISE EXCEPTION 'Academic context closed' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM grades g WHERE g.tenant_id=NEW.tenant_id AND g.assessment_id=NEW.id AND g.score>NEW.max_score) THEN
    RAISE EXCEPTION 'Maximum below an existing grade' USING ERRCODE='23514';
  END IF;
  IF NEW.assessed_on<>OLD.assessed_on AND EXISTS (
    SELECT 1 FROM grades g WHERE g.tenant_id=NEW.tenant_id AND g.assessment_id=NEW.id
      AND gestschool_result_class_at(g.tenant_id,g.student_id,context.academic_year_id,NEW.assessed_on) IS DISTINCT FROM context.class_id
  ) THEN RAISE EXCEPTION 'Date change invalidates grade eligibility' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER assessments_result_guard BEFORE INSERT OR UPDATE OR DELETE ON assessments
FOR EACH ROW EXECUTE FUNCTION gestschool_assessment_guard();

CREATE FUNCTION gestschool_grade_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a RECORD; change_id UUID;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Grades are retained' USING ERRCODE='23514'; END IF;
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  SELECT aa.*,cs.school_class_id,c.academic_year_id INTO a FROM assessments aa
  JOIN class_subjects cs ON (cs.tenant_id,cs.id)=(aa.tenant_id,aa.class_subject_id)
  JOIN school_classes c ON (c.tenant_id,c.id)=(cs.tenant_id,cs.school_class_id)
  WHERE aa.tenant_id=NEW.tenant_id AND aa.id=NEW.assessment_id;
  IF NOT FOUND OR NEW.score>a.max_score THEN RAISE EXCEPTION 'Invalid grade assessment/scale' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    IF a.status<>'DRAFT' OR NEW.status<>'DRAFT' OR a.archived_at IS NOT NULL OR
      gestschool_result_class_at(NEW.tenant_id,NEW.student_id,a.academic_year_id,a.assessed_on) IS DISTINCT FROM a.school_class_id
    THEN RAISE EXCEPTION 'Student not eligible for draft grade entry' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.tenant_id,NEW.student_id,NEW.assessment_id) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.student_id,OLD.assessment_id) THEN
    RAISE EXCEPTION 'Grade identity immutable' USING ERRCODE='23514'; END IF;
  IF OLD.status='LOCKED' THEN RAISE EXCEPTION 'Grade locked' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.score,NEW.outcome,NEW.comment) IS DISTINCT FROM ROW(OLD.score,OLD.outcome,OLD.comment) THEN
    IF OLD.status='PUBLISHED' AND a.status='PUBLISHED' AND NEW.status='PUBLISHED' THEN
      change_id := nullif(current_setting('gestschool.grade_change_id',TRUE),'')::uuid;
      IF NOT EXISTS (SELECT 1 FROM grade_changes gc WHERE gc.id=change_id AND gc.tenant_id=NEW.tenant_id AND gc.grade_id=NEW.id
        AND gc.changed_by_membership_id IS NOT NULL AND length(btrim(gc.request_id))>0 AND length(btrim(gc.reason))>=3
        AND ROW(gc.previous_score,gc.previous_outcome,gc.previous_comment) IS NOT DISTINCT FROM ROW(OLD.score,OLD.outcome,OLD.comment)
        AND ROW(gc.new_score,gc.new_outcome,gc.new_comment) IS NOT DISTINCT FROM ROW(NEW.score,NEW.outcome,NEW.comment)) THEN
        RAISE EXCEPTION 'Published correction requires its exact history entry' USING ERRCODE='23514';
      END IF;
    ELSIF OLD.status<>'DRAFT' OR a.status<>'DRAFT' OR a.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Grade content frozen' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grades_result_guard BEFORE INSERT OR UPDATE OR DELETE ON grades
FOR EACH ROW EXECUTE FUNCTION gestschool_grade_guard();

-- Deferred check permits the assessment and all its grades to transition atomically.
CREATE FUNCTION gestschool_grade_status_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID; aid UUID;
BEGIN
  tid:=NEW.tenant_id;
  IF TG_TABLE_NAME='assessments' THEN aid:=NEW.id; ELSE aid:=NEW.assessment_id; END IF;
  IF EXISTS (SELECT 1 FROM grades g JOIN assessments a ON (a.tenant_id,a.id)=(g.tenant_id,g.assessment_id)
    WHERE g.tenant_id=tid AND g.assessment_id=aid AND g.status<>a.status) THEN
    RAISE EXCEPTION 'Grade/assessment workflow mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER grades_workflow_consistency AFTER INSERT OR UPDATE ON grades
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gestschool_grade_status_consistency();
CREATE CONSTRAINT TRIGGER assessments_workflow_consistency AFTER UPDATE ON assessments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gestschool_grade_status_consistency();

CREATE FUNCTION gestschool_result_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Result history is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER grade_changes_append_only BEFORE UPDATE OR DELETE ON grade_changes
FOR EACH ROW EXECUTE FUNCTION gestschool_result_history_guard();
CREATE TRIGGER grade_changes_no_truncate BEFORE TRUNCATE ON grade_changes
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_result_history_guard();
CREATE TRIGGER grades_no_truncate BEFORE TRUNCATE ON grades
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_result_history_guard();
CREATE TRIGGER assessments_no_truncate BEFORE TRUNCATE ON assessments
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_result_history_guard();
CREATE TRIGGER report_cards_no_truncate BEFORE TRUNCATE ON report_cards
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_result_history_guard();
CREATE TRIGGER report_card_lines_no_truncate BEFORE TRUNCATE ON report_card_lines
FOR EACH STATEMENT EXECUTE FUNCTION gestschool_result_history_guard();

CREATE FUNCTION gestschool_report_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid UUID;
BEGIN
  IF TG_OP='DELETE' THEN tid:=OLD.tenant_id; ELSE tid:=NEW.tenant_id; END IF;
  PERFORM id FROM tenants WHERE id=tid FOR UPDATE;
  IF TG_OP<>'INSERT' AND EXISTS (SELECT 1 FROM report_cards r WHERE (r.tenant_id,r.id)=(OLD.tenant_id,OLD.report_card_id) AND r.status IN ('PUBLISHED','LOCKED')) THEN
    RAISE EXCEPTION 'Published report lines immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP<>'DELETE' AND EXISTS (SELECT 1 FROM report_cards r WHERE (r.tenant_id,r.id)=(NEW.tenant_id,NEW.report_card_id) AND r.status IN ('PUBLISHED','LOCKED')) THEN
    RAISE EXCEPTION 'Cannot attach lines to published report' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_card_lines_snapshot_guard BEFORE INSERT OR UPDATE OR DELETE ON report_card_lines
FOR EACH ROW EXECUTE FUNCTION gestschool_report_line_guard();

CREATE FUNCTION gestschool_report_write_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  RETURN NEW;
END $$;
CREATE TRIGGER report_cards_write_lock BEFORE INSERT OR UPDATE ON report_cards
FOR EACH ROW EXECUTE FUNCTION gestschool_report_write_lock();
