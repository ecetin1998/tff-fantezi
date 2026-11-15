-- MH11 FotMob season aggregate backfill; each team has 11 completed league matches.
-- Sources (retrieved 2026-11-15, prior to MH12):
-- https://www.fotmob.com/en-GB/leagues/71/stats/season/1000000512/teams/big_chance_team/team/8637/galatasaray
-- https://www.fotmob.com/leagues/71/stats/season/1000000512/teams/big_chance_missed_team/team/8695/fenerbahce
-- https://www.fotmob.com/en-GB/leagues/71/stats/season/1000000512/teams/possession_percentage_team/team/8637/galatasaray
-- https://www.fotmob.com/leagues/71/stats/season/1000000512/teams/ontarget_scoring_att_team/team/8695/fenerbahce
-- https://www.fotmob.com/leagues/71/stats/season/42167/teams/touches_in_opp_box_team/super-lig
-- https://www.fotmob.com/leagues/71/stats/season/1000000512/teams/_set_piece_goals_team/team/8695/fenerbahce
-- https://www.fotmob.com/leagues/71/stats/season/1000000512/teams/_set_piece_goals_conceded_team/team/1933/basaksehir
-- Do NOT advance the separate detailed-event/PPDA/channel profile coverage marker.
alter table public.scout_team_tactical_profiles
  add column if not exists aggregate_through_gameweek integer;
do $migration$
declare n integer;
begin
  with evidence(name,goals,bc,bcm,pos,touches,sot,conv,spg,spxg,spgc,spxga) as (values
    ('Trabzonspor',26,50,28,53.9,270,6.6,15.9,2,4.0,2,2.1),
    ('Erzurumspor',10,19,11,42.7,188,3.0,9.3,1,1.8,4,3.0),
    ('Kasımpaşa',17,24,13,42.3,179,4.3,12.1,5,3.5,2,2.8),
    ('Kocaelispor',13,20,13,48.8,189,4.5,9.2,3,2.6,0,1.9),
    ('Amed',28,35,18,48.0,229,5.3,15.9,6,5.1,5,2.5),
    ('Fenerbahçe',29,44,29,55.3,317,6.6,16.2,5,4.2,2,1.5),
    ('Konyaspor',6,21,17,49.1,192,3.1,5.2,2,3.3,4,2.6),
    ('Çorum FK',21,29,14,52.0,230,5.2,14.7,4,1.6,3,3.1),
    ('Beşiktaş',23,31,14,62.6,353,6.5,12.3,3,3.2,3,0.9),
    ('Göztepe',22,32,17,40.4,310,5.6,12.5,6,4.4,4,2.8),
    ('Gençlerbirliği',12,18,12,42.1,177,3.7,9.7,3,3.1,3,4.1),
    ('Rizespor',13,29,19,54.1,256,5.0,7.3,0,3.1,1,2.0),
    ('Başakşehir',19,28,14,50.7,206,4.6,12.9,3,4.2,3,2.4),
    ('Alanyaspor',9,20,15,44.6,177,3.4,7.1,2,3.7,4,4.6),
    ('Samsunspor',11,19,14,53.1,213,3.3,7.9,1,2.5,9,4.7),
    ('Eyüpspor',3,13,11,49.7,166,3.5,2.5,1,3.7,2,1.9),
    ('Galatasaray',27,45,33,59.4,395,7.5,11.5,8,6.8,4,2.3),
    ('Gaziantep',9,20,17,51.4,210,3.9,5.9,2,2.5,2,1.5)
  ), matched as (
    select e.*,t.id from evidence e join public.scout_teams t on t.name=e.name and t.active
    join public.scout_team_season_stats s on s.team_id=t.id and s.through_gameweek=11 and s.matches_played=11 and s.goals_for=e.goals
  )
  update public.scout_team_tactical_profiles t set
    big_chances=e.bc,big_chances_missed=e.bcm,possession_percentage=e.pos,
    touches_in_opposition_box=e.touches,shots_on_target_per_match=e.sot,shot_conversion_rate=e.conv,
    set_piece_goals=e.spg,set_piece_xg=e.spxg,set_piece_goals_conceded=e.spgc,set_piece_xga=e.spxga,
    aggregate_through_gameweek=11,aggregate_source='fotmob_public_team_stats_mh11_reviewed_2026-11-15',
    aggregate_updated_at=now(),updated_at=now()
  from matched e where t.season='2026-27' and t.team_id=e.id and t.through_gameweek=11
    and coalesce(t.aggregate_through_gameweek,0)<=11;
  get diagnostics n=row_count;
  if n<>18 then raise exception 'MH11 aggregate evidence requires all 18 matching team profiles, got %',n; end if;
