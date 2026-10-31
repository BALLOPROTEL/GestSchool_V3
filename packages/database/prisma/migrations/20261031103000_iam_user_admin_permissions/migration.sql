-- LOT17.3: tenant user administration permissions for existing roles

-- Align pre-LOT17.3 outstanding invitations with the explicit INVITED lifecycle.
-- Restrict the backfill to unactivated identities that actually have an activation token
-- tied to this membership, so unrelated inactive accounts are not rewritten.
UPDATE "memberships" m
SET "status" = 'INVITED'::"membership_status",
    "updated_at" = CURRENT_TIMESTAMP
FROM "auth_identities" i
WHERE i."user_id" = m."user_id"
  AND i."activated_at" IS NULL
  AND m."status" = 'ACTIVE'::"membership_status"
  AND EXISTS (
    SELECT 1
    FROM "auth_tokens" t
    WHERE t."membership_id" = m."id"
      AND t."user_id" = m."user_id"
      AND t."purpose" = 'ACTIVATION'::"auth_token_purpose"
  );

INSERT INTO "permissions" ("id", "code", "description")
VALUES
  (uuidv7(), 'users.read', 'users.read'),
  (uuidv7(), 'users.status', 'users.status'),
  (uuidv7(), 'users.credentials', 'users.credentials')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    ELSE 'TENANT'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" = 'users.read'
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";

INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id", "scope")
SELECT r."id", p."id", r."tenant_id",
  CASE
    WHEN r."code" = 'SUPER_ADMIN' THEN 'PLATFORM'::"access_scope"
    ELSE 'TENANT'::"access_scope"
  END
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('users.status', 'users.credentials')
WHERE r."code" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO UPDATE
SET "tenant_id" = EXCLUDED."tenant_id", "scope" = EXCLUDED."scope";
