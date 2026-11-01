/**
 * Read-only, player-resolved source-coverage diagnostics.
 *
 * A 0 in an independently reconstructed event ledger is NOT an observed
 * absence. Missing actions are NEVER converted into 0 shots/key passes.
 * All observations must have timestamps earlier than the target's first
 * kickoff. The diagnostic never changes player inputs or forecast weights.
 */
const positions=["GK","DEF","MID","FWD"];
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const n=v=>Number(v);
const safeStamp=(value,limit)=>Boolean(value)&&Number.isFinite(Date.parse(value))&&
  Date.parse(value)<limit;
const action=v=>Number.isInteger(Number(v))&&v!==null&&v!==undefined&&
  n(v)>=0&&n(v)<=30;
const roleSet=new Set(["GK","CB","FB","WB","DM","CM","AM","WM","W","SS","ST"]);
const count=()=>({players:0,final_played:0,confirmed_zero:0,inferred_zero:0,
  no_final_result:0,shot_last:0,key_pass_last:0,shot_three_weeks:0,
  key_pass_three_weeks:0,eligible_shot_form:0,eligible_key_pass_form:0,
  tactical_roles_two_starts:0,season_advanced_aligned:0});

export function sourceCoverageReport({gameweek,cutoffAt,players=[],weekly=[],
  advanced=[],verified=[],tactical=[],stats=[]}={}){
  const gw=Number(gameweek),start=Date.parse(cutoffAt||"");
  if(!Number.isInteger(gw)||gw<4||!Number.isFinite(start))
    return {ok:false,error:"INVALID_SOURCE_CUTOFF",no_writes:true};
  const weeks=[gw-3,gw-2,gw-1], active=players.filter(p=>p.active!==false&&
    positions.includes(String(p.position)));
  const seen=new Set(active.map(x=>n(x.id)));
  if(seen.size!==active.length)return {ok:false,error:"DUPLICATED_ACTIVE_PLAYER",no_writes:true};
  const keyed=(items,stamp,validRow)=>new Map(items.filter(r=>weeks.includes(n(r.gameweek))&&
    seen.has(n(r.player_id))&&safeStamp(r[stamp],start)&&(!validRow||validRow(r)))
    .map(r=>[`${r.gameweek}|${r.player_id}`,r]));
  const adv=keyed(advanced,"source_updated_at");
  const ver=keyed(verified,"observed_at");
  const roles=new Map();
  for(const obs of tactical){
    if(!weeks.includes(n(obs.gameweek))||!seen.has(n(obs.player_id))||
      !safeStamp(obs.observed_at,start)||obs.verified!==true||obs.started!==true||
      !roleSet.has(String(obs.role))||!finite(obs.minutes)||n(obs.minutes)<45)continue;
    const id=n(obs.player_id);
    const byWeek=roles.get(id)||new Map();
    if(!byWeek.has(n(obs.gameweek)))byWeek.set(n(obs.gameweek),obs);
    roles.set(id,byWeek);
  }
  // Preserve all rows: a double gameweek could contain >1 actual player row.
  const finals=new Map();
  for(const r of weekly){
    if(!weeks.includes(n(r.gameweek))||!seen.has(n(r.player_id))||
      r.is_final!==true||!safeStamp(r.source_updated_at,start))continue;
    const key=`${r.gameweek}|${r.player_id}`;
    if(!finals.has(key))finals.set(key,[]);
    finals.get(key).push(r);
  }
  const statsById=new Map(stats.map(r=>[n(r.player_id),r]));
  const total=count(), byPosition=Object.fromEntries(positions.map(p=>[p,count()]));
  const perWeek=Object.fromEntries(weeks.map(w=>[w,{
    final_played:0,confirmed_zero:0,inferred_zero:0,no_final_result:0,
    shots:0,key_passes:0,verified_shots:0,verified_key_passes:0
  }]));
  const metric=(id,week,name)=>{
    const key=`${week}|${id}`;
    const v=ver.get(key),a=adv.get(key);
    return action(v?.[name])?{value:n(v[name]),type:"verified"}:
      action(a?.[name])?{value:n(a[name]),type:"advanced"}:null;
  };
  for(const player of active){
    const id=n(player.id),pos=String(player.position),bucket=byPosition[pos];
    bucket.players++;total.players++;
    const season=statsById.get(id);
    const seasonAligned=season&&n(season.through_gameweek)>=gw-1&&
      n(season.advanced_through_gameweek)===n(season.through_gameweek)&&
      finite(season.minutes)&&n(season.minutes)>=270;
    if(seasonAligned){bucket.season_advanced_aligned++;total.season_advanced_aligned++;}
    const roleMatches=roles.get(id)?.size||0;
    if(roleMatches>=2){bucket.tactical_roles_two_starts++;total.tactical_roles_two_starts++;}
    const usableShots=[],usableKeys=[],mins=[];
    for(const week of weeks){
      const actual=finals.get(`${week}|${id}`)||[];
      const hasValid=actual.length&&actual.every(r=>finite(r.minutes)&&finite(r.points));
      const totalMinutes=hasValid?actual.reduce((s,r)=>s+n(r.minutes),0):null;
      const actualZero=hasValid&&totalMinutes===0&&
        actual.every(r=>r.source_kind==="fresh_closed_actual"&&n(r.points)===0);
      const inferredZero=hasValid&&totalMinutes===0&&!actualZero;
      const played=hasValid&&totalMinutes>0;
      if(week===gw-1){
        const key=played?"final_played":actualZero?"confirmed_zero":
          inferredZero?"inferred_zero":"no_final_result";
        bucket[key]++;total[key]++;
      }
      const wk=perWeek[week];
      if(played)wk.final_played++;
      else if(actualZero)wk.confirmed_zero++;
      else if(inferredZero)wk.inferred_zero++;
      else wk.no_final_result++;
      const shot=metric(id,week,"shots"),pass=metric(id,week,"key_passes");
      if(shot){wk.shots++;if(shot.type==="verified")wk.verified_shots++;}
      if(pass){wk.key_passes++;if(pass.type==="verified")wk.verified_key_passes++;}
      if(week===gw-1){
        if(shot){bucket.shot_last++;total.shot_last++;}
        if(pass){bucket.key_pass_last++;total.key_pass_last++;}
      }
      mins.push(played&&totalMinutes>=45?totalMinutes:null);
      usableShots.push(Boolean(shot)&&played&&totalMinutes>=45);
      usableKeys.push(Boolean(pass)&&played&&totalMinutes>=45);
    }
    const minutesEnough=mins.every(m=>m!==null)&&mins.reduce((s,v)=>s+v,0)>=180;
    if(usableShots.every(Boolean)){bucket.shot_three_weeks++;total.shot_three_weeks++;}
    if(usableKeys.every(Boolean)){bucket.key_pass_three_weeks++;total.key_pass_three_weeks++;}
    // These counts mirror the existing 3-week feature's preconditions. They
    // indicate *coverage*, not proof that the expected xG/xA rate should move.
    if(seasonAligned&&minutesEnough&&usableShots.every(Boolean)&&pos!=="GK"){
      bucket.eligible_shot_form++;total.eligible_shot_form++;
    }
    if(seasonAligned&&minutesEnough&&usableKeys.every(Boolean)&&pos!=="GK"){
      bucket.eligible_key_pass_form++;total.eligible_key_pass_form++;
    }
  }
  return {ok:true,no_writes:true,gameweek:gw,first_kickoff:cutoffAt,
    active_players:active.length,by_position:byPosition,
    latest_week:gw-1,by_week:perWeek,totals:total,
    data_policy:{
      absent_row:"unknown_not_zero",inferred_zero:"not_confirmed_nonparticipant",
      source_clock:"strictly_before_target_first_kickoff",
      three_week_trend:"all_three_sourced_weekly_minutes_and_actions",
      auto_tuning_permitted:false
    }};
}
