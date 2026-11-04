-- LOT18.3: controlled administrative enrollment reopening

ALTER TYPE "enrollment_event_kind" ADD VALUE IF NOT EXISTS 'REOPENED';

ALTER TABLE "enrollment_events"
  DROP CONSTRAINT "enrollment_events_reason_check";

ALTER TABLE "enrollment_events"
  ADD CONSTRAINT "enrollment_events_reason_check"
  CHECK (
    kind::text NOT IN ('TRANSFERRED', 'CANCELLED', 'COMPLETED', 'REOPENED')
    OR (reason IS NOT NULL AND length(btrim(reason)) >= 3)
  );

-- Corrections are append-only. Among events already effective on a target day,
-- the most recently recorded correction wins. REOPENED remains a date floor in writes.
CREATE OR REPLACE FUNCTION gestschool_result_class_at(tid UUID, sid UUID, yid UUID, day DATE)
RETURNS UUID LANGUAGE sql STABLE AS $body$
  SELECT CASE
    WHEN ev.id IS NOT NULL THEN CASE WHEN ev.to_status = 'ACTIVE' THEN ev.to_class_id END
    WHEN NOT EXISTS (
      SELECT 1 FROM enrollment_events h
      WHERE h.tenant_id=e.tenant_id AND h.enrollment_id=e.id
    )
      AND e.status IN ('ACTIVE','COMPLETED','WITHDRAWN')
      AND (e.ended_on IS NULL OR day < e.ended_on) THEN e.school_class_id
  END
  FROM enrollments e
  LEFT JOIN LATERAL (
    SELECT h.id, h.to_class_id, h.to_status FROM enrollment_events h
    WHERE h.tenant_id=e.tenant_id AND h.enrollment_id=e.id AND h.effective_date<=day
    ORDER BY h.recorded_at DESC, h.effective_date DESC, h.id DESC LIMIT 1
  ) ev ON TRUE
  WHERE e.tenant_id=tid AND e.student_id=sid AND e.academic_year_id=yid AND e.enrolled_on<=day
$body$;

INSERT INTO "permissions" ("id", "code", "description")
VALUES (uuidv7(), 'enrollments.reopen', 'enrollments.reopen')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    ELSE 'TENANT'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" = 'enrollments.reopen'
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";
