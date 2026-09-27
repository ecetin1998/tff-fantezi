begin;

-- Explicit deny policy documents that raw event-level data is server-only.
drop policy if exists scout_match_attack_events_no_browser_access
on public.scout_match_attack_events;
create policy scout_match_attack_events_no_browser_access
on public.scout_match_attack_events
for all
to anon,authenticated
using(false)
with check(false);

-- Cover foreign keys used by enrichment joins and deletes.
create index if not exists scout_match_attack_events_team_id_idx
  on public.scout_match_attack_events(team_id);
create index if not exists scout_match_attack_events_opponent_team_id_idx
  on public.scout_match_attack_events(opponent_team_id);
create index if not exists scout_match_attack_events_player_id_idx
  on public.scout_match_attack_events(player_id)
  where player_id is not null;
create index if not exists scout_match_attack_events_assist_player_id_idx
  on public.scout_match_attack_events(assist_player_id)
  where assist_player_id is not null;
create index if not exists scout_team_tactical_profiles_team_id_idx
  on public.scout_team_tactical_profiles(team_id);

commit;
