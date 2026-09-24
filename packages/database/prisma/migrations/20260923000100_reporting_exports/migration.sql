CREATE TYPE "report_type" AS ENUM (
  'STUDENTS', 'ENROLLMENTS', 'ACADEMIC', 'RESULTS', 'FINANCE',
  'PAYMENTS', 'OUTSTANDING_BALANCES', 'DOCUMENTS', 'COMMUNICATIONS'
);
CREATE TYPE "report_format" AS ENUM ('CSV', 'XLSX', 'PDF');
CREATE TYPE "report_export_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

CREATE TABLE "report_exports" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "requested_by_membership_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "report_type" "report_type" NOT NULL,
  "format" "report_format" NOT NULL,
  "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
  "filters" JSONB NOT NULL,
  "actor_snapshot" JSONB NOT NULL,
  "status" "report_export_status" NOT NULL DEFAULT 'PENDING',
  "storage_key" VARCHAR(500),
  "checksum" CHAR(64),
  "row_count" INTEGER,
  "size_bytes" BIGINT NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_token" UUID,
  "lease_until" TIMESTAMPTZ(6),
  "safe_error_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_exports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "report_exports_requester_fkey"
    FOREIGN KEY ("tenant_id", "requested_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "report_exports_locale_check" CHECK ("locale" IN ('fr', 'en', 'ar')),
  CONSTRAINT "report_exports_attempts_check" CHECK ("attempts" BETWEEN 0 AND 3),
  CONSTRAINT "report_exports_row_count_check" CHECK ("row_count" IS NULL OR "row_count" BETWEEN 0 AND 25000),
  CONSTRAINT "report_exports_ready_check" CHECK (
    "status" <> 'READY' OR
    ("storage_key" IS NOT NULL AND "checksum" IS NOT NULL AND "row_count" IS NOT NULL AND "completed_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "report_exports_tenant_id_id_key" ON "report_exports"("tenant_id", "id");
CREATE UNIQUE INDEX "report_exports_tenant_id_idempotency_key_key" ON "report_exports"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "report_exports_tenant_id_storage_key_key" ON "report_exports"("tenant_id", "storage_key");
CREATE INDEX "report_exports_tenant_id_requested_by_membership_id_created_at_idx"
  ON "report_exports"("tenant_id", "requested_by_membership_id", "created_at");
CREATE INDEX "report_exports_tenant_id_status_created_at_idx"
  ON "report_exports"("tenant_id", "status", "created_at");
