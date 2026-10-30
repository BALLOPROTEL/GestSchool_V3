-- LOT17.2: tenant settings permissions for existing roles

INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (uuidv7(), 'settings.read', 'settings.read'),
  (uuidv7(), 'settings.write', 'settings.write')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    WHEN r."code" IN ('SCHOOL_ADMIN', 'DIRECTOR') THEN 'TENANT'::"access_scope"
    ELSE 'NONE'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" = 'settings.read'
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    WHEN r."code" = 'SCHOOL_ADMIN' THEN 'TENANT'::"access_scope"
    ELSE 'NONE'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" = 'settings.write'
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";
