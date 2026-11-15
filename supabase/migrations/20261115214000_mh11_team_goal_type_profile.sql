-- Published mutually exclusive goal types; no inference of header location or attack origin.
-- Source All90, based on FotMob events and reconciled against TFF/ESPN, through 8 Nov 2026.
alter table public.scout_team_tactical_profiles add column if not exists goal_type_profile jsonb;
comment on column public.scout_team_tactical_profiles.goal_type_profile is 'Observed season goal-type counts; inside/outside categories exclude headers and penalties; not exact spatial or attack-origin data.';
do $$
declare n integer;
begin
 with evidence(name,goals,penalties,headers,inside_non_header, outside_non_header,opponent_own_goals) as (values
('Fenerbahçe',29,1,1,20,7,0),
('Amed',28,3,2,14,8,1),
('Galatasaray',27,2,5,12,6,2),
('Trabzonspor',26,1,1,23,1,0),
('Beşiktaş',23,3,2,15,2,1),
('Göztepe',22,5,2,13,1,1),
('Çorum FK',21,1,2,12,6,0),
('Başakşehir',19,3,3,9,3,1),
('Kasımpaşa',17,2,4,9,2,0),
('Rizespor',13,1,1,10,1,0),
('Kocaelispor',13,1,2,8,2,0),
('Gençlerbirliği',12,0,3,5,4,0),
('Samsunspor',11,1,0,6,4,0),
('Erzurumspor',10,0,4,6,0,0),
('Alanyaspor',9,0,3,5,0,1),
('Gaziantep',9,0,2,4,1,2),
('Konyaspor',6,0,1,4,0,1),
('Eyüpspor',3,0,1,1,1,0)
 ), verified as (
 select e.*,t.id from evidence e join public.scout_teams t on t.name=e.name and t.active
 join public.scout_team_season_stats s on s.team_id=t.id and s.through_gameweek=11 and s.matches_played=11 and s.goals_for=e.goals
 where e.goals=e.penalties+e.headers+e.inside_non_header+e.outside_non_header+e.opponent_own_goals
 ), written as (
 update public.scout_team_tactical_profiles p set goal_type_profile=jsonb_build_object(
 'through_gameweek',11,'matches',11,'goals',v.goals,'penalties',v.penalties,'headers',v.headers,
 'inside_non_header',v.inside_non_header,'outside_non_header',v.outside_non_header,'opponent_own_goals',v.opponent_own_goals,
 'source_url','https://all90.net/en/top-scorers/','source_method','FotMob events reconciled with TFF and ESPN; mutually exclusive goal categories',
 'last_match_date','2026-11-08','observed_at',now())
 from verified v where p.season='2026-27' and p.team_id=v.id and p.through_gameweek=11
 and coalesce((p.goal_type_profile->>'through_gameweek')::int,0)<=11
 returning v.goals
 ) select count(*) into n from written;
 if n<>18 then raise exception 'Expected 18 fully reconciled goal-type profiles, got %',n; end if;
end $$;
