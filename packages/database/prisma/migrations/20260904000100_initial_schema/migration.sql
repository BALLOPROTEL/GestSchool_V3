-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "role_scope" AS ENUM ('SYSTEM', 'TENANT');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "person_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "academic_year_status" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "academic_period_type" AS ENUM ('TRIMESTER', 'SEMESTER');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('PENDING', 'ACTIVE', 'TRANSFERRED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "academic_workflow_status" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'PUBLISHED', 'LOCKED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'COMPLETED', 'REVERSED', 'FAILED');

-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "default_currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "default_locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'Africa/Abidjan',
    "values" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scope" "role_scope" NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(120) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "tenant_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "matricule" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "birth_date" DATE,
    "status" "person_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "guardian_reference" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "status" "person_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" VARCHAR(60) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("tenant_id","student_id","guardian_id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "employee_number" VARCHAR(40) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "status" "person_status" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" "academic_year_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "academic_period_type" NOT NULL,
    "ordinal" SMALLINT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_classes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "capacity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "school_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "coefficient" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_on" DATE NOT NULL,
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "max_score" DECIMAL(7,2) NOT NULL DEFAULT 20,
    "weight" DECIMAL(7,2) NOT NULL DEFAULT 1,
    "status" "academic_workflow_status" NOT NULL DEFAULT 'DRAFT',
    "assessed_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "score" DECIMAL(7,2) NOT NULL,
    "status" "academic_workflow_status" NOT NULL DEFAULT 'DRAFT',
    "comment" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_changes" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "changed_by_membership_id" UUID,
    "previous_score" DECIMAL(7,2),
    "new_score" DECIMAL(7,2) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grade_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cards" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "school_class_id" UUID NOT NULL,
    "status" "academic_workflow_status" NOT NULL DEFAULT 'DRAFT',
    "overall_average" DECIMAL(7,2),
    "rank" INTEGER,
    "snapshot" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_card_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_name" VARCHAR(120) NOT NULL,
    "coefficient" DECIMAL(5,2) NOT NULL,
    "average" DECIMAL(7,2) NOT NULL,
    "teacher_remark" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_types" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedules" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedule_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "fee_schedule_id" UUID NOT NULL,
    "fee_type_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "due_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "total_amount_minor" BIGINT NOT NULL,
    "issued_on" DATE NOT NULL,
    "due_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fee_type_id" UUID,
    "description" VARCHAR(240) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount_minor" BIGINT NOT NULL,
    "total_amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_adjustments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "created_by_membership_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID,
    "payment_reference" VARCHAR(50) NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reversal_reference" VARCHAR(50) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "reversed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "receipt_number" VARCHAR(50) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "opened_by_membership_id" UUID NOT NULL,
    "closed_by_membership_id" UUID,
    "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "opening_amount_minor" BIGINT NOT NULL,
    "closing_amount_minor" BIGINT,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID,
    "document_template_id" UUID,
    "reference" VARCHAR(60) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "sender_membership_id" UUID NOT NULL,
    "recipient_membership_id" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'UNREAD',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "actor_membership_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(120) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "tenant_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(120) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key" ON "tenant_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_status_idx" ON "memberships"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_id_key" ON "memberships"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_code_key" ON "roles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_tenant_id_idx" ON "role_permissions"("tenant_id");

-- CreateIndex
CREATE INDEX "membership_roles_tenant_id_idx" ON "membership_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_status_idx" ON "sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_created_at_idx" ON "sessions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "students_tenant_id_status_idx" ON "students"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "students_tenant_id_created_at_idx" ON "students"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_matricule_key" ON "students"("tenant_id", "matricule");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_id_key" ON "students"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_user_id_key" ON "students"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "guardians_tenant_id_status_idx" ON "guardians"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_tenant_id_guardian_reference_key" ON "guardians"("tenant_id", "guardian_reference");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_tenant_id_id_key" ON "guardians"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_tenant_id_user_id_key" ON "guardians"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "student_guardians_tenant_id_guardian_id_idx" ON "student_guardians"("tenant_id", "guardian_id");

