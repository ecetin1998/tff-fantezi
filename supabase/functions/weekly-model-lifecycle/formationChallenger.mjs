// Read-only champion/challenger comparison. This NEVER mutates frozen runs.
// The new model may be computed later, but ALL of its input evidence must be
// cut off at the pre-kickoff frozen source snapshot.
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
const okProb=v=>finite(v)&&Number(v)>=0&&Number(v)<=1;
const time=v=>{const t=Date.parse(v||"");return Number.isFinite(t)?t:null};
const round=v=>v===null?null:Math.round(v*10000)/10000;
const key=(week,id)=>Number(week)+":"+Number(id);
function uniqueRows(rows,idfn){
 const map=new Map();
 for(const row of rows){const id=idfn(row);if(map.has(id))map.set(id,null);else map.set(id,row)}
 return map;
}
const validActual=row=>row?.is_final===true&&finite(row.minutes)&&finite(row.points)&&
 (Number(row.minutes)>0||Number(row.minutes)===0&&row.source_kind==="fresh_closed_actual");
const groupStat=()=>({xiN:0,baseXI:0,trialXI:0,minutesN:0,baseMin:0,trialMin:0,xfpN:0,baseFP:0,trialFP:0,
  selectedActualStarts:0,lowConfidenceZerosExcluded:0,invalidLineups:0});
const summarize=(s)=>({
 xi_sample:s.xiN,champion_xi_brier:s.xiN?round(s.baseXI/s.xiN):null,
 challenger_xi_brier:s.xiN?round(s.trialXI/s.xiN):null,
 xi_brier_gain:s.xiN?round((s.baseXI-s.trialXI)/s.xiN):null,
 minute_sample:s.minutesN,champion_minute_mae:s.minutesN?round(s.baseMin/s.minutesN):null,
 challenger_minute_mae:s.minutesN?round(s.trialMin/s.minutesN):null,
 minute_mae_gain:s.minutesN?round((s.baseMin-s.trialMin)/s.minutesN):null,
 xfp_sample:s.xfpN,champion_xfp_mae:s.xfpN?round(s.baseFP/s.xfpN):null,
 challenger_xfp_mae:s.xfpN?round(s.trialFP/s.xfpN):null,
 xfp_mae_gain:s.xfpN?round((s.baseFP-s.trialFP)/s.xfpN):null,
 verified_starters:s.selectedActualStarts,unverified_zero_excluded:s.lowConfidenceZerosExcluded,
 incomplete_or_contradictory_lineups:s.invalidLineups
});
export function compareFrozenLineupCandidates({
 weeks=[],fixtures=[],champion=[],challenger=[],verifiedXi=[],actuals=[]
}={}){
 const firstKickoff=new Map(),fixtureMap=new Map();
 for(const f of fixtures){
  const gw=Number(f.gameweek),kickoff=time(f.kickoff_at);
  if(!Number.isInteger(gw)||kickoff===null)continue;
  firstKickoff.set(gw,Math.min(firstKickoff.get(gw)??Infinity,kickoff));
  const id=key(gw,f.match_id);
  if(!fixtureMap.has(id))fixtureMap.set(id,f);
 }
 const allowed=new Set();
 const blocked=[];
 for(const w of weeks){
  const gw=Number(w.gameweek),kickoff=firstKickoff.get(gw),
    frozen=time(w.champion_snapshot_at),candidateCutoff=time(w.challenger_input_cutoff_at);
  if(w.status==="closed"&&Number.isInteger(gw)&&Number.isFinite(kickoff)&&
    frozen!==null&&frozen<kickoff&&candidateCutoff!==null&&candidateCutoff<=frozen&&
    Number(w.challenger_training_through)<gw)
    allowed.add(gw);
  else blocked.push(gw);
 }
 const base=uniqueRows(champion,r=>key(r.gameweek,r.player_id));
 const trial=uniqueRows(challenger,r=>key(r.gameweek,r.player_id));
 const actual=uniqueRows(actuals,r=>key(r.gameweek,r.player_id));
 const xigroups=new Map();
 for(const row of verifiedXi){
  const gw=Number(row.gameweek),id=key(gw,row.match_id),f=fixtureMap.get(id),
    team=Number(row.team_id),playerId=Number(row.player_id);
  if(!allowed.has(gw)||!f||![Number(f.home_team_id),Number(f.away_team_id)].includes(team))continue;
  const gid=id+":"+team;
  if(!xigroups.has(gid))xigroups.set(gid,{gameweek:gw,team,ids:[],valid:true});
  const g=xigroups.get(gid);
  if(row.started!==true||row.verified_first_11!==true||
    typeof row.source_url!=="string"||!row.source_url.startsWith("https://")||
    !Number.isInteger(playerId)||g.ids.includes(playerId))g.valid=false;
  g.ids.push(playerId);
 }
 const perWeek=new Map(),get=gw=>{
  if(!perWeek.has(gw))perWeek.set(gw,groupStat());
  return perWeek.get(gw);
 };
 for(const g of xigroups.values()){
  const s=get(g.gameweek);
  if(!g.valid||g.ids.length!==11||new Set(g.ids).size!==11){s.invalidLineups++;continue;}
  const all=[...base.values()].filter(x=>x&&Number(x.gameweek)===g.gameweek&&Number(x.club_id)===g.team);
  if(!all.length||!g.ids.every(id=>all.some(row=>Number(row.player_id)===id))){
   s.invalidLineups++;continue;
  }
  for(const row of all){
   const k=key(g.gameweek,row.player_id),other=trial.get(k);
   if(!other||Number(other.club_id)!==g.team||
     !okProb(row.xi_probability)||!okProb(other.xi_probability))continue;
   const y=g.ids.includes(Number(row.player_id))?1:0;
   s.xiN++;s.baseXI+=(Number(row.xi_probability)-y)**2;
   s.trialXI+=(Number(other.xi_probability)-y)**2;
   if(y)s.selectedActualStarts++;
   const a=actual.get(k);
   if(!validActual(a)){
    if(a&&Number(a.minutes)===0)s.lowConfidenceZerosExcluded++;
    continue;
   }
   if(!finite(row.x_minutes)||!finite(other.x_minutes)||!finite(row.xfp)||!finite(other.xfp))continue;
   if(Number(row.x_minutes)>=30||Number(other.x_minutes)>=30){
    s.minutesN++;s.baseMin+=Math.abs(Number(row.x_minutes)-Number(a.minutes));
    s.trialMin+=Math.abs(Number(other.x_minutes)-Number(a.minutes));
    s.xfpN++;s.baseFP+=Math.abs(Number(row.xfp)-Number(a.points));
    s.trialFP+=Math.abs(Number(other.xfp)-Number(a.points));
   }
  }
 }
 const report=[...perWeek.entries()].sort(([a],[b])=>a-b)
   .map(([gameweek,s])=>({gameweek,...summarize(s)}));
 const qualified=report.filter(w=>w.xi_sample>=100&&w.minute_sample>=30&&
   w.xi_brier_gain>0&&w.minute_mae_gain>=0&&w.xfp_mae_gain>=0);
 return {mode:"shadow_only",write_mode:"read_only",auto_promote:false,
   source_policy:"closed_week;frozen_snapshot_before_first_kickoff;challenger_input_cutoff_lte_frozen;verified_full_team_XI",
   eligible_weeks:[...allowed].sort((a,b)=>a-b),blocked_weeks:blocked,
   compared_weeks:report.length,passing_weeks:qualified.length,
   ready_for_review:qualified.length>=2&&qualified.length===report.length&&blocked.length===0,
   per_week:report};
}
