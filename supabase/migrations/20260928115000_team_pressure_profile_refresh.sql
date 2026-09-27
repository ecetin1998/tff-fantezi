begin;

alter table public.scout_team_tactical_profiles
  add column if not exists touches_in_opposition_box integer,
  add column if not exists possession_percentage numeric,
  add column if not exists shot_conversion_rate numeric;

with v(
  team_id,touches_in_opposition_box,possession_percentage,shot_conversion_rate,
  set_piece_goals,set_piece_xg,set_piece_goals_conceded,set_piece_xga
) as (
  values
(1,145,56.5,15.3,0,1.8,2,2.1),
(2,98,42.9,5.6,0,1.2,3,2),
(3,90,41.7,9.9,2,1.8,1,1.2),
(4,100,47.2,9.5,1,0.7,0,1.3),
(5,116,45.7,17.1,5,3.3,3,1.4),
(6,183,55.6,14.6,5,3.6,0,0.4),
(7,102,47.7,5.7,0,1.9,2,1.6),
(8,135,54.2,16.7,2,0.7,3,2.4),
(9,198,62.7,13.1,3,2.7,2,0.4),
(10,180,39.8,10.7,5,2.8,4,2),
(11,105,43.9,6.9,1,1.6,1,2.4),
(12,118,56,7.5,0,1.7,0,1.6),
(13,113,53.3,12.8,0,0.9,3,1.6),
(14,92,40.7,12.3,2,1.8,3,2.3),
(15,114,57,7.6,1,1.2,3,0.8),
(16,102,47.9,2.6,1,2.3,2,1.3),
(17,208,58.2,9.6,4,3.9,2,1.3),
(18,98,49,9,2,1.7,0,0.5)
)
update public.scout_team_tactical_profiles p
set touches_in_opposition_box=v.touches_in_opposition_box,
    possession_percentage=v.possession_percentage,
    shot_conversion_rate=v.shot_conversion_rate,
    set_piece_goals=v.set_piece_goals,
    set_piece_xg=v.set_piece_xg,
    set_piece_goals_conceded=v.set_piece_goals_conceded,
    set_piece_xga=v.set_piece_xga,
    aggregate_source='fotmob_public_team_stats_reviewed_2026-09-28',
    aggregate_updated_at=now(),
    updated_at=now()
from v
where p.season='2026-27' and p.team_id=v.team_id;

grant select(
  touches_in_opposition_box,possession_percentage,shot_conversion_rate
) on public.scout_team_tactical_profiles to anon,authenticated;

commit;
