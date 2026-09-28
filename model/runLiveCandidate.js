const fs=require('node:fs');
const {simulateScout}=require('./simulateScout');

const [inputPath,outputPath,drawArg='50000',seedArg='20260928']=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('usage: node model/runLiveCandidate.js input.json output.json [draws] [seed]');
const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
if(input.error)throw Error(input.error);
const draws=Number(drawArg),seed=Number(seedArg);
if(!Number.isInteger(draws)||draws<50000)throw Error('live candidate requires >=50000 draws');
if(!Array.isArray(input.players)||input.players.length===0)throw Error('player input missing');
if(!Array.isArray(input.matches)||input.matches.length===0)throw Error('match input missing');

const out=simulateScout(input,draws,seed,true);
const matchesByClub=new Map();
for(const m of input.matches){
  const h=Number(m.home_id),a=Number(m.away_id);
  if(!matchesByClub.has(h))matchesByClub.set(h,[]);
  if(!matchesByClub.has(a))matchesByClub.set(a,[]);
  matchesByClub.get(h).push({...m,venue:'HOME',opponent_id:a});
  matchesByClub.get(a).push({...m,venue:'AWAY',opponent_id:h});
}
const names=input.team_names||{};
const sourceById=new Map(input.players.map(p=>[Number(p.id),p]));
const projections=out.map(r=>{
  const src=sourceById.get(Number(r.id));
  const fixtures=matchesByClub.get(Number(src.club))||[];
  const first=fixtures[0]||{};
  const opponentNames=fixtures.map(x=>names[String(x.opponent_id)]||names[x.opponent_id]||String(x.opponent_id)).join(' / ');
  const price=Number(src.price)||0;
  const dc=String(src.confidence||src.data_confidence||'medium');
  const normalizedConfidence=/yüksek|high/i.test(dc)?'high':/düşük|low/i.test(dc)?'low':'medium';
  return {
    player_id:Number(r.id),
    opponent_name:opponentNames||'—',
    venue:first.venue||'HOME',
    xi_probability:Number(r.xi||0),
    appearance_probability:Number(r.play||0),
    over60_probability:Number(r.p60||0),
    x_minutes:Number(r.minutes||0),
    core_xfp:Number(r.core||0),
    x_bonus:Number(r.bonus||0),
    xfp:Number(r.xfp||0),
    p25:Number(r.p25||0),
    p75:Number(r.p75||0),
    p90:Number(r.p90||0),
    six_plus_probability:Number(r.p6||0),
    value_score:price>0?Number(r.xfp||0)/price:0,
    data_confidence:dc,
    role_note:[src.sub_role,src.role_side].filter(Boolean).join('/')||null,
    expected_goals:Number(r.xgoal||0),
    expected_assists:Number(r.xassist||0),
    mc_standard_error:Number(r.mc_se||0),
    availability_source:String(src.availability_source||'reviewed_live_snapshot'),
    availability_probability:Number(src.avail),
    confidence:normalizedConfidence
  };
});
const goalTotals=new Map(),assistTotals=new Map();
for(const p of projections){
  const src=sourceById.get(p.player_id);
  goalTotals.set(src.club,(goalTotals.get(src.club)||0)+p.expected_goals);
  assistTotals.set(src.club,(assistTotals.get(src.club)||0)+p.expected_assists);
}
const roleSignals=projections.map(p=>{
  const src=sourceById.get(p.player_id);
  const old=src.role_signal||{};
  return {
    player_id:p.player_id,
    last2_xi_probability:old.last2_xi_probability??null,
    previous2_xi_probability:old.previous2_xi_probability??null,
    last2_minutes:old.last2_minutes??null,
    previous2_minutes:old.previous2_minutes??null,
    signal:old.signal??'stable',
    predicted_xi_probability:p.xi_probability,
    x_minutes:p.x_minutes,
    team_goal_share:(goalTotals.get(src.club)||0)>0?p.expected_goals/goalTotals.get(src.club):0,
    team_assist_share:(assistTotals.get(src.club)||0)>0?p.expected_assists/assistTotals.get(src.club):0,
    availability_probability:p.availability_probability
  };
});
const result={
  meta:{draws,seed,source_run_id:input.meta?.source_run_id||null,gameweek:Number(input.meta?.gameweek||0),model_version:input.meta?.model_version||'ScoutPlus live candidate'},
  inputs:{
    players:input.players.map(p=>({
      player_id:Number(p.id),club_id:Number(p.club),position:String(p.pos),price:Number(p.price),
      availability:Number(p.avail),role_probability:Number(p.role),bench_weight:Number(p.benchw),
      durations:p.durations,duration_weights:p.duration_weights,rates:p.rates,
      data_confidence:String(p.confidence||p.data_confidence||'medium'),
      sub_role:p.sub_role||null,role_side:p.role_side||null,
      effective_xa_per90:p.effective_xa_per90??null,
      source_note:p.source_note||null
    })),
    matches:input.matches.map(m=>({
      match_id:Number(m.match_id),gameweek:Number(input.meta?.gameweek||0),
      home_team_id:Number(m.home_id),away_team_id:Number(m.away_id),
      home_lambda:Number(m.home_lambda),away_lambda:Number(m.away_lambda),
      kickoff_at:m.kickoff_at||null
    }))
  },
  projections,role_signals,
  availability:Array.isArray(input.availability_rows)?input.availability_rows:[]
};
fs.writeFileSync(outputPath,JSON.stringify(result)+'\n');
console.log(JSON.stringify({ok:true,players:projections.length,draws,gameweek:result.meta.gameweek}));
