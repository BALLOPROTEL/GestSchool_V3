-- Additive LOT 6 migration. Historical migrations and all existing rows are retained.
-- Fail explicitly on incompatible pre-existing data; never repair history silently.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM academic_years WHERE status = 'ACTIVE' GROUP BY tenant_id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM academic_years WHERE starts_on >= ends_on)
    OR EXISTS (SELECT 1 FROM academic_periods WHERE starts_on >= ends_on)
    OR EXISTS (
      SELECT 1 FROM teaching_assignments a
      JOIN class_subjects cs ON (cs.tenant_id, cs.id) = (a.tenant_id, a.class_subject_id)
      JOIN school_classes c ON (c.tenant_id, c.id) = (cs.tenant_id, cs.school_class_id)
      JOIN academic_periods p ON (p.tenant_id, p.id) = (a.tenant_id, a.academic_period_id)
      WHERE c.academic_year_id <> p.academic_year_id
    ) THEN RAISE EXCEPTION 'LOT 6 preflight: incompatible academic data; manual review required';
  END IF;
END $$;

ALTER TYPE academic_year_status ADD VALUE 'ARCHIVED';
CREATE TYPE academic_record_status AS ENUM ('ACTIVE', 'ARCHIVED');
ALTER TABLE academic_years ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE academic_periods ADD COLUMN status academic_record_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE levels ADD COLUMN status academic_record_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE school_classes ADD COLUMN status academic_record_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE subjects ADD COLUMN status academic_record_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN archived_at TIMESTAMPTZ(6);
ALTER TABLE teaching_assignments ADD COLUMN status academic_record_status NOT NULL DEFAULT 'ACTIVE', ADD COLUMN archived_at TIMESTAMPTZ(6), ADD COLUMN updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX academic_years_one_active_per_tenant ON academic_years (tenant_id) WHERE status = 'ACTIVE';
ALTER TABLE academic_years ADD CONSTRAINT academic_years_strict_dates_check CHECK (starts_on < ends_on);
ALTER TABLE academic_periods ADD CONSTRAINT academic_periods_strict_dates_check CHECK (starts_on < ends_on);
-- Compare the extended enum as text so no new enum literal is used in this migration transaction.
ALTER TABLE academic_years ADD CONSTRAINT academic_years_archive_check CHECK ((status::text = 'ARCHIVED') = (archived_at IS NOT NULL));
ALTER TABLE academic_periods ADD CONSTRAINT academic_periods_archive_check CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));
ALTER TABLE levels ADD CONSTRAINT levels_archive_check CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));
ALTER TABLE school_classes ADD CONSTRAINT school_classes_archive_check CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));
ALTER TABLE subjects ADD CONSTRAINT subjects_archive_check CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));
ALTER TABLE teaching_assignments ADD CONSTRAINT teaching_assignments_archive_check CHECK ((status = 'ARCHIVED') = (archived_at IS NOT NULL));

CREATE FUNCTION gestschool_assignment_year_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM class_subjects cs
    JOIN school_classes c ON (c.tenant_id, c.id) = (cs.tenant_id, cs.school_class_id)
    JOIN academic_periods p ON (p.tenant_id, p.id) = (NEW.tenant_id, NEW.academic_period_id)
    WHERE (cs.tenant_id, cs.id) = (NEW.tenant_id, NEW.class_subject_id)
      AND c.academic_year_id <> p.academic_year_id
  ) THEN
    RAISE EXCEPTION 'Teaching assignment academic year mismatch' USING ERRCODE = '23514', CONSTRAINT = 'teaching_assignments_year_check';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER teaching_assignments_year_guard
BEFORE INSERT OR UPDATE ON teaching_assignments
FOR EACH ROW EXECUTE FUNCTION gestschool_assignment_year_guard();
