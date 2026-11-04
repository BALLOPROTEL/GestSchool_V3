ALTER TABLE "memberships"
  ADD COLUMN "avatar_key" VARCHAR(512),
  ADD COLUMN "avatar_mime" VARCHAR(32),
  ADD COLUMN "avatar_updated_at" TIMESTAMPTZ(6);

ALTER TABLE "students"
  ADD COLUMN "avatar_key" VARCHAR(512),
  ADD COLUMN "avatar_mime" VARCHAR(32),
  ADD COLUMN "avatar_updated_at" TIMESTAMPTZ(6);

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_avatar_pair_check"
  CHECK (
    ("avatar_key" IS NULL AND "avatar_mime" IS NULL AND "avatar_updated_at" IS NULL)
    OR
    ("avatar_key" IS NOT NULL AND "avatar_mime" IN ('image/jpeg', 'image/png') AND "avatar_updated_at" IS NOT NULL)
  );

ALTER TABLE "students"
  ADD CONSTRAINT "students_avatar_pair_check"
  CHECK (
    ("avatar_key" IS NULL AND "avatar_mime" IS NULL AND "avatar_updated_at" IS NULL)
    OR
    ("avatar_key" IS NOT NULL AND "avatar_mime" IN ('image/jpeg', 'image/png') AND "avatar_updated_at" IS NOT NULL)
  );