-- CreateIndex
CREATE INDEX "teachers_tenant_id_status_idx" ON "teachers"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_employee_number_key" ON "teachers"("tenant_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_id_key" ON "teachers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenant_id_user_id_key" ON "teachers"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "academic_years_tenant_id_status_idx" ON "academic_years"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_code_key" ON "academic_years"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_tenant_id_id_key" ON "academic_years"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "academic_periods_tenant_id_academic_year_id_idx" ON "academic_periods"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_tenant_id_academic_year_id_ordinal_key" ON "academic_periods"("tenant_id", "academic_year_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_tenant_id_id_key" ON "academic_periods"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_tenant_id_id_academic_year_id_key" ON "academic_periods"("tenant_id", "id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "levels_tenant_id_code_key" ON "levels"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "levels_tenant_id_id_key" ON "levels"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "school_classes_tenant_id_academic_year_id_idx" ON "school_classes"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "school_classes_tenant_id_level_id_idx" ON "school_classes"("tenant_id", "level_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_classes_tenant_id_academic_year_id_code_key" ON "school_classes"("tenant_id", "academic_year_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "school_classes_tenant_id_id_key" ON "school_classes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "school_classes_tenant_id_id_academic_year_id_key" ON "school_classes"("tenant_id", "id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_code_key" ON "subjects"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenant_id_id_key" ON "subjects"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "class_subjects_tenant_id_school_class_id_idx" ON "class_subjects"("tenant_id", "school_class_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_tenant_id_school_class_id_subject_id_key" ON "class_subjects"("tenant_id", "school_class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_subjects_tenant_id_id_key" ON "class_subjects"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "teaching_assignments_tenant_id_teacher_id_idx" ON "teaching_assignments"("tenant_id", "teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_tenant_id_class_subject_id_teacher_id__key" ON "teaching_assignments"("tenant_id", "class_subject_id", "teacher_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_tenant_id_id_key" ON "teaching_assignments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_school_class_id_idx" ON "enrollments"("tenant_id", "school_class_id");

-- CreateIndex
CREATE INDEX "enrollments_tenant_id_status_idx" ON "enrollments"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_student_id_academic_year_id_key" ON "enrollments"("tenant_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_tenant_id_id_key" ON "enrollments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "assessments_tenant_id_class_subject_id_idx" ON "assessments"("tenant_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "assessments_tenant_id_status_idx" ON "assessments"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_tenant_id_reference_key" ON "assessments"("tenant_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_tenant_id_id_key" ON "assessments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_student_id_idx" ON "grades"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "grades_tenant_id_status_idx" ON "grades"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_assessment_id_student_id_key" ON "grades"("tenant_id", "assessment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenant_id_id_key" ON "grades"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "grade_changes_tenant_id_grade_id_idx" ON "grade_changes"("tenant_id", "grade_id");

-- CreateIndex
CREATE INDEX "grade_changes_tenant_id_changed_at_idx" ON "grade_changes"("tenant_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "grade_changes_tenant_id_id_key" ON "grade_changes"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "report_cards_tenant_id_school_class_id_idx" ON "report_cards"("tenant_id", "school_class_id");

-- CreateIndex
CREATE INDEX "report_cards_tenant_id_status_idx" ON "report_cards"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_tenant_id_student_id_academic_period_id_key" ON "report_cards"("tenant_id", "student_id", "academic_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_cards_tenant_id_id_key" ON "report_cards"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_lines_tenant_id_report_card_id_subject_id_key" ON "report_card_lines"("tenant_id", "report_card_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_card_lines_tenant_id_id_key" ON "report_card_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_types_tenant_id_code_key" ON "fee_types"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_types_tenant_id_id_key" ON "fee_types"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "fee_schedules_tenant_id_academic_year_id_idx" ON "fee_schedules"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedules_tenant_id_academic_year_id_code_key" ON "fee_schedules"("tenant_id", "academic_year_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedules_tenant_id_id_key" ON "fee_schedules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_items_tenant_id_fee_schedule_id_fee_type_id_key" ON "fee_schedule_items"("tenant_id", "fee_schedule_id", "fee_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_items_tenant_id_id_key" ON "fee_schedule_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_student_id_idx" ON "invoices"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_idx" ON "invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_created_at_idx" ON "invoices"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_number_key" ON "invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_id_key" ON "invoices"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_invoice_id_idx" ON "invoice_lines"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_id_key" ON "invoice_lines"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "invoice_adjustments_tenant_id_invoice_id_idx" ON "invoice_adjustments"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_adjustments_tenant_id_id_key" ON "invoice_adjustments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_idx" ON "payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payments_tenant_id_created_at_idx" ON "payments"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_payment_reference_key" ON "payments"("tenant_id", "payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payment_allocations_tenant_id_invoice_id_idx" ON "payment_allocations"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_tenant_id_payment_id_invoice_id_key" ON "payment_allocations"("tenant_id", "payment_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_tenant_id_id_key" ON "payment_allocations"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payment_reversals_tenant_id_payment_id_idx" ON "payment_reversals"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_reversal_reference_key" ON "payment_reversals"("tenant_id", "reversal_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_tenant_id_id_key" ON "payment_reversals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "receipts_tenant_id_issued_at_idx" ON "receipts"("tenant_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_receipt_number_key" ON "receipts"("tenant_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_payment_id_key" ON "receipts"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenant_id_id_key" ON "receipts"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_status_idx" ON "cash_sessions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_opened_at_idx" ON "cash_sessions"("tenant_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_tenant_id_id_key" ON "cash_sessions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_tenant_id_code_key" ON "document_templates"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_tenant_id_id_key" ON "document_templates"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_student_id_idx" ON "documents"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_status_idx" ON "documents"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tenant_id_reference_key" ON "documents"("tenant_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tenant_id_object_key_key" ON "documents"("tenant_id", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tenant_id_id_key" ON "documents"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "messages_tenant_id_status_idx" ON "messages"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "messages_tenant_id_created_at_idx" ON "messages"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenant_id_id_key" ON "messages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_status_idx" ON "notifications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_created_at_idx" ON "notifications"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_occurred_at_idx" ON "audit_logs"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_tenant_id_id_key" ON "audit_logs"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_status_occurred_at_idx" ON "outbox_events"("tenant_id", "status", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_aggregate_type_aggregate_id_idx" ON "outbox_events"("tenant_id", "aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_id_key" ON "outbox_events"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_tenant_id_guardian_id_fkey" FOREIGN KEY ("tenant_id", "guardian_id") REFERENCES "guardians"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_tenant_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_tenant_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_tenant_id_level_id_fkey" FOREIGN KEY ("tenant_id", "level_id") REFERENCES "levels"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_tenant_id_school_class_id_fkey" FOREIGN KEY ("tenant_id", "school_class_id") REFERENCES "school_classes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_tenant_id_class_subject_id_fkey" FOREIGN KEY ("tenant_id", "class_subject_id") REFERENCES "class_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_tenant_id_teacher_id_fkey" FOREIGN KEY ("tenant_id", "teacher_id") REFERENCES "teachers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_tenant_id_academic_period_id_fkey" FOREIGN KEY ("tenant_id", "academic_period_id") REFERENCES "academic_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_tenant_id_school_class_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "school_class_id", "academic_year_id") REFERENCES "school_classes"("tenant_id", "id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_class_subject_id_fkey" FOREIGN KEY ("tenant_id", "class_subject_id") REFERENCES "class_subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_academic_period_id_fkey" FOREIGN KEY ("tenant_id", "academic_period_id") REFERENCES "academic_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_assessment_id_fkey" FOREIGN KEY ("tenant_id", "assessment_id") REFERENCES "assessments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_tenant_id_grade_id_fkey" FOREIGN KEY ("tenant_id", "grade_id") REFERENCES "grades"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_tenant_id_changed_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "changed_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_tenant_id_academic_period_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "academic_period_id", "academic_year_id") REFERENCES "academic_periods"("tenant_id", "id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_tenant_id_school_class_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "school_class_id", "academic_year_id") REFERENCES "school_classes"("tenant_id", "id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_lines" ADD CONSTRAINT "report_card_lines_tenant_id_report_card_id_fkey" FOREIGN KEY ("tenant_id", "report_card_id") REFERENCES "report_cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_card_lines" ADD CONSTRAINT "report_card_lines_tenant_id_subject_id_fkey" FOREIGN KEY ("tenant_id", "subject_id") REFERENCES "subjects"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_tenant_id_academic_year_id_fkey" FOREIGN KEY ("tenant_id", "academic_year_id") REFERENCES "academic_years"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_tenant_id_fee_schedule_id_fkey" FOREIGN KEY ("tenant_id", "fee_schedule_id") REFERENCES "fee_schedules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_tenant_id_fee_type_id_fkey" FOREIGN KEY ("tenant_id", "fee_type_id") REFERENCES "fee_types"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_fee_type_id_fkey" FOREIGN KEY ("tenant_id", "fee_type_id") REFERENCES "fee_types"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_opened_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "opened_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_closed_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "closed_by_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_document_template_id_fkey" FOREIGN KEY ("tenant_id", "document_template_id") REFERENCES "document_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_sender_membership_id_fkey" FOREIGN KEY ("tenant_id", "sender_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_recipient_membership_id_fkey" FOREIGN KEY ("tenant_id", "recipient_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_actor_membership_id_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks intentionally kept in SQL because Prisma does not model CHECK constraints.
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_currency_check" CHECK ("default_currency" ~ '^[A-Z]{3}$');
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_check" CHECK ("starts_on" <= "ends_on");
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_dates_check" CHECK ("starts_on" <= "ends_on");
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_ordinal_check" CHECK (("type" = 'TRIMESTER' AND "ordinal" BETWEEN 1 AND 3) OR ("type" = 'SEMESTER' AND "ordinal" BETWEEN 1 AND 2));
ALTER TABLE "school_classes" ADD CONSTRAINT "school_classes_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_coefficient_check" CHECK ("coefficient" > 0);
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_dates_check" CHECK ("ended_on" IS NULL OR "enrolled_on" <= "ended_on");
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_scores_check" CHECK ("max_score" > 0 AND "weight" > 0);
ALTER TABLE "grades" ADD CONSTRAINT "grades_score_check" CHECK ("score" >= 0);
ALTER TABLE "grade_changes" ADD CONSTRAINT "grade_changes_scores_check" CHECK (("previous_score" IS NULL OR "previous_score" >= 0) AND "new_score" >= 0);
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_values_check" CHECK (("overall_average" IS NULL OR "overall_average" >= 0) AND ("rank" IS NULL OR "rank" > 0));
ALTER TABLE "report_cards" ADD CONSTRAINT "report_cards_snapshot_check" CHECK ("status" NOT IN ('PUBLISHED', 'LOCKED') OR ("snapshot" IS NOT NULL AND "published_at" IS NOT NULL));
ALTER TABLE "report_card_lines" ADD CONSTRAINT "report_card_lines_values_check" CHECK ("coefficient" > 0 AND "average" >= 0);
ALTER TABLE "fee_schedules" ADD CONSTRAINT "fee_schedules_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_money_check" CHECK ("currency" ~ '^[A-Z]{3}$' AND "total_amount_minor" >= 0);
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_money_check" CHECK ("quantity" > 0 AND "unit_amount_minor" >= 0 AND "total_amount_minor" = "unit_amount_minor" * "quantity");
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_amount_check" CHECK ("amount_minor" <> 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_money_check" CHECK ("currency" ~ '^[A-Z]{3}$' AND "amount_minor" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_amount_check" CHECK ("amount_minor" > 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_money_check" CHECK ("currency" ~ '^[A-Z]{3}$' AND "amount_minor" > 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_money_check" CHECK ("currency" ~ '^[A-Z]{3}$' AND "opening_amount_minor" >= 0 AND ("closing_amount_minor" IS NULL OR "closing_amount_minor" >= 0));
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_state_check" CHECK (("status" = 'OPEN' AND "closed_at" IS NULL AND "closing_amount_minor" IS NULL) OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "closing_amount_minor" IS NOT NULL));
ALTER TABLE "documents" ADD CONSTRAINT "documents_size_check" CHECK ("size_bytes" >= 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "roles" ADD CONSTRAINT "roles_scope_check" CHECK (("scope" = 'SYSTEM' AND "tenant_id" IS NULL AND "is_system") OR ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL AND NOT "is_system"));

-- NULL values do not collide in a regular unique constraint, so global role codes need a partial index.
CREATE UNIQUE INDEX "roles_global_code_key" ON "roles"("code") WHERE "tenant_id" IS NULL;

-- Global roles may be assigned in any tenant. Custom roles must match the membership tenant.
CREATE FUNCTION "enforce_membership_role_tenant"() RETURNS TRIGGER AS $$
DECLARE
  role_tenant UUID;
BEGIN
  SELECT "tenant_id" INTO role_tenant FROM "roles" WHERE "id" = NEW."role_id";
  IF role_tenant IS NOT NULL AND role_tenant <> NEW."tenant_id" THEN
    RAISE EXCEPTION 'membership role tenant mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "membership_roles_tenant_guard"
BEFORE INSERT OR UPDATE ON "membership_roles"
FOR EACH ROW EXECUTE FUNCTION "enforce_membership_role_tenant"();

-- A role-permission row inherits exactly the scope of its role.
CREATE FUNCTION "enforce_role_permission_tenant"() RETURNS TRIGGER AS $$
DECLARE
  role_tenant UUID;
BEGIN
  SELECT "tenant_id" INTO role_tenant FROM "roles" WHERE "id" = NEW."role_id";
  IF role_tenant IS DISTINCT FROM NEW."tenant_id" THEN
    RAISE EXCEPTION 'role permission tenant mismatch' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "role_permissions_tenant_guard"
BEFORE INSERT OR UPDATE ON "role_permissions"
FOR EACH ROW EXECUTE FUNCTION "enforce_role_permission_tenant"();

-- Audit records are immutable: corrections are appended as new records.
CREATE FUNCTION "prevent_audit_log_mutation"() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_log_mutation"();

-- Published snapshots remain immutable historical records.
CREATE FUNCTION "protect_published_report_card"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IN ('PUBLISHED', 'LOCKED') THEN
    RAISE EXCEPTION 'published report cards are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "report_cards_snapshot_guard"
BEFORE UPDATE OR DELETE ON "report_cards"
FOR EACH ROW EXECUTE FUNCTION "protect_published_report_card"();
