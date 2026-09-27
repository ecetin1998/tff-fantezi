-- Player/run data quality normalization and release-gate hardening.

alter table public.scout_player_projections
  add column if not exists confidence text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.scout_player_projections'::regclass
      and conname='scout_player_projections_confidence_check'
  ) then
    alter table public.scout_player_projections
      add constraint scout_player_projections_confidence_check
      check (confidence is null or confidence in ('low','medium','high'));
  end if;
end $$;

update public.scout_player_projections pr
set confidence=case
  when coalesce(sp.status,'') ilike '%Yüksek güven%' or coalesce(pr.data_confidence,'') ilike 'Yüksek' then 'high'
  when coalesce(sp.status,'') ilike '%Düşük güven%' or coalesce(pr.data_confidence,'') ilike 'Düşük' then 'low'
  else 'medium'
end
from public.scout_players sp
where sp.id=pr.player_id and pr.confidence is null;

create or replace function private.normalize_projection_confidence()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.confidence is null then
    new.confidence:=case
      when lower(coalesce(new.data_confidence,'')) in ('yüksek','high') then 'high'
      when lower(coalesce(new.data_confidence,'')) in ('düşük','low') then 'low'
      else 'medium'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists scout_projection_confidence_insert on public.scout_player_projections;
create trigger scout_projection_confidence_insert
before insert on public.scout_player_projections
for each row execute function private.normalize_projection_confidence();

drop trigger if exists scout_projection_confidence_update on public.scout_player_projections;
create trigger scout_projection_confidence_update
before update of confidence,data_confidence on public.scout_player_projections
for each row execute function private.normalize_projection_confidence();

comment on column public.scout_player_projections.data_confidence is 'Deprecated: use run-scoped confidence.';
grant select(confidence) on public.scout_player_projections to anon,authenticated;

alter table public.scout_players
  add column if not exists short_label text;

create or replace function private.normalize_scout_player_row()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.full_name is not null then
    new.full_name:=replace(normalize(new.full_name,NFC),chr(775),'');
  end if;
  if new.display_name is not null then
    new.display_name:=replace(normalize(new.display_name,NFC),chr(775),'');
  end if;
  if new.shirt_number=0 then new.shirt_number:=null; end if;
  if new.active is true then new.status:=null; end if;
  return new;
end;
$$;

drop trigger if exists scout_players_normalize_insert on public.scout_players;
create trigger scout_players_normalize_insert
before insert on public.scout_players
for each row execute function private.normalize_scout_player_row();

drop trigger if exists scout_players_normalize_update on public.scout_players;
create trigger scout_players_normalize_update
before update of full_name,display_name,shirt_number,status,active on public.scout_players
for each row execute function private.normalize_scout_player_row();

update public.scout_players
set full_name=replace(normalize(full_name,NFC),chr(775),''),
    display_name=case when display_name is null then null else replace(normalize(display_name,NFC),chr(775),'') end,
    shirt_number=case when shirt_number=0 then null else shirt_number end,
    status=case when active then null else status end;

create or replace function private.recompute_scout_short_labels()
returns void
language sql
security invoker
set search_path=''
as $$
  update public.scout_players p
  set short_label=case
    when nullif(btrim(p.display_name),'') is null then
      coalesce(nullif(regexp_replace(btrim(p.full_name),'^.*[[:space:]]','','g'),''),p.full_name)
    when (
      select count(*)
      from public.scout_players q
      where q.team_id=p.team_id and q.display_name=p.display_name
    )=1 then p.display_name
    else p.display_name||' '||
      left(coalesce(nullif(regexp_replace(btrim(p.full_name),'^.*[[:space:]]','','g'),''),p.full_name),1)||'.'
  end;
$$;

create or replace function private.refresh_scout_short_labels_trigger()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  perform private.recompute_scout_short_labels();
  return null;
end;
$$;

select private.recompute_scout_short_labels();

drop trigger if exists scout_players_short_label_insert on public.scout_players;
create trigger scout_players_short_label_insert
after insert on public.scout_players
for each statement execute function private.refresh_scout_short_labels_trigger();

