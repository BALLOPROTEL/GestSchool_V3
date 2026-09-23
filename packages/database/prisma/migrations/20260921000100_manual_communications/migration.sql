CREATE TABLE "communication_requests" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "sender_membership_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "audience_type" VARCHAR(20) NOT NULL,
  "audience_id" UUID NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "channels" JSONB NOT NULL,
  "recipient_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "communication_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "communication_requests_audience_type_check"
    CHECK ("audience_type" IN ('STUDENT', 'CLASS')),
  CONSTRAINT "communication_requests_category_check"
    CHECK ("category" IN ('SCHOOL', 'ACADEMIC', 'FINANCE')),
  CONSTRAINT "communication_requests_recipient_count_check"
    CHECK ("recipient_count" BETWEEN 1 AND 200),
  CONSTRAINT "communication_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "communication_requests_sender_fkey"
    FOREIGN KEY ("tenant_id", "sender_membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "communication_requests_tenant_id_idempotency_key_key"
  ON "communication_requests"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "communication_requests_tenant_id_id_key"
  ON "communication_requests"("tenant_id", "id");
CREATE INDEX "communication_requests_tenant_id_sender_membership_id_created_at_idx"
  ON "communication_requests"("tenant_id", "sender_membership_id", "created_at");

ALTER TABLE "messages" ADD COLUMN "category" VARCHAR(20);
ALTER TABLE "messages" ADD CONSTRAINT "messages_category_check"
  CHECK ("category" IS NULL OR "category" IN ('SCHOOL', 'ACADEMIC', 'FINANCE', 'IAM'));
CREATE INDEX "messages_tenant_id_category_created_at_idx"
  ON "messages"("tenant_id", "category", "created_at");
