-- LOT 11 is additive: preserve all legacy messages and notifications.
ALTER TYPE "message_status" ADD VALUE 'PENDING';
ALTER TYPE "message_status" ADD VALUE 'QUEUED';
ALTER TYPE "message_status" ADD VALUE 'SENDING';
ALTER TYPE "message_status" ADD VALUE 'DELIVERED';
ALTER TYPE "message_status" ADD VALUE 'FAILED';
ALTER TYPE "message_status" ADD VALUE 'BOUNCED';
ALTER TYPE "message_status" ADD VALUE 'REJECTED';
ALTER TYPE "message_status" ADD VALUE 'CANCELLED';

CREATE TYPE "message_channel" AS ENUM ('EMAIL', 'WHATSAPP', 'IN_APP');
CREATE TYPE "message_template_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "users" ADD COLUMN "preferred_locale" VARCHAR(10);
ALTER TABLE "memberships" ADD COLUMN "preferred_locale" VARCHAR(10);

ALTER TABLE "messages" ALTER COLUMN "sender_membership_id" DROP NOT NULL;
ALTER TABLE "messages"
  ADD COLUMN "recipient_guardian_id" UUID,
  ADD COLUMN "channel" "message_channel" NOT NULL DEFAULT 'IN_APP',
  ADD COLUMN "idempotency_key" VARCHAR(240),
  ADD COLUMN "event_id" UUID,
  ADD COLUMN "event_type" VARCHAR(160),
  ADD COLUMN "template_key" VARCHAR(120),
  ADD COLUMN "template_version" INTEGER,
  ADD COLUMN "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
  ADD COLUMN "provider" VARCHAR(40),
  ADD COLUMN "provider_message_id" VARCHAR(255),
  ADD COLUMN "recipient_masked" VARCHAR(254),
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error_code" VARCHAR(80),
  ADD COLUMN "delivered_at" TIMESTAMPTZ(6),
  ADD COLUMN "failed_at" TIMESTAMPTZ(6);
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_guardian_id_fkey"
  FOREIGN KEY ("tenant_id", "recipient_guardian_id") REFERENCES "guardians"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_kind_check"
  CHECK ("recipient_guardian_id" IS NULL OR "recipient_membership_id" IS NULL);
CREATE UNIQUE INDEX "messages_tenant_id_idempotency_key_key" ON "messages"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "messages_provider_provider_message_id_key" ON "messages"("provider", "provider_message_id");
CREATE INDEX "messages_tenant_id_channel_status_created_at_idx" ON "messages"("tenant_id", "channel", "status", "created_at");

ALTER TABLE "notifications"
  ADD COLUMN "locale" VARCHAR(10) NOT NULL DEFAULT 'fr',
  ADD COLUMN "resource_path" VARCHAR(300),
  ADD COLUMN "idempotency_key" VARCHAR(240);
CREATE UNIQUE INDEX "notifications_tenant_id_idempotency_key_key" ON "notifications"("tenant_id", "idempotency_key");
CREATE INDEX "notifications_tenant_id_membership_id_status_created_at_idx"
  ON "notifications"("tenant_id", "membership_id", "status", "created_at");

CREATE TABLE "notification_preferences" (
  "tenant_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "channel" "message_channel" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("tenant_id", "membership_id", "channel"),
  CONSTRAINT "notification_preferences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "notification_preferences_tenant_id_membership_id_fkey"
    FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "message_templates" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID,
  "key" VARCHAR(120) NOT NULL,
  "channel" "message_channel" NOT NULL,
  "locale" VARCHAR(10) NOT NULL,
  "version" INTEGER NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "status" "message_template_status" NOT NULL DEFAULT 'DRAFT',
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "message_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "message_templates_version_check" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "message_templates_tenant_id_key_channel_locale_version_key"
  ON "message_templates"("tenant_id", "key", "channel", "locale", "version");
CREATE UNIQUE INDEX "message_templates_system_key_channel_locale_version_key"
  ON "message_templates"("key", "channel", "locale", "version") WHERE "tenant_id" IS NULL;
CREATE INDEX "message_templates_tenant_id_key_channel_locale_status_idx"
  ON "message_templates"("tenant_id", "key", "channel", "locale", "status");

CREATE TABLE "provider_webhook_events" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "event_key" CHAR(64) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_webhook_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "provider_webhook_events_tenant_id_message_id_fkey"
    FOREIGN KEY ("tenant_id", "message_id") REFERENCES "messages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "provider_webhook_events_event_key_key" ON "provider_webhook_events"("event_key");
CREATE INDEX "provider_webhook_events_tenant_id_message_id_occurred_at_idx"
  ON "provider_webhook_events"("tenant_id", "message_id", "occurred_at");
