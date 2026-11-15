-- Source-observed shot location totals. Do not treat shot location as attack origin.
-- Preserve existing model inputs and event/PPDA coverage.
create table if not exists public.scout_team_match_shot_zones (
 season text not null, match_id bigint not null, gameweek integer not null check (gameweek between 1 and 34),
 team_id bigint not null, opponent_team_id bigint not null,
 shots integer not null check (shots between 0 and 100),
 shots_inside_box integer not null check (shots_inside_box >= 0),
 shots_outside_box integer not null check (shots_outside_box >= 0),
 source_url text not null check (source_url like 'https://%'),
 source_observed_at timestamptz not null default now(),
 primary key(season,match_id,team_id),
 check (team_id <> opponent_team_id),
 check (shots_inside_box+shots_outside_box=shots)
);
alter table public.scout_team_match_shot_zones enable row level security;
revoke all on public.scout_team_match_shot_zones from public,anon,authenticated;
grant select,insert,update on public.scout_team_match_shot_zones to service_role;
alter table public.scout_team_tactical_profiles add column if not exists shot_zone_profile jsonb;
comment on column public.scout_team_tactical_profiles.shot_zone_profile is 'Source-specific shot-location counts and complete-match coverage; not attack channels or xG inputs.';
do $seed$
declare n integer;
begin
 with evidence(match_id,gameweek,home_name,away_name,home_goals,away_goals,played_on,hs,hi,as_,ai,source_url) as (values
(317784,1,'Gaziantep','Alanyaspor',1,1,'2026-08-15'::date,13,5,11,5,'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-alanyaspor-2026-08-15/stats'),
(317785,1,'Kasımpaşa','Trabzonspor',1,1,'2026-08-15'::date,9,5,13,8,'https://web-production-a0606.up.railway.app/match/kasimpasa-vs-trabzonspor-2026-08-15/stats'),
(317786,1,'Başakşehir','Kocaelispor',2,0,'2026-08-16'::date,17,9,8,3,'https://web-production-a0606.up.railway.app/match/basaksehir-vs-kocaelispor-2026-08-16/stats'),
(317787,1,'Amed','Erzurumspor',3,0,'2026-08-16'::date,13,7,5,2,'https://web-production-a0606.up.railway.app/match/amed-vs-erzurumspor-fk-2026-08-16/stats'),
(317788,1,'Gençlerbirliği','Fenerbahçe',2,1,'2026-08-15'::date,10,4,27,20,'https://www.flashscore.co.uk/match/football/fenerbahce-MsbmracL/genclerbirligi-GOPqBIRK/summary/stats/?mid=jyTYd7Mk'),
(317789,1,'Konyaspor','Rizespor',0,1,'2026-08-15'::date,7,6,14,10,'https://web-production-a0606.up.railway.app/match/konyaspor-vs-rizespor-2026-08-15/stats'),
(317790,1,'Galatasaray','Çorum FK',2,2,'2026-08-14'::date,38,22,8,3,'https://web-production-a0606.up.railway.app/match/galatasaray-vs-corum-fk-2026-08-14/stats'),
(317791,1,'Beşiktaş','Eyüpspor',1,0,'2026-08-16'::date,19,7,4,0,'https://web-production-a0606.up.railway.app/match/besiktas-vs-eyupspor-2026-08-16/stats'),
(317792,1,'Samsunspor','Göztepe',3,3,'2026-08-17'::date,21,14,20,14,'https://web-production-a0606.up.railway.app/match/samsunspor-vs-goztepe-2026-08-17/stats'),
(317793,2,'Trabzonspor','Başakşehir',2,1,'2026-08-23'::date,19,13,12,8,'https://web-production-a0606.up.railway.app/match/trabzonspor-vs-basaksehir-2026-08-23/stats'),
(317794,2,'Eyüpspor','Gaziantep',0,1,'2026-08-23'::date,12,7,9,6,'https://web-production-a0606.up.railway.app/match/eyupspor-vs-gaziantep-fk-2026-08-23/stats'),
(317795,2,'Alanyaspor','Beşiktaş',1,0,'2026-08-23'::date,9,6,14,8,'https://web-production-a0606.up.railway.app/match/alanyaspor-vs-besiktas-2026-08-23/stats'),
(317796,2,'Rizespor','Samsunspor',0,2,'2026-08-22'::date,28,12,6,3,'https://web-production-a0606.up.railway.app/match/rizespor-vs-samsunspor-2026-08-22/stats'),
(317797,2,'Göztepe','Gençlerbirliği',0,1,'2026-08-23'::date,16,13,10,8,'https://web-production-a0606.up.railway.app/match/goztepe-vs-genclerbirligi-s-k-2026-08-23/stats'),
(317798,2,'Çorum FK','Kasımpaşa',0,1,'2026-08-22'::date,16,10,6,3,'https://web-production-a0606.up.railway.app/match/corum-fk-vs-kasimpasa-2026-08-22/stats'),
(317799,2,'Fenerbahçe','Konyaspor',4,2,'2026-08-22'::date,20,17,17,11,'https://web-production-a0606.up.railway.app/match/fenerbahce-vs-konyaspor-2026-08-22/stats'),
(317800,2,'Kocaelispor','Amed',2,0,'2026-08-24'::date,11,7,12,6,'https://web-production-a0606.up.railway.app/match/kocaelispor-vs-amed-2026-08-24/stats'),
(317801,2,'Erzurumspor','Galatasaray',0,4,'2026-08-21'::date,12,7,10,9,'https://web-production-a0606.up.railway.app/match/erzurumspor-fk-vs-galatasaray-2026-08-21/stats'),
(317802,3,'Gaziantep','Rizespor',1,2,'2026-08-29'::date,16,10,10,5,'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-rizespor-2026-08-29/stats'),
(317803,3,'Eyüpspor','Alanyaspor',2,1,'2026-08-30'::date,11,6,7,4,'https://web-production-a0606.up.railway.app/match/eyupspor-vs-alanyaspor-2026-08-30/stats'),
(317804,3,'Başakşehir','Kasımpaşa',1,1,'2026-08-30'::date,12,4,12,5,'https://web-production-a0606.up.railway.app/match/basaksehir-vs-kasimpasa-2026-08-30/stats'),
(317805,3,'Amed','Trabzonspor',2,1,'2026-08-31'::date,17,12,8,7,'https://web-production-a0606.up.railway.app/match/amed-vs-trabzonspor-2026-08-31/stats'),
(317806,3,'Gençlerbirliği','Erzurumspor',1,1,'2026-08-28'::date,16,7,9,6,'https://flashsportapp.com/en/football/match/genclerbirligi-s-k-erzurumspor-fk-2026-08-28-1584391/'),
(317807,3,'Konyaspor','Kocaelispor',1,2,'2026-08-29'::date,10,5,15,5,'https://web-production-a0606.up.railway.app/match/konyaspor-vs-kocaelispor-2026-08-29/stats'),
(317808,3,'Galatasaray','Göztepe',3,2,'2026-08-29'::date,34,27,9,7,'https://web-production-a0606.up.railway.app/match/galatasaray-vs-goztepe-2026-08-29/stats'),
(317809,3,'Beşiktaş','Çorum FK',6,2,'2026-08-31'::date,18,15,11,3,'https://web-production-a0606.up.railway.app/match/besiktas-vs-corum-fk-2026-08-31/stats'),
(317810,3,'Samsunspor','Fenerbahçe',0,2,'2026-08-30'::date,6,3,15,13,'https://web-production-a0606.up.railway.app/match/samsunspor-vs-fenerbahce-2026-08-30/stats'),
(317811,4,'Trabzonspor','Gençlerbirliği',5,0,'2026-09-06'::date,23,17,14,8,'https://web-production-a0606.up.railway.app/match/trabzonspor-vs-genclerbirligi-s-k-2026-09-06/stats'),
(317812,4,'Kasımpaşa','Amed',2,2,'2026-09-06'::date,14,8,14,6,'https://web-production-a0606.up.railway.app/match/kasimpasa-vs-amed-2026-09-06/stats'),
(317813,4,'Başakşehir','Galatasaray',2,3,'2026-09-04'::date,12,9,13,7,'https://web-production-a0606.up.railway.app/match/basaksehir-vs-galatasaray-2026-09-04/stats'),
(317814,4,'Rizespor','Alanyaspor',0,1,'2026-09-07'::date,21,8,9,6,'https://web-production-a0606.up.railway.app/match/rizespor-vs-alanyaspor-2026-09-07/stats'),
(317815,4,'Göztepe','Gaziantep',2,4,'2026-09-07'::date,19,16,13,7,'https://web-production-a0606.up.railway.app/match/goztepe-vs-gaziantep-fk-2026-09-07/stats'),
(317816,4,'Çorum FK','Eyüpspor',3,0,'2026-09-06'::date,19,12,8,7,'https://web-production-a0606.up.railway.app/match/corum-fk-vs-eyupspor-2026-09-06/stats'),
(317817,4,'Fenerbahçe','Beşiktaş',1,2,'2026-09-05'::date,9,3,14,9,'https://web-production-a0606.up.railway.app/match/fenerbahce-vs-besiktas-2026-09-05/stats'),
(317818,4,'Kocaelispor','Samsunspor',1,0,'2026-09-06'::date,9,4,20,14,'https://web-production-a0606.up.railway.app/match/kocaelispor-vs-samsunspor-2026-09-06/stats'),
(317819,4,'Erzurumspor','Konyaspor',1,0,'2026-09-05'::date,12,9,14,11,'https://www.ludistat.com/games/erzurumspor-fk-vs-konyaspor-2026-09-05'),
(317820,5,'Gaziantep','Fenerbahçe',0,0,'2026-09-14'::date,11,5,15,11,'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-fenerbahce-2026-09-14/stats'),
(317821,5,'Eyüpspor','Rizespor',0,2,'2026-09-12'::date,26,13,9,6,'https://web-production-a0606.up.railway.app/match/eyupspor-vs-rizespor-2026-09-12/stats'),
(317822,5,'Alanyaspor','Göztepe',2,2,'2026-09-12'::date,20,16,14,10,'https://web-production-a0606.up.railway.app/match/alanyaspor-vs-goztepe-2026-09-12/stats'),
(317823,5,'Amed','Başakşehir',5,0,'2026-09-13'::date,22,14,7,3,'https://web-production-a0606.up.railway.app/match/amed-vs-basaksehir-2026-09-13/stats'),
(317824,5,'Gençlerbirliği','Kasımpaşa',1,2,'2026-09-13'::date,15,12,16,9,'https://web-production-a0606.up.railway.app/match/genclerbirligi-s-k-vs-kasimpasa-2026-09-13/stats'),
(317825,5,'Konyaspor','Trabzonspor',1,0,'2026-09-12'::date,11,7,15,7,'https://web-production-a0606.up.railway.app/match/konyaspor-vs-trabzonspor-2026-09-12/stats'),
(317826,5,'Galatasaray','Kocaelispor',1,0,'2026-09-13'::date,28,19,12,10,'https://web-production-a0606.up.railway.app/match/galatasaray-vs-kocaelispor-2026-09-13/stats'),
(317827,5,'Beşiktaş','Erzurumspor',3,0,'2026-09-11'::date,21,16,8,4,'https://web-production-a0606.up.railway.app/match/besiktas-vs-erzurumspor-fk-2026-09-11/stats'),
(317828,5,'Samsunspor','Çorum FK',1,5,'2026-09-12'::date,18,11,12,6,'https://web-production-a0606.up.railway.app/match/samsunspor-vs-corum-fk-2026-09-12/stats'),
(317829,6,'Trabzonspor','Galatasaray',4,0,'2026-09-19'::date,7,7,13,8,'https://web-production-a0606.up.railway.app/match/trabzonspor-vs-galatasaray-2026-09-19/stats'),
(317830,6,'Kasımpaşa','Konyaspor',0,0,'2026-09-18'::date,14,9,11,8,'https://web-production-a0606.up.railway.app/match/kasimpasa-vs-konyaspor-2026-09-18/stats'),
(317831,6,'Başakşehir','Gençlerbirliği',4,0,'2026-09-19'::date,18,12,7,3,'https://web-production-a0606.up.railway.app/match/basaksehir-vs-genclerbirligi-s-k-2026-09-19/stats'),
(317832,6,'Amed','Beşiktaş',3,2,'2026-09-20'::date,10,4,21,10,'https://web-production-a0606.up.railway.app/match/amed-vs-besiktas-2026-09-20/stats'),
(317833,6,'Göztepe','Rizespor',2,2,'2026-09-20'::date,25,18,11,6,'https://web-production-a0606.up.railway.app/match/goztepe-vs-rizespor-2026-09-20/stats'),
(317834,6,'Çorum FK','Alanyaspor',1,2,'2026-09-19'::date,12,7,9,6,'https://web-production-a0606.up.railway.app/match/corum-fk-vs-alanyaspor-2026-09-19/stats'),
(317835,6,'Fenerbahçe','Eyüpspor',8,0,'2026-09-20'::date,24,19,17,7,'https://web-production-a0606.up.railway.app/match/fenerbahce-vs-eyupspor-2026-09-20/stats'),
(317836,6,'Kocaelispor','Gaziantep',2,0,'2026-09-19'::date,19,12,16,10,'https://web-production-a0606.up.railway.app/match/kocaelispor-vs-gaziantep-fk-2026-09-19/stats'),
(317837,6,'Erzurumspor','Samsunspor',1,0,'2026-09-20'::date,8,6,8,2,'https://footycheck.com/football/match/erzurumspor-fk-vs-samsunspor-2026-09-20/1584415/'),
(317838,7,'Gaziantep','Çorum FK',0,3,'2026-10-11'::date,12,7,13,11,'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-corum-fk-2026-10-11/stats'),
(317839,7,'Eyüpspor','Göztepe',0,4,'2026-10-12'::date,7,4,19,14,'https://web-production-a0606.up.railway.app/match/eyupspor-vs-goztepe-2026-10-12/stats'),
(317840,7,'Alanyaspor','Erzurumspor',0,0,'2026-10-10'::date,15,11,15,13,'https://web-production-a0606.up.railway.app/match/alanyaspor-vs-erzurumspor-fk-2026-10-10/stats'),
(317841,7,'Rizespor','Fenerbahçe',0,3,'2026-10-10'::date,19,11,13,10,'https://web-production-a0606.up.railway.app/match/rizespor-vs-fenerbahce-2026-10-10/stats'),
(317842,7,'Gençlerbirliği','Amed',2,2,'2026-10-10'::date,11,5,19,9,'https://www.flashscore.com.ng/match/football/amedspor-EHdgkFvm/genclerbirligi-GOPqBIRK/summary/stats/?mid=Uesnn8sK'),
(317843,7,'Konyaspor','Başakşehir',0,0,'2026-10-11'::date,9,4,7,3,'https://xg-edge.com/super-lig/konyaspor-vs-basaksehir-fk-2026-10-11'),
(317844,7,'Galatasaray','Kasımpaşa',3,1,'2026-10-09'::date,25,19,9,3,'https://web-production-a0606.up.railway.app/match/galatasaray-vs-kasimpasa-2026-10-09/stats'),
(317845,7,'Beşiktaş','Kocaelispor',2,1,'2026-10-11'::date,16,9,11,7,'https://web-production-a0606.up.railway.app/match/besiktas-vs-kocaelispor-2026-10-11/stats'),
(317846,7,'Samsunspor','Trabzonspor',0,3,'2026-10-10'::date,23,11,13,10,'https://web-production-a0606.up.railway.app/match/samsunspor-vs-trabzonspor-2026-10-10/stats'),
(317847,8,'Çorum FK','Rizespor',2,1,'2026-10-16'::date,10,6,15,8,'https://web-production-a0606.up.railway.app/match/corum-fk-vs-rizespor-2026-10-16/stats'),
(317848,8,'Erzurumspor','Eyüpspor',2,0,'2026-10-17'::date,7,3,8,4,'https://flashsportapp.com/en/football/match/erzurumspor-fk-eyupspor-2026-10-17-1584433/'),
(317849,8,'Amed','Konyaspor',1,0,'2026-10-17'::date,13,8,4,2,'https://web-production-a0606.up.railway.app/match/amed-vs-konyaspor-2026-10-17/stats'),
(317850,8,'Gençlerbirliği','Galatasaray',0,1,'2026-10-17'::date,19,15,18,12,'https://web-production-a0606.up.railway.app/match/genclerbirligi-s-k-vs-galatasaray-2026-10-17/stats'),
(317851,8,'Fenerbahçe','Alanyaspor',3,0,'2026-10-17'::date,24,15,13,4,'https://web-production-a0606.up.railway.app/match/fenerbahce-vs-alanyaspor-2026-10-17/stats'),
(317852,8,'Kasımpaşa','Samsunspor',4,1,'2026-10-18'::date,23,15,12,7,'https://web-production-a0606.up.railway.app/match/kasimpasa-vs-samsunspor-2026-10-18/stats'),
(317853,8,'Kocaelispor','Göztepe',1,2,'2026-10-18'::date,13,7,8,4,'https://web-production-a0606.up.railway.app/match/kocaelispor-vs-goztepe-2026-10-18/stats'),
(317854,8,'Başakşehir','Gaziantep',2,1,'2026-10-18'::date,14,10,12,8,'https://web-production-a0606.up.railway.app/match/basaksehir-vs-gaziantep-fk-2026-10-18/stats'),
(317855,8,'Trabzonspor','Beşiktaş',2,0,'2026-10-19'::date,13,11,19,10,'https://web-production-a0606.up.railway.app/match/trabzonspor-vs-besiktas-2026-10-19/stats'),
(317856,9,'Gaziantep','Erzurumspor',1,3,'2026-10-24'::date,19,12,8,4,'https://web-production-a0606.up.railway.app/match/gaziantep-fk-vs-erzurumspor-fk-2026-10-24/stats'),
(317857,9,'Eyüpspor','Kasımpaşa',0,1,'2026-10-24'::date,11,6,10,4,'https://web-production-a0606.up.railway.app/match/eyupspor-vs-kasimpasa-2026-10-24/stats'),
(317858,9,'Alanyaspor','Kocaelispor',1,2,'2026-10-23'::date,7,4,17,11,'https://web-production-a0606.up.railway.app/match/alanyaspor-vs-kocaelispor-2026-10-23/stats'),
(317859,9,'Rizespor','Trabzonspor',3,4,'2026-10-26'::date,9,6,14,13,'https://web-production-a0606.up.railway.app/match/rizespor-vs-trabzonspor-2026-10-26/stats'),
(317860,9,'Göztepe','Çorum FK',2,0,'2026-10-25'::date,15,10,11,4,'https://web-production-a0606.up.railway.app/match/goztepe-vs-corum-fk-2026-10-25/stats'),
(317861,9,'Konyaspor','Gençlerbirliği',2,0,'2026-10-25'::date,16,15,6,3,'https://web-production-a0606.up.railway.app/match/konyaspor-vs-genclerbirligi-s-k-2026-10-25/stats'),
(317862,9,'Galatasaray','Fenerbahçe',2,1,'2026-10-26'::date,23,15,4,3,'https://web-production-a0606.up.railway.app/match/galatasaray-vs-fenerbahce-2026-10-26/stats'),
(317863,9,'Beşiktaş','Başakşehir',2,0,'2026-10-26'::date,17,13,9,5,'https://web-production-a0606.up.railway.app/match/besiktas-vs-basaksehir-2026-10-26/stats'),
(317864,9,'Samsunspor','Amed',1,2,'2026-10-24'::date,6,4,21,9,'https://web-production-a0606.up.railway.app/match/samsunspor-vs-amed-2026-10-24/stats'),
(317865,10,'Trabzonspor','Gaziantep',2,0,'2026-11-01'::date,18,10,13,7,'https://www.ludistat.com/games/trabzonspor-vs-gaziantep-fk-2026-11-01'),
(317866,10,'Kasımpaşa','Beşiktaş',2,2,'2026-11-01'::date,16,10,8,7,'https://web-production-a0606.up.railway.app/match/kasimpasa-vs-besiktas-2026-11-01/stats'),
(317867,10,'Başakşehir','Samsunspor',5,2,'2026-11-01'::date,24,14,9,5,'https://www.shotifystats.com/match/basaksehir-vs-samsunspor-2026-11-01/shots'),
(317868,10,'Amed','Eyüpspor',5,1,'2026-11-01'::date,20,15,8,4,'https://www.shotifystats.com/match/amed-sportif-vs-eyupspor-2026-11-01/shots'),
(317869,10,'Gençlerbirliği','Alanyaspor',5,0,'2026-11-02'::date,12,9,9,5,'https://www.shotifystats.com/match/genclerbirligi-vs-alanyaspor-2026-11-02/shots'),
(317870,10,'Konyaspor','Galatasaray',0,4,'2026-10-30'::date,9,4,16,12,'https://www.shotifystats.com/match/konyaspor-vs-galatasaray-2026-10-30/shots'),
(317871,10,'Fenerbahçe','Göztepe',1,2,'2026-10-31'::date,18,12,12,9,'https://www.shotifystats.com/match/fenerbahce-vs-goztepe-2026-10-31/shots'),
(317872,10,'Kocaelispor','Rizespor',0,0,'2026-10-31'::date,14,4,17,11,'https://web-production-a0606.up.railway.app/match/kocaelispor-vs-rizespor-2026-10-31/stats'),
(317873,10,'Erzurumspor','Çorum FK',1,3,'2026-10-31'::date,13,9,7,5,'https://www.shotifystats.com/match/erzurumspor-fk-vs-corum-fk-2026-10-31/shots'),
(317874,11,'Gaziantep','Kasımpaşa',0,2,'2026-11-06'::date,16,11,11,8,'https://www.shotifystats.com/match/gaziantep-fk-vs-kasimpasa-2026-11-06/shots'),
(317875,11,'Eyüpspor','Kocaelispor',0,2,'2026-11-07'::date,6,6,12,3,'https://www.shotifystats.com/match/eyupspor-vs-kocaelispor-2026-11-07/shots'),
(317876,11,'Samsunspor','Konyaspor',1,0,'2026-11-07'::date,6,3,7,6,'https://www.shotifystats.com/match/samsunspor-vs-konyaspor-2026-11-07/shots'),
(317877,11,'Göztepe','Başakşehir',1,2,'2026-11-07'::date,19,12,15,12,'https://www.shotifystats.com/match/goztepe-vs-basaksehir-2026-11-07/shots'),
(317878,11,'Galatasaray','Amed',4,3,'2026-11-07'::date,17,9,14,10,'https://www.ludistat.com/games/galatasaray-vs-amed-2026-11-07'),
(317879,11,'Rizespor','Erzurumspor',2,1,'2026-11-08'::date,24,17,9,9,'https://www.shotifystats.com/match/rizespor-vs-erzurumspor-fk-2026-11-08/shots'),
(317880,11,'Çorum FK','Fenerbahçe',0,5,'2026-11-08'::date,22,14,10,5,'https://www.shotifystats.com/match/corum-fk-vs-fenerbahce-2026-11-08/shots'),
(317881,11,'Alanyaspor','Trabzonspor',0,2,'2026-11-08'::date,14,13,21,16,'https://www.shotifystats.com/match/alanyaspor-vs-trabzonspor-2026-11-08/shots'),
(317882,11,'Beşiktaş','Gençlerbirliği',3,0,'2026-11-08'::date,20,13,3,1,'https://www.shotifystats.com/match/besiktas-vs-genclerbirligi-2026-11-08/shots')
 ), matched as (
 select e.*,h.home_team_id,h.away_team_id from evidence e
 join public.scout_match_history h on h.season='2026-27' and h.match_id=e.match_id and h.gameweek=e.gameweek
 and h.home_team_name=e.home_name and h.away_team_name=e.away_name
 and h.home_goals=e.home_goals and h.away_goals=e.away_goals
 and (h.kickoff_at at time zone 'Europe/Istanbul')::date=e.played_on and h.match_status='Bitti'
 ), written as (
 insert into public.scout_team_match_shot_zones(season,match_id,gameweek,team_id,opponent_team_id,shots,shots_inside_box,shots_outside_box,source_url)
 select '2026-27',m.match_id,m.gameweek,v.team_id,v.opponent_team_id,v.shots,v.inside,v.shots-v.inside,m.source_url
 from matched m cross join lateral (values(m.home_team_id,m.away_team_id,m.hs,m.hi),(m.away_team_id,m.home_team_id,m.as_,m.ai)) v(team_id,opponent_team_id,shots,inside)
 on conflict(season,match_id,team_id) do update set
 shots=excluded.shots,shots_inside_box=excluded.shots_inside_box,shots_outside_box=excluded.shots_outside_box,
 opponent_team_id=excluded.opponent_team_id,gameweek=excluded.gameweek,source_url=excluded.source_url,source_observed_at=excluded.source_observed_at
 returning 1
 ) select count(*) into n from written;
 if n<>198 then raise exception 'Expected 198 matched team-game rows, got %',n; end if;
