-- Formation geometry locates a starting slot; it does not uniquely establish
-- attacking intent (AM vs CM in the advanced line of 4-1-4-1), deep midfield
-- duties (CM vs DM), or winger vs wide midfielder in that shape.
-- Before/after role snapshot is the verified pre-MH9–11 profile for the 67
-- changed labels. Keep compatible prior roles instead of falsely demoting them.
with prior(player_id,base_role,base_side) as (values
(4,'AM','C'),
(12,'W','R'),
(22,'GK','NA'),
(32,'DM','C'),
(41,'FB','R'),
(48,'FB','L'),
(51,'GK','NA'),
(58,'AM','C'),
(59,'DM','C'),
(71,'FB','R'),
(80,'GK','NA'),
(82,'W','L'),
(127,'W','R'),
(130,'GK','NA'),
(152,'W','L'),
(161,'GK','NA'),
(166,'GK','NA'),
(178,'W','L'),
(195,'GK','NA'),
(199,'W','R'),
(212,'DM','C'),
(216,'GK','NA'),
(234,'GK','NA'),
(248,'DM','C'),
(264,'AM','C'),
(269,'DM','C'),
(272,'GK','NA'),
(273,'W','L'),
(279,'W','R'),
(280,'GK','NA'),
(300,'DM','C'),
(304,'DM','C'),
(309,'GK','NA'),
(351,'AM','C'),
(352,'AM','C'),
(359,'W','R'),
(364,'W','L'),
(376,'GK','NA'),
(380,'GK','NA'),
(388,'W','R'),
(402,'FB','L'),
(419,'GK','NA'),
(420,'DM','C'),
(435,'DM','C'),
(447,'GK','NA'),
(453,'W','R'),
(455,'DM','C'),
(457,'FB','L'),
(463,'AM','C'),
(472,'FB','R'),
(483,'AM','C'),
(486,'W','L'),
(505,'AM','C'),
(511,'GK','NA'),
(561,'AM','C'),
(567,'WB','R'),
(568,'AM','C'),
(573,'W','R'),
(600,'W','R'),
(635,'CM','C'),
(746,'W','L'),
(811,'FB','L'),
(813,'CM','C'),
(1306,'ST','C'),
(1546,'GK','NA'),
(1605,null,null),
(1608,null,null)
), base as (
 select p.id,p.team_id,case when a.player_id is not null then a.base_role else p.primary_role end as base_role,
 case when a.player_id is not null then a.base_side else p.role_side end as base_side
 from public.scout_players p left join prior a on a.player_id=p.id
 where p.active and p.role_source='verified_formation_mh9_11_2026-11-15'
), effective as (
 select o.*,b.base_role,b.base_side,
 case
  when o.source_position_label like 'formation:4-1-4-1;line:3;%' and
   ((o.role='CM' and b.base_role='AM') or (o.role='WM' and b.base_role='W')) then b.base_role
  when o.source_position_label like 'formation:%' and o.role='CM' and b.base_role='DM'
   and o.source_position_label not like 'formation:4-1-4-1;line:3;%' then b.base_role
  when o.source_position_label ~ '^formation:[345]-2-' and o.role='DM' and b.base_role='CM' then b.base_role
  else o.role
 end as effective_role
 from public.scout_player_tactical_role_observations o join base b on b.id=o.player_id and b.team_id=o.team_id
 where o.season='2026-27' and o.gameweek between 9 and 11 and o.verified and o.started and o.minutes>=45
), votes as (
 select player_id,team_id,effective_role role,count(distinct gameweek) n,sum(minutes) mins,
 count(distinct side) filter(where side is not null) side_count,min(side) filter(where side is not null) side_value,
 bool_or(side='L') has_left,bool_or(side='R') has_right,bool_or(role<>effective_role) ambiguity
 from effective group by player_id,team_id,effective_role
), ranked as (
 select v.*,row_number() over(partition by player_id order by n desc,mins desc,role) rn,
 lead(n) over(partition by player_id order by n desc,mins desc,role) runner_up from votes v
), resolved as (
 select r.*,case when side_count=1 then side_value
 when has_left and has_right and role in ('W','WM','FB','WB') then 'BOTH'
 when role in ('GK','CB','DM','CM','AM','SS','ST') then 'C' else null end resolved_side
 from ranked r where rn=1 and n>=2 and coalesce(runner_up,0)<n
)
update public.scout_players p set
 primary_role=coalesce(r.role,b.base_role),
 role_side=case when r.role is null then b.base_side else coalesce(r.resolved_side,case when r.role=b.base_role then b.base_side else null end) end,
 role_source=case when r.role is null or r.ambiguity then 'verified_formation_mh9_11_2026-11-15_compatible_prior' else 'verified_formation_mh9_11_2026-11-15' end,
 role_confidence=case when r.role is null or r.ambiguity then .85 when r.n>=3 then .95 else .90 end,
 updated_at=now()
 from base b left join resolved r on r.player_id=b.id and r.team_id=b.team_id where p.id=b.id and p.team_id=b.team_id;