drop trigger if exists scout_players_short_label_update on public.scout_players;
create trigger scout_players_short_label_update
after update of full_name,display_name,team_id on public.scout_players
for each statement execute function private.refresh_scout_short_labels_trigger();

comment on column public.scout_players.status is 'Deprecated: confidence is run-scoped on scout_player_projections.';
grant select(short_label) on public.scout_players to anon,authenticated;

alter table public.scout_availability
  add column if not exists canonical_reason text,
  add column if not exists expected_return_date date;

create or replace function private.parse_expected_return_date(p_value text)
returns date
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  m text[];
  month_no int;
  day_no int;
begin
  if p_value is null or btrim(p_value)='' or lower(btrim(p_value))='şüpheli' then return null; end if;
  m:=regexp_match(
    btrim(p_value),
    '^(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)[[:space:]]+ayı[[:space:]]+(başında|ortasında|sonunda)[[:space:]]+([0-9]{4})$',
    'i'
  );
  if m is null then return null; end if;
  month_no:=case lower(m[1])
    when 'ocak' then 1 when 'şubat' then 2 when 'mart' then 3 when 'nisan' then 4
    when 'mayıs' then 5 when 'haziran' then 6 when 'temmuz' then 7 when 'ağustos' then 8
    when 'eylül' then 9 when 'ekim' then 10 when 'kasım' then 11 when 'aralık' then 12
    else null end;
  day_no:=case lower(m[2]) when 'başında' then 5 when 'ortasında' then 15 when 'sonunda' then 25 else null end;
  if month_no is null or day_no is null then return null; end if;
  return make_date(m[3]::int,month_no,day_no);
end;
$$;

create or replace function private.canonical_availability_reason(
  p_reason text,
  p_source_reason text,
  p_source_url text,
  p_detail_source_label text,
  p_detail_source_url text
)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when coalesce(p_detail_source_label,'') ~* '(maç kadrosu|match squad|kulüp|club|resmi|official)'
      then coalesce(nullif(btrim(p_source_reason),''),nullif(btrim(p_reason),''))
    when coalesce(p_source_url,'') ilike '%sakat-ve-cezali.com%'
      or coalesce(p_detail_source_url,'') ilike '%sakat-ve-cezali.com%'
      then coalesce(nullif(btrim(p_source_reason),''),nullif(btrim(p_reason),''))
    else coalesce(nullif(btrim(p_reason),''),nullif(btrim(p_source_reason),''))
  end;
$$;

create or replace function private.normalize_scout_availability_row()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  new.canonical_reason:=private.canonical_availability_reason(
    new.reason,new.source_reason,new.source_url,new.detail_source_label,new.detail_source_url
  );
  new.expected_return_date:=private.parse_expected_return_date(new.expected_return);
  return new;
end;
$$;

update public.scout_availability
set canonical_reason=private.canonical_availability_reason(
      reason,source_reason,source_url,detail_source_label,detail_source_url
    ),
    expected_return_date=private.parse_expected_return_date(expected_return);

drop trigger if exists scout_availability_normalize_insert on public.scout_availability;
create trigger scout_availability_normalize_insert
before insert on public.scout_availability
for each row execute function private.normalize_scout_availability_row();

drop trigger if exists scout_availability_normalize_update on public.scout_availability;
create trigger scout_availability_normalize_update
before update of reason,source_reason,source_url,detail_source_label,detail_source_url,expected_return
on public.scout_availability
for each row execute function private.normalize_scout_availability_row();

grant select(canonical_reason,expected_return_date) on public.scout_availability to anon,authenticated;

alter table public.scout_player_season_stats
  add column if not exists season text not null default '2026-27';
grant select(season) on public.scout_player_season_stats to anon,authenticated;
alter table public.scout_match_history
  add column if not exists season text not null default '2026-27';
grant select(season) on public.scout_match_history to anon,authenticated;

alter table public.scout_player_season_stats drop constraint if exists scout_player_season_stats_pkey;
alter table public.scout_player_season_stats add constraint scout_player_season_stats_pkey primary key(season,player_id);
create index if not exists scout_player_season_stats_player_id_idx on public.scout_player_season_stats(player_id);

