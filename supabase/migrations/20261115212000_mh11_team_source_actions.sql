-- Season-level published tactical actions, distinct from event-level coverage.
alter table public.scout_team_tactical_profiles add column if not exists source_action_profile jsonb;
do $seed$
declare n integer;
begin
 with evidence(name,accurate_crosses,cross_success_pct,dribble_attempts,opponent_dribble_attempts) as (values
 ('Alanyaspor',4.6,27,10.6,12.1),
 ('Amed',2.8,19.5,14.6,14.3),
 ('Başakşehir',4.5,25,10.4,10.2),
 ('Beşiktaş',3.6,19,15.3,12.6),
 ('Çorum FK',3.7,22.5,12.8,16.4),
 ('Erzurumspor',4.7,27.7,11.1,15.4),
 ('Eyüpspor',3.5,21.2,15.6,11.9),
 ('Fenerbahçe',4.6,24.9,12.6,15.7),
 ('Galatasaray',6,26.4,16.1,13.7),
 ('Gaziantep',4.9,25.6,13.9,14.2),
 ('Gençlerbirliği',2.9,20.1,10.8,14.4),
 ('Göztepe',6.6,31.3,19.4,10.6),
 ('Kasımpaşa',2.5,21.3,13.9,18.2),
 ('Kocaelispor',3.6,22.5,12,14.6),
 ('Konyaspor',4.6,29.5,12.4,12.2),
 ('Rizespor',6.1,30.5,19.6,16.9),
 ('Samsunspor',4.5,27.6,11.6,14.1),
 ('Trabzonspor',4.4,27.4,18,13.3)
 )
 update public.scout_team_tactical_profiles t set source_action_profile=jsonb_build_object(
 'through_gameweek',11,'matches',11,
 'accurate_crosses_per_match',e.accurate_crosses,'cross_success_rate',e.cross_success_pct/100,
 'dribbles_attempted_per_match',e.dribble_attempts,'opponent_dribbles_attempted_per_match',e.opponent_dribble_attempts,
 'cross_source','https://www.fotmob.com/leagues/71/stats/season/1000000512/teams/accurate_cross_team/team/8695/fenerbahce',
 'dribble_source','https://statz.ai/team/amed-sk/dribble-attempts',
 'source_observed_at',now(),'precision','published rounded averages; no exact totals inferred')
 from evidence e join public.scout_teams st on st.name=e.name
 join public.scout_team_season_stats s on s.team_id=st.id and s.through_gameweek=11 and s.matches_played=11
 where t.team_id=st.id and t.season='2026-27'
 and coalesce((t.source_action_profile->>'through_gameweek')::integer,0)<=11;
 get diagnostics n=row_count;
 if n<>18 then raise exception 'Expected 18 source action profiles, got %',n; end if;
end $seed$;
