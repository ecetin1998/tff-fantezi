-- Separate provider observations; do not overwrite the existing model's inputs or event-coverage marker.
alter table public.scout_team_tactical_profiles add column if not exists tactical_action_profile jsonb;
do $$
declare n integer;
begin
with evidence(name,accurate_crosses,dribble_attempts,dribble_successes,key_passes,ppda_mh10,ppda_mh11) as (
values
('Trabzonspor',4.4,197,99,132,12.1,null),
('Erzurumspor',4.7,113,61,82,16.9,null),
('Kasımpaşa',2.5,153,80,102,11.9,18.04),
('Kocaelispor',3.6,126,64,110,13,9.88),
('Amed',2.8,149,77,128,13.5,null),
('Fenerbahçe',4.6,130,69,137,11.3,null),
('Konyaspor',4.6,137,64,87,13,13.29),
('Çorum FK',3.7,137,61,111,12.9,null),
('Beşiktaş',3.6,156,72,134,9.6,8),
('Göztepe',6.6,205,100,126,10.2,null),
('Gençlerbirliği',2.9,109,65,81,14,null),
('Rizespor',6.1,199,97,137,10.8,null),
('Başakşehir',4.5,114,57,109,13,null),
('Alanyaspor',4.6,112,54,87,16.8,17.18),
('Samsunspor',4.5,122,56,98,12.2,12.06),
('Eyüpspor',3.5,166,90,80,16.8,null),
('Galatasaray',6,159,81,180,9.7,8),
('Gaziantep',4.9,146,72,116,13.3,9.58)
), updated as (
update public.scout_team_tactical_profiles p set tactical_action_profile=jsonb_build_object(
'through_gameweek',11,'matches',11,'observed_on','2026-11-15',
'crosses',jsonb_build_object('accurate_per_match',e.accurate_crosses,'through_gameweek',11,'source_url','https://ilk11ler.com/istatistikler/lig/super-lig-52/takim/accurate_cross_team','method','provider reported accurate crosses per game; rounded, not total attempts'),
'dribbles',jsonb_build_object('attempted',e.dribble_attempts,'successful',e.dribble_successes,'through_gameweek',11,'source_url','https://lineupstoday.com/super-lig/statistics/dribbles-attempted/','success_source_url','https://lineupstoday.com/super-lig/statistics/dribbles/','method','club player sums; provider-specific counts'),
'key_passes',jsonb_build_object('total',e.key_passes,'through_gameweek',11,'source_url','https://lineupstoday.com/super-lig/statistics/key-passes/','method','club player sums'),
'pressing',jsonb_build_object('season_reported_value',e.ppda_mh10,'season_reported_through_gameweek',10,'season_source_url','https://www.mavikocaeli.com.tr/kocaelispor-icin-oncelik-alan-savunmasi/258002/','season_report_date','2026-11-04','mh11_match_value',e.ppda_mh11,'mh11_source_url',case when e.ppda_mh11 is null then null when e.name in ('Alanyaspor','Kasımpaşa') then 'https://www.star.com.tr/spor/haftaya-damga-vurdu-besiktas-istatistiklerde-zirvede-haber-2052398/' else 'https://www.hedefhalk.com/samsunsporun-konyaspor-galibiyeti-rakamlara-yansidi-11-hafta-raporu/1835155' end,'method','reported PPDA; no raw numerator/denominator, not recomputed season MH11'))
from evidence e join public.scout_teams t on t.name=e.name join public.scout_team_season_stats s on s.team_id=t.id and s.through_gameweek=11 and s.matches_played=11
where p.team_id=t.id and p.through_gameweek=11 and coalesce((p.tactical_action_profile->>'through_gameweek')::int,0)<=11 and e.dribble_successes<=e.dribble_attempts
returning p.team_id
) select count(*) into n from updated;
if n<>18 then raise exception 'Expected 18 MH11 tactical action profiles, got %',n; end if;
end $$;
