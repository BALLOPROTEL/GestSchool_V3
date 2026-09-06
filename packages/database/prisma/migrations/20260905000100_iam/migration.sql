-- Additive IAM extension. The LOT 3 baseline is never rewritten.
CREATE TYPE "access_scope" AS ENUM ('PLATFORM', 'TENANT', 'ASSIGNED', 'CHILDREN', 'OWN', 'NONE');
CREATE TYPE "auth_token_purpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET', 'MFA_LOGIN', 'MFA_ENROLL');
ALTER TABLE "role_permissions" ADD COLUMN "scope" "access_scope" NOT NULL DEFAULT 'NONE';
CREATE UNIQUE INDEX "memberships_tenant_id_id_user_id_key" ON "memberships"("tenant_id", "id", "user_id");
ALTER TABLE "sessions"
  ADD COLUMN "membership_id" UUID,
  ADD COLUMN "user_agent" VARCHAR(512),
  ADD COLUMN "ip_address" VARCHAR(64),
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(6);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_membership_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "membership_id", "user_id") REFERENCES "memberships"("tenant_id", "id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_membership_tenant_check" CHECK ("membership_id" IS NULL OR "tenant_id" IS NOT NULL);
-- Legacy sessions did not authenticate real users; invalidate them during upgrade.
UPDATE "sessions" SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP WHERE "membership_id" IS NULL AND "status" = 'ACTIVE';
CREATE TABLE "auth_identities" (
  "user_id" UUID PRIMARY KEY,
  "password_hash" TEXT,
  "activated_at" TIMESTAMPTZ(6),
  "password_changed_at" TIMESTAMPTZ(6),
  "mfa_secret" TEXT,
  "mfa_enabled_at" TIMESTAMPTZ(6),
  "mfa_last_counter" BIGINT NOT NULL DEFAULT -1,
  CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_identities_activation_check" CHECK (("password_hash" IS NULL) = ("activated_at" IS NULL)),
  CONSTRAINT "auth_identities_mfa_check" CHECK (("mfa_secret" IS NULL) = ("mfa_enabled_at" IS NULL))
);
CREATE TABLE "auth_tokens" (
  "id" UUID PRIMARY KEY DEFAULT uuidv7(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "purpose" "auth_token_purpose" NOT NULL,
  "membership_id" UUID,
  "encrypted_secret" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_tokens_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");
CREATE INDEX "auth_tokens_user_id_purpose_expires_at_idx" ON "auth_tokens"("user_id", "purpose", "expires_at");
CREATE TABLE "refresh_tokens" (
  "id" UUID PRIMARY KEY DEFAULT uuidv7(),
  "session_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "refresh_tokens_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_session_id_expires_at_idx" ON "refresh_tokens"("session_id", "expires_at");
CREATE TABLE "iam_audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT uuidv7(),
  "user_id" UUID,
  "tenant_id" UUID,
  "request_id" UUID NOT NULL,
  "action" VARCHAR(120) NOT NULL,
  "subject_id" UUID,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iam_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "iam_audit_logs_tenant_id_occurred_at_idx" ON "iam_audit_logs"("tenant_id", "occurred_at");
CREATE INDEX "iam_audit_logs_user_id_occurred_at_idx" ON "iam_audit_logs"("user_id", "occurred_at");
CREATE FUNCTION iam_audit_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'IAM audit is append-only';
END;
$$;
CREATE TRIGGER "iam_audit_append_only" BEFORE UPDATE OR DELETE ON "iam_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION iam_audit_append_only();
CREATE TRIGGER "iam_audit_no_truncate" BEFORE TRUNCATE ON "iam_audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION iam_audit_append_only();
