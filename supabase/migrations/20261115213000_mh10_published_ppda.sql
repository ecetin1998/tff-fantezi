-- Published PPDA snapshot after MH10; no reconstruction from total passes or
-- unlocated defensive actions. MH11 weekly readings for two teams are separate.
do $press$
declare n integer;
begin
 with evidence(name,ppda) as (values
 ('Beşiktaş',9.6),
 ('Galatasaray',9.7),
 ('Göztepe',10.2),
 ('Rizespor',10.8),
 ('Fenerbahçe',11.3),
 ('Kasımpaşa',11.9),
 ('Trabzonspor',12.1),
 ('Samsunspor',12.2),
 ('Çorum FK',12.9),
 ('Başakşehir',13),
 ('Kocaelispor',13),
 ('Konyaspor',13),
 ('Gaziantep',13.3),
 ('Amed',13.5),
 ('Gençlerbirliği',14),
 ('Alanyaspor',16.8),
 ('Eyüpspor',16.8),
 ('Erzurumspor',16.9)
 )
 update public.scout_team_tactical_profiles t set source_action_profile=
 coalesce(t.source_action_profile,'{}'::jsonb)||jsonb_build_object(
 'ppda_published',e.ppda,'ppda_through_gameweek',10,
 'ppda_as_of','2026-11-04','ppda_source','https://www.mavikocaeli.com.tr/kocaelispor-icin-oncelik-alan-savunmasi/258002/')
 from evidence e join public.scout_teams st on st.name=e.name
 where t.team_id=st.id and t.season='2026-27'
 and coalesce((t.source_action_profile->>'ppda_through_gameweek')::integer,0)<=10;
 get diagnostics n=row_count;
 if n<>18 then raise exception 'Expected 18 PPDA snapshots, got %',n; end if;
 update public.scout_team_tactical_profiles t set source_action_profile=
 coalesce(t.source_action_profile,'{}'::jsonb)||jsonb_build_object(
 'ppda_latest_match',8,'ppda_latest_match_gameweek',11,
 'ppda_latest_match_source','https://www.fotomac.com.tr/besiktas/2026/11/11/pres-makinesi-kartal')
 from public.scout_teams st where t.team_id=st.id and t.season='2026-27'
 and st.name in ('Beşiktaş','Galatasaray')
 and coalesce((t.source_action_profile->>'ppda_latest_match_gameweek')::integer,0)<=11;
 get diagnostics n=row_count;
 if n<>2 then raise exception 'Expected two MH11 PPDA observations, got %',n; end if;
end $press$;
