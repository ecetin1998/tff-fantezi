function buildReplayInput(payload,playerMatches=[]){
  const meta=payload.meta||{}
  const forms=meta.team_formations||meta.formations||{}
  const players=(payload.players||[]).slice().sort((a,b)=>Number(a.player_id)-Number(b.player_id))
  const matches=(payload.matches||[]).slice().sort((a,b)=>Number(a.match_id||0)-Number(b.match_id||0))
  const history=(playerMatches||[]).slice().sort((a,b)=>
    Number(a.id)-Number(b.id) || Number(a.gw||0)-Number(b.gw||0)
  )
  const clubs=[...new Set(matches.flatMap(m=>[Number(m.home_team_id),Number(m.away_team_id)]).filter(Number.isFinite))].sort((a,b)=>a-b)
  return {
    players:players.map(x=>({
      id:Number(x.player_id),club:Number(x.club_id),pos:String(x.position),price:Number(x.price||0),
      rates:(x.rates||[]).map(Number),durations:(x.durations||[75]).map(Number),
      duration_weights:(x.duration_weights||[1]).map(Number),
      avail:Number(x.availability),role:Math.max(1e-7,Math.min(.9999999,Number(x.role_probability)||1e-7)),
      benchw:Math.max(1e-9,Number(x.bench_weight)||1e-9),valid_games:1,
    })),
    matches:matches.map(m=>({
      home_id:Number(m.home_team_id),away_id:Number(m.away_team_id),
      home_lambda:Number(m.home_lambda),away_lambda:Number(m.away_lambda),
    })),
    team_checks:clubs.map(club=>({club,formation:forms[String(club)]||{GK:1,DEF:4,MID:5,FWD:1}})),
    temperature:Number(meta.temperature||1.7),
    assist_fraction:Number(meta.assist_fraction||.7),
    own_fraction:Number(meta.own_goal_fraction||0),
    playerMatches:history,
  }
}

function tiedRanks(vals){
  const n=vals.length,z=vals.map((v,i)=>[Number(v),i]).sort((a,b)=>a[0]-b[0]),r=Array(n)
  for(let s=0;s<n;){
    let e=s+1
    while(e<n&&z[e][0]===z[s][0])e++
    const q=(s+e-1)/2+1
    for(let j=s;j<e;j++)r[z[j][1]]=q
    s=e
  }
  return r
}

function rankCorrelation(x,y){
  const n=x.length
  if(n<2)return null
  const rx=tiedRanks(x),ry=tiedRanks(y),mx=rx.reduce((a,b)=>a+b,0)/n,my=ry.reduce((a,b)=>a+b,0)/n
  let num=0,dx=0,dy=0
  for(let i=0;i<n;i++){const a=rx[i]-mx,b=ry[i]-my;num+=a*b;dx+=a*a;dy+=b*b}
  return dx&&dy?num/Math.sqrt(dx*dy):null
}

function evaluateReplay(out,actuals){
  const byId=new Map(out.map(x=>[Number(x.id),x]))
  const rows=(actuals||[]).filter(x=>byId.has(Number(x.player_id)))
  const n=rows.length
  if(!n)return {player_sample:0}
  const topPred=rows.slice().sort((a,b)=>byId.get(Number(b.player_id)).xfp-byId.get(Number(a.player_id)).xfp).slice(0,25)
  const topActual=new Set(rows.slice().sort((a,b)=>Number(b.points)-Number(a.points)).slice(0,25).map(x=>Number(x.player_id)))
  return {
    player_sample:n,
    average_point_error:rows.reduce((s,x)=>s+Math.abs(byId.get(Number(x.player_id)).xfp-Number(x.points)),0)/n,
    ranking_alignment:rankCorrelation(rows.map(x=>byId.get(Number(x.player_id)).xfp),rows.map(x=>Number(x.points))),
    top25_hit_rate:topPred.filter(x=>topActual.has(Number(x.player_id))).length/25,
    average_minute_error:rows.reduce((s,x)=>s+Math.abs(byId.get(Number(x.player_id)).minutes-Number(x.minutes||0)),0)/n,
    band_hit_rate:rows.filter(x=>{const r=byId.get(Number(x.player_id)),v=Number(x.points);return v>=r.p25&&v<=r.p90}).length/n,
  }
}

module.exports={buildReplayInput,evaluateReplay}
