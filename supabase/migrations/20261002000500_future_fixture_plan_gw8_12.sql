-- 2026-27 resmi TFF fikstüründen MH8-MH12 gelecek maçlarını planlama tablosuna yükle.
-- Kaynak: TFF, 7-16. haftaların programı (15.09.2026) ve canlı fikstür sayfaları.
create unique index if not exists fixtures_gameweek_teams_uq on public.fixtures(gameweek,home_team_id,away_team_id);

do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='fixtures' and policyname='fixtures_public_read') then
    create policy fixtures_public_read on public.fixtures for select to anon, authenticated using (true);
  end if;
end $$;
grant select on public.fixtures to anon, authenticated;

insert into public.fixtures(gameweek,home_team_id,away_team_id,match_date,is_finished) values
(8,8,12,'2026-10-16 20:00',false),(8,2,16,'2026-10-17 13:30',false),(8,5,7,'2026-10-17 16:00',false),(8,11,17,'2026-10-17 16:00',false),(8,6,14,'2026-10-17 19:00',false),(8,3,15,'2026-10-18 13:30',false),(8,4,10,'2026-10-18 16:00',false),(8,13,18,'2026-10-18 19:00',false),(8,1,9,'2026-10-19 20:00',false),
(9,14,4,'2026-10-23 20:00',false),(9,16,3,'2026-10-24 13:30',false),(9,18,2,'2026-10-24 16:00',false),(9,15,5,'2026-10-24 19:00',false),(9,7,11,'2026-10-25 16:00',false),(9,10,8,'2026-10-25 19:00',false),(9,12,1,'2026-10-26 19:00',false),(9,9,13,'2026-10-26 19:00',false),(9,17,6,'2026-10-26 21:30',false),
(10,7,17,'2026-10-30 20:00',false),(10,2,8,'2026-10-31 13:30',false),(10,4,12,'2026-10-31 16:00',false),(10,6,10,'2026-10-31 19:00',false),(10,5,16,'2026-11-01 13:30',false),(10,1,18,'2026-11-01 16:00',false),(10,13,15,'2026-11-01 16:00',false),(10,3,9,'2026-11-01 19:00',false),(10,11,14,'2026-11-02 20:00',false),
(11,18,3,'2026-11-06 20:00',false),(11,16,4,'2026-11-07 13:30',false),(11,15,7,'2026-11-07 16:00',false),(11,10,13,'2026-11-07 19:00',false),(11,17,5,'2026-11-07 19:00',false),(11,12,2,'2026-11-08 13:30',false),(11,8,6,'2026-11-08 16:00',false),(11,14,1,'2026-11-08 18:30',false),(11,9,11,'2026-11-08 21:00',false),
(12,11,18,'2026-11-21 13:30',false),(12,5,12,'2026-11-21 16:00',false),(12,17,15,'2026-11-21 16:00',false),(12,4,6,'2026-11-21 19:00',false),(12,2,10,'2026-11-22 13:30',false),(12,3,14,'2026-11-22 16:00',false),(12,7,9,'2026-11-22 16:00',false),(12,1,16,'2026-11-22 19:00',false),(12,13,8,'2026-11-23 20:00',false)
on conflict (gameweek,home_team_id,away_team_id) do update set match_date=excluded.match_date,is_finished=excluded.is_finished;
