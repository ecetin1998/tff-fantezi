-- Official competitive matches outside the Süper Lig inform fitness and
-- expected minutes only. NEVER include them in Fantasy points or league xG/xA.
create table if not exists public.scout_official_external_appearances (
  id bigint generated always as identity primary key,
  match_ref text not null,
  player_id bigint not null references public.scout_players(id),
  team_id integer not null references public.scout_teams(id),
  competition text not null check (competition in
    ('UEFA_CL','UEFA_EL','UEFA_ECL','TFF_CUP','NATIONAL_TEAM','OTHER_OFFICIAL')),
  finished_at timestamptz not null,
  squad_status text not null check (squad_status in ('started','substitute','unused')),
  started boolean not null,
  minutes numeric(5,1) not null check (minutes>=0 and minutes<=120),
  source_url text not null check (source_url like 'https://%'),
  source_updated_at timestamptz not null default now(),
  unique (match_ref, player_id),
  constraint official_status_consistent check (
    (squad_status='started' and started=true and minutes>0)
    or (squad_status='substitute' and started=false and minutes>0)
    or (squad_status='unused' and started=false and minutes=0)
  )
);
create index if not exists scout_external_appearances_recent_idx
  on public.scout_official_external_appearances (team_id,finished_at desc);
create index if not exists scout_external_appearances_player_recent_idx
  on public.scout_official_external_appearances (player_id,finished_at desc);
alter table public.scout_official_external_appearances enable row level security;
revoke all on public.scout_official_external_appearances from anon, authenticated;
grant select, insert, update on public.scout_official_external_appearances to service_role;
grant usage, select on sequence public.scout_official_external_appearances_id_seq to service_role;

-- 13 October UEFA Champions League: Galatasaray 1–4 Barcelona.
-- Full-time lineup/substitutions from UEFA official press kit, plus
-- Victor Osimhen's UEFA player page confirming 90 minutes.
-- Deniz Gül was named among unused substitutes: this is role evidence,
-- NOT an injury, absence probability=0 or Fantasy zero.
with observed(player_id, squad_status, started, minutes) as (
 values
 (511,'started',true,90),(529,'started',true,90),
 (520,'started',true,67),(516,'started',true,90),
 (531,'started',true,90),(539,'started',true,81),
 (525,'started',true,58),(877,'started',true,58),
 (505,'started',true,58),(1306,'started',true,90),
 (507,'started',true,90),
 (542,'substitute',false,23),(532,'substitute',false,32),
 (514,'substitute',false,32),(515,'substitute',false,32),
 (527,'substitute',false,9),
 (1405,'unused',false,0)
)
insert into public.scout_official_external_appearances
  (match_ref,player_id,team_id,competition,finished_at,
   squad_status,started,minutes,source_url)
select 'uefa-ucl-2026-2049576',o.player_id,17,'UEFA_CL',
  '2026-10-13T21:00:00Z'::timestamptz,
  o.squad_status,o.started,o.minutes,
  'https://www.uefa.com/news-media/mediaservices/informationkits/competitions/uefachampionsleague/2027/match/2049576/'
from observed o
join public.scout_players p on p.id=o.player_id and p.team_id=17
on conflict (match_ref,player_id) do update
  set squad_status=excluded.squad_status,started=excluded.started,
      minutes=excluded.minutes,source_url=excluded.source_url,
      source_updated_at=now()
where public.scout_official_external_appearances.squad_status is distinct from excluded.squad_status
   or public.scout_official_external_appearances.minutes is distinct from excluded.minutes;

-- Public roles intentionally have NO select policy. Model service-role Edge
-- function reads rows, applies recency/role safeguards, writes a new QA-gated run.
