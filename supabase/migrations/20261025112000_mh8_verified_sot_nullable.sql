-- Mirrors the production migration applied on 2026-10-25.
-- The verified MH8 importer already reads and validates "shots_on_target" but
-- the evidence table lacked a matching column. Only explicit source values are
-- recorded; an omitted field MUST remain NULL, never an invented zero.
ALTER TABLE public.scout_verified_weekly_attack
  ADD COLUMN IF NOT EXISTS shots_on_target integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='scout_verified_weekly_attack_sot_plausible'
  ) THEN
    ALTER TABLE public.scout_verified_weekly_attack
      ADD CONSTRAINT scout_verified_weekly_attack_sot_plausible
      CHECK (
        shots_on_target IS NULL OR
        (shots_on_target BETWEEN 0 AND 35
         AND (shots IS NULL OR shots_on_target <= shots))
      );
  END IF;
END $$;
