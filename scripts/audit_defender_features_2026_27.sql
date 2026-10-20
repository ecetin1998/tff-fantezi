-- Read-only defender data-provenance audit. Do not use as a migration.
-- BEFORE changing Fantasy projections, confirm that xA totals / per90 come
-- from the same dated source snapshot. MH8 minutes are subtracted only when
-- there is an actual sourced minutes observation.
with roster as (
 select p.id,p.full_name,p.primary_role,s.xa_total,s.xa_per90,
        s.xa_model_per90,s.xa_source,s.advanced_source,
        s.advanced_through_gameweek,s.minutes,s.shots,s.shots_on_target,
        w.minutes as mh8_minutes,
        b.shots as baseline_shots,b.shots_on_target as baseline_sot
 from public.scout_players p
 join public.scout_player_season_stats s
   on s.player_id=p.id and s.season='2026-27'
 left join public.scout_player_weekly_points w
   on w.player_id=p.id and w.gameweek=8 and w.is_final=true
 left join public.scout_player_advanced_baseline b
   on b.player_id=p.id and b.season='2026-27'
 where p.active and p.position='DEF'
   and p.primary_role in ('CB','FB','WB')
), weekly as (
 select player_id,sum(shots) weekly_shots,sum(shots_on_target) weekly_sot
 from public.scout_player_advanced_weekly
 where season='2026-27' and gameweek<=7
 group by player_id
), audited as (
 select p.*,
        case when advanced_through_gameweek=7 and mh8_minutes is not null
          then greatest(0,minutes-mh8_minutes) end as asof7_minutes,
        coalesce(baseline_shots,0)+coalesce(w.weekly_shots,0) as reconciled_shots,
        coalesce(baseline_sot,0)+coalesce(w.weekly_sot,0) as reconciled_sot
 from roster p left join weekly w on w.player_id=p.id
)
select id,full_name,primary_role,xa_per90,xa_total,xa_model_per90,
       asof7_minutes,xa_source,advanced_through_gameweek,
       shots,shots_on_target,reconciled_shots,reconciled_sot,
       case when asof7_minutes>=360 and xa_per90>.12
                  and xa_total is not null and xa_total>=0
                  and xa_per90-greatest(0,xa_total*90/nullif(asof7_minutes,0))>=.12
                  and xa_per90>2.5*greatest(.001,xa_total*90/nullif(asof7_minutes,0))
            then true else false end as xa_rate_needs_source_review,
       case when shots>35 and shots<>reconciled_shots
            then true else false end as shot_provenance_needs_source_review
from audited
where (asof7_minutes>=360 and xa_per90>.12 and xa_total is not null
  and xa_per90-xa_total*90/nullif(asof7_minutes,0)>=.12
  and xa_per90>2.5*greatest(.001,xa_total*90/nullif(asof7_minutes,0)))
 or (shots>35 and shots<>reconciled_shots)
order by primary_role,full_name;