end $seed$;
-- Reusable complete-coverage refresh. Call after a full new matchweek's source rows are verified.
create or replace function public.scout_refresh_team_shot_zone_profiles(p_season text,p_week integer)
returns integer language plpgsql security invoker set search_path='' as $fn$
declare n integer;
begin
 if p_week is null or p_week<1 or p_week>34 then raise exception 'invalid week'; end if;
 with completed as (
 select h.match_id,h.gameweek,v.team_id,v.opponent_team_id
 from public.scout_match_history h cross join lateral(values(h.home_team_id,h.away_team_id),(h.away_team_id,h.home_team_id)) v(team_id,opponent_team_id)
 where h.season=p_season and h.gameweek between 1 and p_week and h.match_status='Bitti'
 ), expected as (select team_id,count(*) n,min(gameweek) lo,max(gameweek) hi from completed group by team_id),
 pairs as (
 select c.*,z.shots,z.shots_inside_box,z.shots_outside_box,z.source_url,z.source_observed_at,
 o.shots opp_shots,o.shots_inside_box opp_inside,o.shots_outside_box opp_outside,
 a.shots verified_shots
 from completed c join public.scout_team_match_shot_zones z on z.season=p_season and z.match_id=c.match_id and z.gameweek=c.gameweek and z.team_id=c.team_id and z.opponent_team_id=c.opponent_team_id
 join public.scout_team_match_shot_zones o on o.season=z.season and o.match_id=z.match_id and o.gameweek=z.gameweek and o.team_id=z.opponent_team_id and o.opponent_team_id=z.team_id and o.source_url=z.source_url
 left join public.scout_verified_team_match_advanced a on a.season=z.season and a.match_id=z.match_id and a.team_id=z.team_id
 ), aggregated as (
 select team_id,count(*) n,min(gameweek) lo,max(gameweek) hi,
 sum(shots) shots,sum(shots_inside_box) inside,sum(shots_outside_box) outside,
 sum(opp_shots) opp_shots,sum(opp_inside) opp_inside,sum(opp_outside) opp_outside,
 count(*) filter(where gameweek>=greatest(1,p_week-3)) recent_n,
 sum(shots) filter(where gameweek>=greatest(1,p_week-3)) recent_shots,
 sum(shots_inside_box) filter(where gameweek>=greatest(1,p_week-3)) recent_inside,
 sum(opp_shots) filter(where gameweek>=greatest(1,p_week-3)) recent_opp_shots,
 sum(opp_inside) filter(where gameweek>=greatest(1,p_week-3)) recent_opp_inside,
 count(*) filter(where verified_shots is not null) comparison_n,
 count(*) filter(where verified_shots is not null and verified_shots<>shots) mismatch_n,
 max(source_observed_at) observed_at
 from pairs group by team_id
 )
 update public.scout_team_tactical_profiles t set shot_zone_profile=jsonb_build_object(
 'through_gameweek',a.hi,'first_gameweek',a.lo,'matches',a.n,'shots',a.shots,'inside',a.inside,'outside',a.outside,
 'opponent_shots',a.opp_shots,'opponent_inside',a.opp_inside,'opponent_outside',a.opp_outside,
 'recent_first_gameweek',greatest(1,p_week-3),'recent_matches',a.recent_n,'recent_shots',a.recent_shots,'recent_inside',a.recent_inside,
 'recent_opponent_shots',a.recent_opp_shots,'recent_opponent_inside',a.recent_opp_inside,
 'compared_matches',a.comparison_n,'shot_total_mismatches',a.mismatch_n,'source','match-level observed shot zones; separate provider totals','source_observed_at',a.observed_at)
 from aggregated a join expected e using(team_id)
 where t.season=p_season and t.team_id=a.team_id and a.n=e.n and a.lo=1 and a.hi=p_week and e.lo=1 and e.hi=p_week and a.n>=p_week
 and coalesce((t.shot_zone_profile->>'through_gameweek')::integer,0)<=p_week;
 get diagnostics n=row_count;
 return n;
