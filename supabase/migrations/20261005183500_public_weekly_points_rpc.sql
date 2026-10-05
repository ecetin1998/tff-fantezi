create or replace function public.scout_public_weekly_points(p_season text default '2026-27')
returns table(
  player_id bigint,
  matches_played integer,
  minutes numeric,
  six_plus_count integer,
  actual_points integer,
  weekly jsonb
)
language sql
stable
security invoker
set search_path=public
as $$
  select
    p.id as player_id,
    coalesce(s.matches_played,0)::integer as matches_played,
    coalesce(s.minutes,0)::numeric as minutes,
    coalesce(s.six_plus_count,0)::integer as six_plus_count,
    coalesce(s.actual_points,0)::integer as actual_points,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'gameweek',w.gameweek,
          'points',w.points,
          'minutes',w.minutes,
          'is_final',w.is_final
        )
        order by w.gameweek
      ) filter (where w.player_id is not null),
      '[]'::jsonb
    ) as weekly
  from public.scout_players p
  left join public.scout_player_season_stats s
    on s.player_id=p.id and s.season=p_season
  left join public.scout_player_weekly_points w
    on w.player_id=p.id and w.is_final=true
  where p.active=true
  group by p.id,s.matches_played,s.minutes,s.six_plus_count,s.actual_points
  order by p.id;
$$;

revoke all on function public.scout_public_weekly_points(text) from public;
grant execute on function public.scout_public_weekly_points(text) to anon, authenticated;
