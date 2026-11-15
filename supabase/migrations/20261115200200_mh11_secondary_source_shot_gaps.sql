-- Secondary-source match observations, preserve raw provider data and known non-null values.
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
), base as (
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
cross join lateral (select e.team_id is not null and a.shots is null and a.shots_on_target is null and a.xg is null as ok) z
), evidence(gameweek,match_id,team_name,player_name,provider_player_id,key_passes,source) as (values (10,317867,'Başakşehir','Muhammed Şengezer',814153,0,'PitchLab / Flashscore 2026-11-01 https://pitchlabstats.com/match/2026-11-01-buyuksehyr-samsunspor'),
(10,317867,'Başakşehir','Olivier Michel Kemen',625164,0,'PitchLab / Flashscore 2026-11-01 https://pitchlabstats.com/match/2026-11-01-buyuksehyr-samsunspor'),
(10,317872,'Kocaelispor','Anfernee Jamal Dijksteel',798661,0,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(10,317872,'Kocaelispor','Metehan Altunbaş',975117,0,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(10,317872,'Kocaelispor','Muharrem Cinan',1107967,0,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(10,317872,'Kocaelispor','Serhat Öztaşdelen',1787611,0,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(10,317872,'Kocaelispor','Tobias Fjeld Gulliksen',1093003,0,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(10,317872,'Kocaelispor','Uğur Kaan Yıldız',1210041,4,'PitchLab / SkorPusula 2026-10-31 https://skorpusula.com/mac/1584454-kocaelispor-rizespor'),
(11,317880,'Çorum FK','Emircan Gürlük',1327848,1,'PitchLab / FotMob / Flashscore 2026-11-08 https://pitchlabstats.com/match/2026-11-08-corum-fenerbahce https://www.fotmob.com/players/1327848/emircan-gurluk')
), matched as (
 select h.season,e.gameweek,e.match_id,t.id as team_id,p.id as player_id,e.provider_player_id,e.key_passes,e.source,
 '2026-11-15 20:11:48.549814+00'::timestamptz as observed_at
 from evidence e join public.scout_teams t on t.name=e.team_name
 join public.scout_players p on p.full_name=e.player_name
 join public.scout_player_weekly_points w on w.player_id=p.id and w.gameweek=e.gameweek and w.match_id=e.match_id
 join public.scout_match_history h on h.season='2026-27' and h.gameweek=e.gameweek and h.match_id=e.match_id
 where w.is_final and w.minutes>0 and h.match_status='Bitti' and h.fantasy_closure='KAPANDI'
 and t.id in (h.home_team_id,h.away_team_id)
 and (exists(select 1 from base b where b.season=h.season and b.gameweek=e.gameweek and b.match_id=e.match_id and b.team_id=t.id and b.player_id=p.id and b.provider_player_id=e.provider_player_id)
 or (e.player_name='Emircan Gürlük' and p.team_id=t.id and not exists(select 1 from base b where b.season=h.season and b.gameweek=e.gameweek and b.player_id=p.id)))
)
select b.season,b.gameweek,b.player_id,b.match_id,b.team_id,b.provider_player_id,
 case when m.player_id is not null and b.shots is null and b.xg is null then 0::numeric else b.xg end as xg,
 b.xa,
 case when m.player_id is not null and b.shots is null then 0 else b.shots end as shots,
 case when m.player_id is not null and b.shots_on_target is null and b.shots is null then 0 else b.shots_on_target end as shots_on_target,
 coalesce(b.key_passes,m.key_passes) as key_passes,
 case when m.player_id is not null and (b.shots is null or b.key_passes is null) then b.source || ' | ' || m.source else b.source end as source,
 case when m.player_id is not null and (b.shots is null or b.key_passes is null) then greatest(b.observed_at,m.observed_at) else b.observed_at end as observed_at,
 b.shot_zero_reconciled
from base b left join matched m using(season,gameweek,match_id,team_id,player_id,provider_player_id)
union all
select m.season,m.gameweek,m.player_id,m.match_id,m.team_id,m.provider_player_id,0::numeric,null::numeric,0,0,m.key_passes,m.source,m.observed_at,false
from matched m where not exists(select 1 from base b where b.season=m.season and b.gameweek=m.gameweek and b.player_id=m.player_id);


revoke all on public.scout_verified_weekly_attack_reconciled from public,anon,authenticated;
grant select on public.scout_verified_weekly_attack_reconciled to service_role;
