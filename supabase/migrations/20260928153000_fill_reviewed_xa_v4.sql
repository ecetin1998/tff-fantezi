begin;

-- Reviewed Super Lig 2026/27 xA leaderboard snapshot, checked 2026-09-28.
-- Values are displayed by the source to one decimal, so confidence remains below
-- exact player-page totals. Existing observed xA is never overwritten.
with src(player_id,xa_total) as (
  values
    (410::bigint,0.0::numeric), -- Berkay Özcan
    (187,0.0),                  -- Çağlar Söyüncü
    (501,0.0),                  -- Christ Sadia
    (272,0.0),                  -- Emre Bilgin
    (500,0.0),                  -- Taşkın İlter
    (1539,0.0),                 -- Abakar Sylla
    (576,0.0),                  -- Ogün Özçiçek
    (1075,0.0),                 -- Kevin Mouanga
    (102,0.0),                  -- Thiemoko Diarra
    (1538,0.1),                 -- Can Bozdoğan
    (354,0.0),                  -- Muhammet Taha Şahin
    (377,0.0)                   -- Siaka Bakayoko
)
update public.scout_player_season_stats s
set xa_total=src.xa_total,
    xa_per90=case when coalesce(s.minutes,0)>0
                  then round(src.xa_total*90.0/s.minutes,6)
                  else null end,
    xa_source='fotmob_xa_leaderboard_1dp_reviewed_2026-09-28',
    xa_confidence=.70,
    advanced_updated_at=now(),
    updated_at=now()
from src
where s.season='2026-27'
  and s.player_id=src.player_id
  and s.xa_per90 is null
  and coalesce(s.minutes,0)>0;

-- Taşkın İlter's current-season player shot map also exposes one on-target shot.
update public.scout_player_season_stats s
set shots=coalesce(s.shots,1),
    shots_on_target=coalesce(s.shots_on_target,1),
    advanced_updated_at=now(),
    updated_at=now()
where s.season='2026-27'
  and s.player_id=500
  and coalesce(s.minutes,0)>0;

-- Recompute team attacking contribution share using observed xA when present and
-- the existing effective prior blend only for still-uncovered players.
with features as (
  select s.player_id,p.team_id,
         coalesce(s.xg_total,0) xg_total,
         coalesce(
           s.xa_total,
           f.effective_xa_per90*coalesce(s.minutes,0)/90.0,
           0
         ) effective_xa_total
  from public.scout_player_season_stats s
  join public.scout_players p on p.id=s.player_id and p.active=true
  left join public.v_scout_player_model_features f on f.player_id=s.player_id
  where s.season='2026-27'
), totals as (
  select team_id,sum(xg_total+effective_xa_total) denom
  from features
  group by team_id
)
update public.scout_player_season_stats s
set attack_contribution_share=
      case when totals.denom>0
           then (features.xg_total+features.effective_xa_total)/totals.denom
           else 0 end,
    advanced_updated_at=now()
from features
join totals on totals.team_id=features.team_id
where s.season='2026-27'
  and s.player_id=features.player_id;

commit;