alter table public.scout_match_history drop constraint if exists scout_match_history_pkey;
alter table public.scout_match_history add constraint scout_match_history_pkey primary key(season,match_id);
create index if not exists scout_match_history_match_id_idx on public.scout_match_history(match_id);

create unique index if not exists scout_model_runs_one_current
on public.scout_model_runs((true))
where is_current;

alter table public.scout_run_release_gates
  add column if not exists availability_freshness boolean not null default false;

create or replace function private.scout_availability_is_fresh(p_run_id uuid)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(
    (
      select min(a.checked_at) >= r.generated_at-interval '24 hours'
      from public.scout_model_runs r
      join public.scout_availability a on a.run_id=r.id
      where r.id=p_run_id
      group by r.generated_at
    ),
    false
  );
$$;

update public.scout_run_release_gates g
set availability_freshness=private.scout_availability_is_fresh(g.run_id);

create or replace function private.set_scout_release_gate_freshness()
returns trigger
language plpgsql
security definer
set search_path=''
as $fresh$
begin
  new.availability_freshness:=private.scout_availability_is_fresh(new.run_id);
  return new;
end;
$fresh$;
revoke all on function private.set_scout_release_gate_freshness() from public,anon,authenticated;
drop trigger if exists scout_release_gate_freshness_guard on public.scout_run_release_gates;
create trigger scout_release_gate_freshness_guard
before insert or update on public.scout_run_release_gates
for each row execute function private.set_scout_release_gate_freshness();

