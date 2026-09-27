begin;

alter table public.scout_players
  add column if not exists source_position text,
  add column if not exists sub_role text,
  add column if not exists sub_role_source text;

alter table public.scout_players
  drop constraint if exists scout_players_sub_role_check;
alter table public.scout_players
  add constraint scout_players_sub_role_check
  check (sub_role is null or sub_role in ('CB','FB','WB'));

alter table public.scout_replay_player_inputs
  add column if not exists source_position text,
  add column if not exists sub_role text;

alter table public.scout_replay_player_inputs
  drop constraint if exists scout_replay_player_inputs_sub_role_check;
alter table public.scout_replay_player_inputs
  add constraint scout_replay_player_inputs_sub_role_check
  check (sub_role is null or sub_role in ('CB','FB','WB'));

create or replace function private.scout_defender_sub_role(p_source_position text)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when p_source_position is null or btrim(p_source_position)='' then null
    when upper(p_source_position) ~ '(^|[, /])(?:RWB|LWB|WB)([, /]|$)' then 'WB'
    when upper(p_source_position) ~ '(^|[, /])(?:RB|LB|FB)([, /]|$)' then 'FB'
    when upper(p_source_position) ~ '(^|[, /])CB([, /]|$)' then 'CB'
    else null
  end;
$$;

-- Verified FotMob positions for the defenders explicitly used by the model audit.
-- Keep the original FotMob position string so future refreshes can be audited.
update public.scout_players
set source_position=v.source_position,
    sub_role=private.scout_defender_sub_role(v.source_position),
    sub_role_source='FotMob • verified 2026-09-27'
from (values
  (259,'LB'),
  (261,'CB'),
  (277,'RB,RWB,RM,CB'),
  (426,'CB'),
  (427,'RWB,RM'),
  (542,'RB'),
  (567,'RWB,RB,RM,RW')
) as v(player_id,source_position)
where scout_players.id=v.player_id
  and scout_players.position='DEF';

-- Replay inputs inherit the canonical player role. This makes historical replay
-- use the same CB/FB/WB allocation contract as the production simulator when
-- the row is regenerated or replayed.
update public.scout_replay_player_inputs r
set source_position=p.source_position,
    sub_role=p.sub_role
from public.scout_players p
where p.id=r.player_id
  and p.position='DEF'
  and p.sub_role is not null;

comment on column public.scout_players.source_position is
  'Source football position string used to derive the forecast-only defender sub-role.';
comment on column public.scout_players.sub_role is
  'Forecast defender subtype: CB, FB or WB. Fantasy position remains scout_players.position.';
comment on column public.scout_players.sub_role_source is
  'Audit label for defender sub-role provenance.';
comment on column public.scout_replay_player_inputs.sub_role is
  'Replay copy of canonical defender sub-role; does not change fantasy eligibility.';

commit;
