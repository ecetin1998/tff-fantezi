begin;

-- Reviewed public xA/90 snapshot (FotMob Süper Lig 2026/27 pages, checked 2026-09-28).
-- Fill only missing observed xA. Never overwrite a previously observed value.
with src(player_id,xa_per90) as (
  values
    (421::bigint,0.26::numeric), -- Ianis Hagi
    (977,0.20), -- Paolo Fernandes
    (426,0.07), -- Fatih Aksoy
    (415,0.05), -- Meschack Elia
    (416,0.04), -- Yusuf Özdemir
    (746,0.09), -- Miguel Cardoso
    (778,0.03), -- Elisha Owusu
    (63,0.03),  -- Mustafa Yumlu
    (51,0.00),  -- Ertuğrul Taşkıran
    (483,0.02), -- David Costa
    (82,0.02),  -- Yusuf Barası
    (355,0.01), -- Anıl Yaşar
    (1537,0.04), -- Pedro Mendes
    (1545,0.14), -- Rafael Luís
    (1307,0.03), -- Ermin Mahmić
    (241,0.00),  -- Serdar Saatçı
    (976,0.02),  -- Matej Maglica
    (125,0.03),  -- Mahamadou Susoho
    (109,0.10),  -- Tayfur Bingöl
    (428,0.02),  -- Ümit Akdağ
    (811,0.07),  -- Richard Akonnor
    (309,0.01),  -- Arda Özçimen
    (290,0.01),  -- Luka Gugeshashvili
    (294,0.02),  -- Ogün Bayrak
    (359,0.16),  -- Adedire Awokoya-Mebude
    (378,0.07),  -- Ahmed Kutucu
    (351,0.09),  -- Ibrahim Olawoyin
    (370,0.11),  -- Valentin Mihăilă
    (550,0.00)   -- Myenty Abena
)
update public.scout_player_season_stats s
set xa_per90=src.xa_per90,
    xa_total=case
      when coalesce(s.minutes,0)>0 then round(src.xa_per90*s.minutes/90.0,3)
      else 0
    end,
    xa_source='fotmob_xa_per90_reviewed_2026-09-28',
    xa_confidence=.95,
    advanced_updated_at=now(),
    updated_at=now()
from src
where s.season='2026-27'
  and s.player_id=src.player_id
  and s.xa_per90 is null;

-- Refresh team attack-contribution shares with observed xA where available and
-- the already-approved effective xA fallback for the remaining players.
with features as (
  select s.player_id,p.team_id,
         coalesce(s.xg_total,0) xg_total,
         coalesce(
           s.xa_total,
           f.effective_xa_per90*coalesce(s.minutes,0)/90.0,
           0
         ) effective_xa_total
  from public.scout_player_season_stats s
  join public.scout_players p on p.id=s.player_id and p.active=true
  left join public.v_scout_player_model_features f on f.player_id=s.player_id
  where s.season='2026-27'
), totals as (
  select team_id,sum(xg_total+effective_xa_total) denom
  from features
  group by team_id
)
update public.scout_player_season_stats s
set attack_contribution_share=
      case when totals.denom>0
           then (features.xg_total+features.effective_xa_total)/totals.denom
           else 0 end,
    advanced_updated_at=now()
from features
join totals on totals.team_id=features.team_id
where s.season='2026-27'
  and s.player_id=features.player_id;

commit;
