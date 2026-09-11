-- Additional LOT 9 defenses; all historical migration files remain unchanged.
CREATE FUNCTION gestschool_grade_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context RECORD;
BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.score,NEW.outcome,NEW.comment) IS NOT DISTINCT FROM ROW(OLD.score,OLD.outcome,OLD.comment) THEN RETURN NEW; END IF;
  PERFORM id FROM tenants WHERE id=NEW.tenant_id FOR UPDATE;
  SELECT a.assessed_on,a.archived_at,a.status,c.id AS class_id,c.academic_year_id,
    y.status AS year_status,p.status AS period_status INTO context
  FROM assessments a
  JOIN class_subjects cs ON (cs.tenant_id,cs.id)=(a.tenant_id,a.class_subject_id)
  JOIN school_classes c ON (c.tenant_id,c.id)=(cs.tenant_id,cs.school_class_id)
  JOIN academic_years y ON (y.tenant_id,y.id)=(c.tenant_id,c.academic_year_id)
  JOIN academic_periods p ON (p.tenant_id,p.id)=(a.tenant_id,a.academic_period_id)
  WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.assessment_id;
  IF NOT FOUND OR context.year_status IN ('CLOSED','ARCHIVED') OR context.period_status='ARCHIVED' OR context.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Grade academic context is closed' USING ERRCODE='23514';
  END IF;
  IF context.status='DRAFT' AND gestschool_result_class_at(NEW.tenant_id,NEW.student_id,context.academic_year_id,context.assessed_on) IS DISTINCT FROM context.class_id THEN
    RAISE EXCEPTION 'Draft grade eligibility changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grades_context_guard BEFORE INSERT OR UPDATE ON grades
FOR EACH ROW EXECUTE FUNCTION gestschool_grade_context_guard();

-- Dated roster lookups used by bulk entry and result calculations.
CREATE INDEX enrollment_events_result_date_idx
ON enrollment_events (tenant_id,enrollment_id,effective_date DESC,recorded_at DESC,id DESC);
