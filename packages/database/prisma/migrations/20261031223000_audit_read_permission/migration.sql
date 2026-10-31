-- LOT17.4: real tenant audit log access

INSERT INTO "permissions" ("id", "code", "description")
VALUES (uuidv7(), 'audit.read', 'audit.read')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    ELSE 'TENANT'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" = 'audit.read'
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";
