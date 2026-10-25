-- The inner v_current_player_cards view is intentionally NOT readable
-- by anon/authenticated (it exposes Pro metrics). The curated public view
-- contains an explicit public-only column allowlist and a safe RLS summary.
-- Execute that curated view with its owner's permissions, without granting
-- public any access to raw projections or the Pro-containing inner view.
ALTER VIEW public.v_current_player_cards_public SET (security_invoker = false);
DO $$
BEGIN
  IF has_table_privilege('anon','public.scout_player_projections','SELECT')
     OR has_table_privilege('anon','public.v_current_player_cards','SELECT') THEN
    RAISE EXCEPTION 'private player projection exposed to anonymous users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='v_current_player_cards_public'
      AND column_name IN ('p25','p75','p90','six_plus_probability','expected_goals','expected_assists',
        'team_goal_share','team_assist_share','attack_contribution_share','hist')
  ) THEN
    RAISE EXCEPTION 'public whitelist includes Pro-only/private metric';
  END IF;
END $$;