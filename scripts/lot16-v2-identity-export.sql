-- LOT16 V2 identity dry-run export.
-- Read-only: intentionally excludes password_hash, refresh tokens, security tokens,
-- sessions, cookies and MFA/activation/reset material.
SELECT jsonb_pretty(
  jsonb_build_object(
    'schemaVersion',
    1,
    'users',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sourceUserId', source_user_id,
          'tenantId', tenant_id,
          'username', username,
          'email', email,
          'role', role,
          'accountType', account_type,
          'status', status,
          'isActive', is_active,
          'disabledAt', disabled_at,
          'passwordHashKind', 'BCRYPT'
        )
        ORDER BY tenant_id, source_user_id
      ),
      '[]'::jsonb
    )
  )
)
FROM (
  SELECT
    id::text AS source_user_id,
    tenant_id::text AS tenant_id,
    username,
    email,
    role,
    account_type,
    status,
    is_active,
    disabled_at
  FROM users
  WHERE deleted_at IS NULL
) AS source_users;
