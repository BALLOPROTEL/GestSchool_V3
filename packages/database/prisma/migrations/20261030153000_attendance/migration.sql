-- LOT17.1: daily attendance records

CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "attendance_records" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "school_class_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "status" "attendance_status" NOT NULL,
  "note" VARCHAR(500),
  "recorded_by_membership_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_records_tenant_id_id_key"
  ON "attendance_records"("tenant_id", "id");

CREATE UNIQUE INDEX "attendance_records_tenant_id_student_id_date_key"
  ON "attendance_records"("tenant_id", "student_id", "date");

CREATE INDEX "attendance_records_tenant_id_school_class_id_date_idx"
  ON "attendance_records"("tenant_id", "school_class_id", "date");

CREATE INDEX "attendance_records_tenant_id_student_id_date_idx"
  ON "attendance_records"("tenant_id", "student_id", "date" DESC);

CREATE INDEX "attendance_records_tenant_id_recorded_by_membership_id_idx"
  ON "attendance_records"("tenant_id", "recorded_by_membership_id");

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_student_fkey"
  FOREIGN KEY ("tenant_id", "student_id") REFERENCES "students"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_school_class_fkey"
  FOREIGN KEY ("tenant_id", "school_class_id") REFERENCES "school_classes"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_recorded_by_fkey"
  FOREIGN KEY ("tenant_id", "recorded_by_membership_id") REFERENCES "memberships"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
