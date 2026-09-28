begin;

-- Reviewed 2026/27 Süper Lig xA snapshot, checked 2026-09-28.
-- Exact player-page totals get high confidence. League leaderboard values are rounded
-- to one decimal and are kept at lower confidence so the prior blend still protects
-- very small samples. Existing observed xA is never overwritten.

with exact_src(player_id,xa_total,shots,shots_on_target,key_passes,big_chances_created,touches_in_box) as (
  values
    (420::bigint,0.01::numeric,1,0,1,null::int,null::int), -- Maestro
    (910,0.05,1,1,1,null,2),                              -- Iván Cédric
    (1141,0.04,1,0,1,null,5),                            -- Ernest Poku
    (371,0.21,4,1,4,1,8),                               -- Dal Varešanović
    (336,0.01,1,1,null,null,1)                           -- Thalisson
)
update public.scout_player_season_stats s
set xa_total=src.xa_total,
    xa_per90=case when coalesce(s.minutes,0)>0
                  then round(src.xa_total*90.0/s.minutes,6)
                  else null end,
    xa_source='fotmob_xa_total_exact_reviewed_2026-09-28',
    xa_confidence=.95,
    shots=coalesce(src.shots,s.shots),
    shots_on_target=coalesce(src.shots_on_target,s.shots_on_target),
    key_passes=coalesce(src.key_passes,s.key_passes),
    big_chances_created=coalesce(src.big_chances_created,s.big_chances_created),
    touches_in_box=coalesce(src.touches_in_box,s.touches_in_box),
    advanced_updated_at=now(),
    updated_at=now()
from exact_src src
where s.season='2026-27'
  and s.player_id=src.player_id
  and s.xa_per90 is null;

with rounded_src(player_id,xa_total) as (
  values
    (258::bigint,0.3::numeric), -- Kartal Yılmaz
    (92,0.5),                   -- Haris Hajradinović
    (712,0.1),                  -- Bekir Turaç Böke
    (571,0.2),                  -- Karamba Gassama
    (423,0.0),                  -- Enes Keskin
    (425,0.0),                  -- İzzet Çelik
    (1209,0.0),                 -- Fabio Miretti
    (257,0.0),                  -- Milot Rashica
    (268,0.0),                  -- Semih Kılıçsoy
    (250,0.0),                  -- Arda Hilmi Şengül
    (16,0.0),                   -- Göktan Gürpüz
    (242,0.0),                  -- Mame Baba Thiam
    (1406,0.0),                 -- Youssoufa Moukoko
    (401,0.0),                  -- Festy Ebosele
    (1108,0.0),                 -- Ibrahim Diabate
    (49,0.0),                   -- Nariman Akhundzada
    (498,0.0),                  -- Arda Yavuz
    (503,0.0),                  -- Hamza Yiğit Akman
    (484,0.0),                  -- Mete Kaan Demir
    (575,0.0),                  -- Fuat Bavuk
    (541,0.0),                  -- Metehan Baltacı
    (1504,0.0),                 -- Victor Orakpo
    (1542,0.0),                 -- Tino Anjorin
    (85,0.0),                   -- Emirhan Boz
    (1543,0.0),                 -- Jesurun Rak-Sakyi
    (1208,0.0),                 -- Florian Ayé
    (119,0.0),                  -- Metehan Altunbaş
    (112,0.0),                  -- Muharrem Cinan
    (1373,0.0),                 -- Tobias Gulliksen
    (635,0.0),                  -- Moussa Diakité
    (360,0.0),                  -- Tayyip Talha Sanuç
    (107,0.0)                   -- Arda Özyar
)
update public.scout_player_season_stats s
set xa_total=src.xa_total,
    xa_per90=case when coalesce(s.minutes,0)>0
                  then round(src.xa_total*90.0/s.minutes,6)
                  else null end,
    xa_source='fotmob_xa_total_1dp_reviewed_2026-09-28',
    xa_confidence=.70,
    advanced_updated_at=now(),
    updated_at=now()
from rounded_src src
where s.season='2026-27'
  and s.player_id=src.player_id
  and s.xa_per90 is null
  and coalesce(s.minutes,0)>0;

-- Recompute each active player's share of team attacking contribution from
-- current xG + effective xA (observed where available, prior-shrunk otherwise).
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
