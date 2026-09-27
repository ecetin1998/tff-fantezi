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
      sub_role:x.sub_role||x.fotmob_position||x.position_detail||null,
      rates:(()=>{const rates=(x.rates||[]).map(Number);if(Number.isFinite(Number(x.effective_xa_per90)))rates[3]=Number(x.effective_xa_per90);return rates})(),durations:(x.durations||[75]).map(Number),
      duration_weights:(x.duration_weights||[1]).map(Number),
      avail:Number(x.availability),role:Math.max(1e-7,Math.min(.9999999,Number(x.role_probability)||1e-7)),
      benchw:Math.max(1e-9,Number(x.bench_weight)||1e-9),valid_games:1,
    })),
    matches:matches.map(m=>({
      match_id:Number(m.match_id||0),home_id:Number(m.home_team_id),away_id:Number(m.away_team_id),
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

function priceBand(price){
  const p=Number(price||0);
  return p<=5?'<=5':p<8?'5-8':'8+';
}

function biasByPositionPrice(out,actuals){
  const byId=new Map(out.map(x=>[Number(x.id),x]));
  const groups=new Map();
  for(const actual of actuals||[]){
    const pred=byId.get(Number(actual.player_id));
    if(!pred)continue;
    const key=String(pred.pos||'UNK')+'|'+priceBand(pred.price);
    const row=groups.get(key)||{position:String(pred.pos||'UNK'),price_band:priceBand(pred.price),sample:0,bias:0,mae:0};
    const err=Number(pred.xfp||0)-Number(actual.points||0);
    row.sample++;row.bias+=err;row.mae+=Math.abs(err);groups.set(key,row);
  }
  return [...groups.values()].map(row=>({...row,bias:row.bias/row.sample,mae:row.mae/row.sample}))
    .sort((a,b)=>a.position.localeCompare(b.position)||a.price_band.localeCompare(b.price_band));
}

function defenderContributionFlags(rows,tolerance=.75){
  const defs=(rows||[]).filter(r=>r.pos==='DEF');
  const flags=[];
  for(let a=0;a<defs.length;a++)for(let b=a+1;b<defs.length;b++){
    const x=defs[a],y=defs[b];
    if(Number(x.club)!==Number(y.club))continue;
    if(Math.abs(Number(x.minutes||0)-Number(y.minutes||0))>3)continue;
    if(Math.abs(Number(x.xi||0)-Number(y.xi||0))>.05)continue;
    const expected=(Number(x.xgoal||0)-Number(y.xgoal||0))*6
      +(Number(x.xassist||0)-Number(y.xassist||0))*3
      +(Number(x.bonus||0)-Number(y.bonus||0));
    const actual=Number(x.xfp||0)-Number(y.xfp||0);
    const residual=actual-expected;
    if(Math.abs(residual)>tolerance)flags.push({a:x.id,b:y.id,club:x.club,actual,expected,residual});
  }
  return flags;
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
    bias_by_position_price:biasByPositionPrice(out,rows),
    unexplained_same_team_def_xfp: defenderContributionFlags(out).length,
  }
}

module.exports={buildReplayInput,evaluateReplay,biasByPositionPrice,defenderContributionFlags,priceBand}
