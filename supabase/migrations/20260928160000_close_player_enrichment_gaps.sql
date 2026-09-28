begin;

-- Canonical role ontology for Scout model: wide midfielders are represented
-- as W with role_side preserving the left/right detail.
update public.scout_players
set primary_role='W',
    role_source=case
      when coalesce(role_source,'') like '%canonical_wm_to_w_v1%' then role_source
      when coalesce(role_source,'')='' then 'canonical_wm_to_w_v1'
      else role_source || '|canonical_wm_to_w_v1'
    end,
    updated_at=now()
where active=true
  and primary_role='WM';

-- FotMob currently aliases Emircan Gürlük as "Feyttullah Gürlük". Identity was
-- reviewed against club (Çorum FK), DOB (2003-10-15), shirt 17 and career.
-- The league xA leaderboard reports 0.1, rounded to one decimal. Never
-- overwrite a previously observed xA value.
update public.scout_player_season_stats s
set xa_total=0.1,
    xa_per90=case when coalesce(s.minutes,0)>0
                  then round(0.1*90.0/s.minutes,6)
                  else null end,
    xa_source='fotmob_xa_leaderboard_1dp_identity_reviewed_2026-09-28',
    xa_confidence=.70,
    advanced_updated_at=now(),
    updated_at=now()
where s.season='2026-27'
  and s.player_id=236
  and s.xa_per90 is null
  and coalesce(s.minutes,0)>0;

-- Refresh team attacking contribution shares after closing the final observed
-- xA gap; players still without an observed total retain the prior-backed
-- effective xA fallback.
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