end $migration$;

-- Raw observations stay immutable. Explicitly reconcile no-shot zeros only when all
-- recorded shots and shots on target exactly exhaust the independent team totals.
-- A missing player row, nonmatching team total, unknown chance creation, and
-- an xG value missing for a player who actually shot are NOT imputed.
create or replace view public.scout_verified_weekly_attack_reconciled
with (security_invoker=true) as
with sums as (
  select a.season,a.gameweek,a.match_id,a.team_id,
    sum(a.shots) as shots,sum(a.shots_on_target) as sot,
    count(a.shots) as known_shots,
    bool_and(a.source ilike 'FotMob%') as source_ok,
    bool_and((a.shots is null and a.shots_on_target is null) or
      (a.shots is not null and a.shots_on_target is not null and a.shots>=0 and a.shots_on_target between 0 and a.shots)) as values_ok,
    bool_and(exists(select 1 from public.scout_player_weekly_points w
      where w.gameweek=a.gameweek and w.player_id=a.player_id and w.match_id=a.match_id and w.is_final and w.minutes>0)) as players_ok
  from public.scout_verified_weekly_attack a
  group by a.season,a.gameweek,a.match_id,a.team_id
), eligible as (
  select s.season,s.gameweek,s.match_id,s.team_id,t.source_observed_at
  from sums s join public.scout_verified_team_match_advanced t using(season,gameweek,match_id,team_id)
  join public.scout_match_history h on h.season=s.season and h.gameweek=s.gameweek and h.match_id=s.match_id
  where s.source_ok and s.values_ok and s.players_ok and s.known_shots>0
    and s.shots=t.shots and s.sot=t.shots_on_target
    and t.source_kind='fotmob_matchDetails_2026_gw8_11_tff_verified'
    and h.match_status='Bitti' and h.fantasy_closure='KAPANDI'
    and ((h.home_team_id=t.team_id and h.away_team_id=t.opponent_team_id)
      or (h.away_team_id=t.team_id and h.home_team_id=t.opponent_team_id))
)
select a.season,a.gameweek,a.player_id,a.match_id,a.team_id,a.provider_player_id,
  case when z.ok then 0::numeric else a.xg end as xg,a.xa,
  case when z.ok then 0 else a.shots end as shots,
  case when z.ok then 0 else a.shots_on_target end as shots_on_target,
  a.key_passes,
  case when z.ok then a.source || ' | no-shot zero reconciled against exact FotMob team totals' else a.source end as source,
  case when z.ok then greatest(a.observed_at,e.source_observed_at) else a.observed_at end as observed_at,
  z.ok as shot_zero_reconciled
from public.scout_verified_weekly_attack a
left join eligible e using(season,gameweek,match_id,team_id)
cross join lateral (select e.team_id is not null and a.shots is null and a.shots_on_target is null and a.xg is null as ok) z;
revoke all on public.scout_verified_weekly_attack_reconciled from public,anon,authenticated;
grant select on public.scout_verified_weekly_attack_reconciled to service_role;
comment on view public.scout_verified_weekly_attack_reconciled is 'Raw immutable provider observations plus mathematically reconciled no-shot zeros; source timestamp reflects both observations. Unknowns remain NULL.';