create or replace function public.scout_data_integrity_qa(p_run_id uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
with run_meta as (
  select id,gameweek,generated_at from scout_model_runs where id=p_run_id
),
rules_meta as (
  select season from scout_game_rules order by season desc limit 1
),
fx as (
  select m.run_id,m.home_team_id team_id,at.name opponent,'HOME' venue
  from scout_match_predictions m
  join scout_teams at on at.id=m.away_team_id
  where m.run_id=p_run_id
  union all
  select m.run_id,m.away_team_id,ht.name opponent,'AWAY' venue
  from scout_match_predictions m
  join scout_teams ht on ht.id=m.home_team_id
  where m.run_id=p_run_id
),
fixture_check as (
  select count(*)::int mismatch_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  left join fx on fx.team_id=sp.team_id and fx.run_id=p.run_id
  where p.run_id=p_run_id
    and (
      fx.team_id is null
      or coalesce(p.opponent_name,'')<>coalesce(fx.opponent,'')
      or coalesce(p.venue,'')<>coalesce(fx.venue,'')
    )
),
actual_check as (
  select count(*)::int nonzero_points_zero_minutes
  from scout_player_weekly_points w
  cross join run_meta r
  where w.is_final=true
    and w.gameweek<r.gameweek
    and coalesce(w.points,0)<>0
    and coalesce(w.minutes,0)<=0
),
weekly_totals as (
  select player_id,sum(points)::int total_points
  from scout_player_weekly_points w
  cross join run_meta r
  where w.is_final=true and w.gameweek<r.gameweek
  group by player_id
),
season_points_check as (
  select count(*)::int mismatch_count
  from scout_players sp
  left join scout_player_season_stats s
    on s.player_id=sp.id and s.season=(select season from rules_meta)
  left join weekly_totals w on w.player_id=sp.id
  where sp.active=true
    and coalesce(s.actual_points,0)<>coalesce(w.total_points,0)
),
suspension_check as (
  select count(*)::int mismatch_count
  from scout_availability a
  join scout_players sp on sp.id=a.player_id and sp.active
  join scout_match_predictions m
    on m.run_id=a.run_id
   and sp.team_id in (m.home_team_id,m.away_team_id)
  join scout_teams ht on ht.id=m.home_team_id
  join scout_teams at on at.id=m.away_team_id
  where a.run_id=p_run_id
    and a.availability_type='suspensions'
    and coalesce(a.suspension_fixture,'') <>
      to_char(m.kickoff_at at time zone 'Europe/Istanbul','DD.MM.YYYY')
      || ' • ' || ht.name || ' - ' || at.name
),
public_texts as (
  select sp.id::text entity_id,sp.short_label txt from scout_players sp where sp.active
  union all
  select p.player_id::text,p.opponent_name from scout_player_projections p where p.run_id=p_run_id
  union all
  select p.player_id::text,p.role_note from scout_player_projections p where p.run_id=p_run_id
  union all
  select a.player_id::text,a.canonical_reason from scout_availability a where a.run_id=p_run_id
  union all
  select r.player_id::text,r.signal from scout_role_signals r where r.run_id=p_run_id
),
stale_gw_check as (
  select count(*)::int mismatch_count
  from public_texts t
  cross join run_meta r
  cross join lateral regexp_matches(coalesce(t.txt,''),'GW([0-9]+)','gi') m
  where (m[1])::int<>r.gameweek
),
xi_check as (
  select count(*)::int violation_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  where p.run_id=p_run_id and p.xi_probability>.97
),
minute_check as (
  select count(*)::int violation_count
  from scout_player_projections p
  join scout_players sp on sp.id=p.player_id and sp.active
  where p.run_id=p_run_id and p.x_minutes>88
),
shirt_check as (
  select count(*)::int violation_count from scout_players where shirt_number=0
),
name_check as (
  select count(*)::int violation_count
  from scout_players
  where position(chr(775) in coalesce(full_name,''))>0
     or position(chr(775) in coalesce(display_name,''))>0
     or position(chr(775) in coalesce(short_label,''))>0
)
select jsonb_build_object(
  'pass',
    (select mismatch_count=0 from fixture_check)
    and (select nonzero_points_zero_minutes=0 from actual_check)
    and (select mismatch_count=0 from season_points_check)
    and (select mismatch_count=0 from suspension_check)
    and (select mismatch_count=0 from stale_gw_check)
    and (select violation_count=0 from xi_check)
    and (select violation_count=0 from minute_check)
    and (select violation_count=0 from shirt_check)
    and (select violation_count=0 from name_check),
  'fixture_mismatch',(select mismatch_count from fixture_check),
  'nonzero_points_zero_minutes',(select nonzero_points_zero_minutes from actual_check),
  'season_points_mismatch',(select mismatch_count from season_points_check),
  'suspension_fixture_mismatch',(select mismatch_count from suspension_check),
  'stale_gw_text',(select mismatch_count from stale_gw_check),
  'xi_probability_over_097',(select violation_count from xi_check),
  'x_minutes_over_88',(select violation_count from minute_check),
  'shirt_number_zero',(select violation_count from shirt_check),
  'combining_dot_names',(select violation_count from name_check)
);
$function$;

create or replace function public.scout_promote_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  qa jsonb;
  data_qa jsonb;
  gate public.scout_run_release_gates%rowtype;
  run_notes text;
  availability_fresh boolean;
begin
  select notes into run_notes
  from public.scout_model_runs
  where id=p_run_id and status='ready'
  for update;

  if not found then
    raise exception 'Run is missing or not ready' using errcode='check_violation';
  end if;

  if coalesce(run_notes,'') ilike '%do not publish%' then
    raise exception 'Run is explicitly marked do not publish' using errcode='check_violation';
  end if;

  select * into gate from public.scout_run_release_gates where run_id=p_run_id;
  availability_fresh:=private.scout_availability_is_fresh(p_run_id);
  if not found
    or gate.qa_pass is not true
    or gate.data_integrity_pass is not true
    or gate.backtest_pass is not true
    or gate.availability_freshness is not true
    or availability_fresh is not true then
    raise exception 'Run is missing a passing release gate' using errcode='check_violation';
  end if;

  qa:=public.scout_run_qa(p_run_id);
  data_qa:=public.scout_data_integrity_qa(p_run_id);

  if coalesce((qa->>'pass')::boolean,false) is not true
    or coalesce((data_qa->>'pass')::boolean,false) is not true then
    raise exception 'Run failed production QA' using errcode='check_violation';
  end if;

  lock table public.scout_model_runs in share row exclusive mode;
  update public.scout_model_runs set is_current=false where is_current=true and id<>p_run_id;
  update public.scout_model_runs set is_current=true where id=p_run_id and status='ready';

  return qa||jsonb_build_object(
    'data_integrity',data_qa,
    'release_gate',to_jsonb(gate),
    'availability_freshness',availability_fresh,
    'promoted',true
  );
end;
$function$;
