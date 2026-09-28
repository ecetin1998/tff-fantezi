const fs=require('node:fs');
const {simulateScout}=require('./simulateScout');

const [inputPath,outputPath,drawArg='50000',seedArg='20260928']=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('usage: node model/runLiveReplayEvidence.js input.json output.json [draws] [seed]');
const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'));
if(payload.error)throw Error(payload.error);
const draws=Number(drawArg),seed=Number(seedArg);
if(!Number.isInteger(draws)||draws<50000)throw Error('release replay requires >=50000 draws');

const players=(payload.players||[]).map(x=>({
  id:Number(x.player_id),club:Number(x.club_id),pos:String(x.position),price:Number(x.price||0),
  avail:Number(x.availability),role:Number(x.role_probability||0),
  benchw:Math.max(1e-9,Number(x.bench_weight)||1e-9),
  durations:(x.durations||[75]).map(Number),duration_weights:(x.duration_weights||[1]).map(Number),
  rates:(x.rates||[]).map(Number),confidence:String(x.data_confidence||'medium'),valid_games:1
}));
const forms=payload.meta?.team_formations||payload.meta?.formations||{};
const matches=(payload.matches||[]).map(m=>({
  match_id:Number(m.match_id),home_id:Number(m.home_team_id),away_id:Number(m.away_team_id),
  home_lambda:Number(m.home_lambda),away_lambda:Number(m.away_lambda)
}));
const clubs=[...new Set(matches.flatMap(m=>[m.home_id,m.away_id]))];
const input={
  players,matches,team_checks:clubs.map(club=>({club,formation:forms[String(club)]||{GK:1,DEF:4,MID:5,FWD:1}})),
  temperature:Number(payload.meta?.temperature||1.7),
  assist_fraction:Number(payload.meta?.assist_fraction||.7),
  own_fraction:Number(payload.meta?.own_goal_fraction||0),
  playerMatches:[]
};
const out=simulateScout(input,draws,seed,true);
const byId=new Map(out.map(x=>[Number(x.id),x]));
const actual=(payload.actuals||[]).filter(x=>byId.has(Number(x.player_id)));
function tiedRanks(vals){const n=vals.length,z=vals.map((v,i)=>[Number(v),i]).sort((a,b)=>a[0]-b[0]),r=Array(n);for(let s=0;s<n;){let e=s+1;while(e<n&&z[e][0]===z[s][0])e++;const q=(s+e-1)/2+1;for(let j=s;j<e;j++)r[z[j][1]]=q;s=e}return r}
function corr(x,y){if(x.length<2)return null;const rx=tiedRanks(x),ry=tiedRanks(y),mx=rx.reduce((a,b)=>a+b,0)/rx.length,my=ry.reduce((a,b)=>a+b,0)/ry.length;let num=0,dx=0,dy=0;for(let i=0;i<rx.length;i++){const a=rx[i]-mx,b=ry[i]-my;num+=a*b;dx+=a*a;dy+=b*b}return dx&&dy?num/Math.sqrt(dx*dy):null}
const predTop=actual.slice().sort((a,b)=>byId.get(Number(b.player_id)).xfp-byId.get(Number(a.player_id)).xfp).slice(0,25);
const actualTop=new Set(actual.slice().sort((a,b)=>Number(b.points)-Number(a.points)).slice(0,25).map(x=>Number(x.player_id)));
const metrics={
  player_sample:actual.length,
  average_point_error:actual.reduce((s,x)=>s+Math.abs(byId.get(Number(x.player_id)).xfp-Number(x.points)),0)/actual.length,
  ranking_alignment:corr(actual.map(x=>byId.get(Number(x.player_id)).xfp),actual.map(x=>Number(x.points))),
  top25_hit_rate:predTop.filter(x=>actualTop.has(Number(x.player_id))).length/25,
  average_minute_error:actual.reduce((s,x)=>s+Math.abs(byId.get(Number(x.player_id)).minutes-Number(x.minutes||0)),0)/actual.length,
  band_hit_rate:actual.filter(x=>{const r=byId.get(Number(x.player_id)),v=Number(x.points);return v>=r.p25&&v<=r.p90}).length/actual.length
};
const b=payload.baseline_week||{};
const limits={
  average_point_error:Number(b.average_point_error)+.10,
  ranking_alignment:Number(b.ranking_alignment)-.03,
  top25_hit_rate:Number(b.top25_hit_rate)-.04,
  average_minute_error:Number(b.average_minute_error)+1,
  band_hit_rate:Number(b.band_hit_rate)-.05
};
const pass=metrics.average_point_error<=limits.average_point_error &&
  metrics.ranking_alignment>=limits.ranking_alignment &&
  metrics.top25_hit_rate>=limits.top25_hit_rate &&
  metrics.average_minute_error<=limits.average_minute_error &&
  metrics.band_hit_rate>=limits.band_hit_rate;
const result={
  pass,gameweek:Number(payload.meta?.gameweek||0),draws,seed,
  evidence_scope:'time-safe core-engine replay; current role/xA enrichment is not backfilled into historical inputs',
  baseline_benchmark:payload.baseline_benchmark,source_benchmark:payload.source_benchmark,
  baseline:{
    average_point_error:Number(b.average_point_error),ranking_alignment:Number(b.ranking_alignment),
    top25_hit_rate:Number(b.top25_hit_rate),average_minute_error:Number(b.average_minute_error),
    band_hit_rate:Number(b.band_hit_rate)
  },metrics,limits
};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log('REPLAY_RESULT='+JSON.stringify(result));
if(!pass)process.exitCode=2;