end $fn$;
revoke all on function public.scout_refresh_team_shot_zone_profiles(text,integer) from public,anon,authenticated;
grant execute on function public.scout_refresh_team_shot_zone_profiles(text,integer) to service_role;
do $refresh$ begin
 if public.scout_refresh_team_shot_zone_profiles('2026-27',11)<>18 then raise exception 'Expected 18 complete profiles'; end if;
end $refresh$;
-- Refresh only rates with independently current season numerators and denominators.
-- PPDA, crossing, take-on and event-derived goal/channel fields are not overwritten.
update public.scout_team_tactical_profiles t set
 possession_avg=t.possession_percentage,
 touches_in_box_per_match=t.touches_in_opposition_box::numeric/nullif(s.matches_played,0),
 big_chances_missed_per_match=t.big_chances_missed::numeric/nullif(s.matches_played,0),
 xg_per_shot=s.xg_total/nullif(s.shots,0),
 set_piece_xg_per_match=t.set_piece_xg/nullif(s.matches_played,0),
 set_piece_xg_share=t.set_piece_xg/nullif(s.xg_total,0),
 opponent_set_piece_xg_per_match=t.set_piece_xga/nullif(s.matches_played,0),
 opponent_set_piece_xg_share=t.set_piece_xga/nullif(s.xga_total,0)
 from public.scout_team_season_stats s where t.season='2026-27' and t.team_id=s.team_id and t.aggregate_through_gameweek=11 and s.through_gameweek=11 and s.matches_played=11 and s.advanced_matches=11;
