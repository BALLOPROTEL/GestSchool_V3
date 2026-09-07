-- LOT 5: additive flags explicitly required for parent/child relationships.
-- Historical links retain notifications; financial-contact designation is opt-in.
ALTER TABLE "student_guardians"
  ADD COLUMN "is_financial_contact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "receives_notifications" BOOLEAN NOT NULL DEFAULT true;
