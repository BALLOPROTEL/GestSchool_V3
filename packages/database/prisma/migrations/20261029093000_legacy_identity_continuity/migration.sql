-- LOT16: additive compatibility for GestSchool V2 usernames.
ALTER TABLE "memberships"
  ADD COLUMN "legacy_username" VARCHAR(150);

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_legacy_username_nonempty_check"
  CHECK ("legacy_username" IS NULL OR btrim("legacy_username") <> '');

CREATE UNIQUE INDEX "memberships_tenant_id_legacy_username_key"
  ON "memberships"("tenant_id", "legacy_username");

CREATE INDEX "memberships_legacy_username_idx"
  ON "memberships"("legacy_username");
