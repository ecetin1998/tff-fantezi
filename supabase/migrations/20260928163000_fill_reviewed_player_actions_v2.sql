begin;

-- Reviewed current-season action data from FotMob, checked 2026-09-28.
-- Only fill values that are explicit (or deterministically implied by zero shots)
-- and never overwrite a value already observed from another source.

update public.scout_player_season_stats s
set shots=coalesce(s.shots,1),
    shots_on_target=coalesce(s.shots_on_target,1),
    key_passes=coalesce(s.key_passes,1),
    crosses=coalesce(s.crosses,2),
    successful_crosses=coalesce(s.successful_crosses,1),
    advanced_source=case
      when s.advanced_source is null then 'fotmob_current_reviewed_2026-09-28'
      when s.advanced_source like '%fotmob_current_reviewed_2026-09-28%' then s.advanced_source
      else s.advanced_source || '|fotmob_current_reviewed_2026-09-28'
    end,
    advanced_through_gameweek=greatest(coalesce(s.advanced_through_gameweek,0),6),
    advanced_updated_at=now(),
    updated_at=now()
where s.season='2026-27' and s.player_id=391;

-- Ousseynou Ba: FotMob explicitly reports 0 shots. SOT=0 follows
-- deterministically because shots on target cannot exceed total shots.
update public.scout_player_season_stats s
set shots=coalesce(s.shots,0),
    shots_on_target=coalesce(s.shots_on_target,0),
    advanced_source=case
      when s.advanced_source is null then 'fotmob_current_reviewed_2026-09-28'
      when s.advanced_source like '%fotmob_current_reviewed_2026-09-28%' then s.advanced_source
      else s.advanced_source || '|fotmob_current_reviewed_2026-09-28'
    end,
    advanced_through_gameweek=greatest(coalesce(s.advanced_through_gameweek,0),6),
    advanced_updated_at=now(),
    updated_at=now()
where s.season='2026-27' and s.player_id=396;

-- Emirhan Boz: FotMob explicitly reports 0 shots. SOT=0 is deterministic.
update public.scout_player_season_stats s
set shots=coalesce(s.shots,0),
    shots_on_target=coalesce(s.shots_on_target,0),
    advanced_source=case
      when s.advanced_source is null then 'fotmob_current_reviewed_2026-09-28'
      when s.advanced_source like '%fotmob_current_reviewed_2026-09-28%' then s.advanced_source
      else s.advanced_source || '|fotmob_current_reviewed_2026-09-28'
    end,
    advanced_through_gameweek=greatest(coalesce(s.advanced_through_gameweek,0),6),
    advanced_updated_at=now(),
    updated_at=now()
where s.season='2026-27' and s.player_id=85;

commit;
