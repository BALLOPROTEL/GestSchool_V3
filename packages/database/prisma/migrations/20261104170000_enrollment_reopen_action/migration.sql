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
