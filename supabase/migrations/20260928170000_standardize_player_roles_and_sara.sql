begin;

-- Reviewed role overrides are authoritative. Automated enrichment may still update
-- the rest of the player row, but it must not silently replace a reviewed role.
create or replace function private.protect_manual_player_role()
returns trigger
language plpgsql
security invoker
set search_path=''
as $fn$
begin
  if coalesce(old.role_source,'') like 'manual_review:%'
     and coalesce(new.role_source,'') not like 'manual_review:%' then
    new.primary_role := old.primary_role;
    new.role_side := old.role_side;
    new.role_source := old.role_source;
    new.role_confidence := old.role_confidence;
  end if;
  return new;
end;
$fn$;

drop trigger if exists scout_players_manual_role_guard on public.scout_players;
create trigger scout_players_manual_role_guard
before update of primary_role,role_side,role_source,role_confidence
on public.scout_players
for each row execute function private.protect_manual_player_role();

-- Gabriel Sara is a central midfielder; the previous DM assignment came from
-- a generic/alias enrichment match rather than his canonical detailed role.
update public.scout_players
set primary_role='CM',
    role_side='C',
    role_source='manual_review:central_midfield_2026-09-28',
    role_confidence=1,
    updated_at=now()
where full_name='Gabriel Davi Gomes Sara'
  and position='MID';

commit;
