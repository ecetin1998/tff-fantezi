const fs=require('node:fs')
const {simulateScout,simulateMatchProbabilities}=require('./simulateScout')
const {buildReplayInput,evaluateReplay,brierScore}=require('./replayAudit')

const [inputPath,outputPath,drawArg='50000',seedArg='20260927']=process.argv.slice(2)
if(!inputPath||!outputPath)throw Error('usage: node model/runReplayEvidence.js input.json output.json [draws] [seed]')
const payload=JSON.parse(fs.readFileSync(inputPath,'utf8'))
if(payload.error)throw Error(payload.error)
const draws=Number(drawArg),seed=Number(seedArg)
if(!Number.isInteger(draws)||draws<50000)throw Error('replay evidence requires >=50000 draws')

const candidateInput=buildReplayInput(payload,[])
const candidatePlayers=simulateScout(candidateInput,draws,seed,true)
const candidateMatchPred=simulateMatchProbabilities(candidateInput,draws,seed+991)

const baselineInput={
  rho:0,
  matches:(payload.matches||[]).map(m=>({
    match_id:Number(m.match_id),home_id:Number(m.home_team_id),away_id:Number(m.away_team_id),
    home_lambda:Number(m.home_lambda),away_lambda:Number(m.away_lambda)
  }))
}
const baselineMatchPred=simulateMatchProbabilities(baselineInput,draws,seed+1991)
const after=evaluateReplay(candidatePlayers,payload.actuals||[],payload.match_actuals||[],candidateMatchPred)
const before=payload.baseline_week||{}
const beforeBrier=brierScore(payload.match_actuals||[],new Map(baselineMatchPred.map(x=>[Number(x.match_id),x])))

const result={
  gameweek:Number(payload.meta?.gameweek||0),
  draws,
  source_benchmark:payload.source_benchmark,
  before_benchmark:payload.baseline_benchmark,
  candidate_benchmark:'model-v2-2026-09-27',
  before:{
    average_point_error:before.average_point_error==null?null:Number(before.average_point_error),
    ranking_alignment:before.ranking_alignment==null?null:Number(before.ranking_alignment),
    top25_hit_rate:before.top25_hit_rate==null?null:Number(before.top25_hit_rate),
    band_hit_rate:before.band_hit_rate==null?null:Number(before.band_hit_rate),
    average_minute_error:before.average_minute_error==null?null:Number(before.average_minute_error),
    brier_1x2:beforeBrier
  },
  after,
  deltas:{
    average_point_error:after.average_point_error-(Number(before.average_point_error)||0),
    ranking_alignment:after.ranking_alignment-(Number(before.ranking_alignment)||0),
    top25_hit_rate:after.top25_hit_rate-(Number(before.top25_hit_rate)||0),
    band_hit_rate:after.band_hit_rate-(Number(before.band_hit_rate)||0),
    average_minute_error:after.average_minute_error-(Number(before.average_minute_error)||0),
    brier_1x2:after.brier_1x2-beforeBrier
  }
}
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n')
console.log('REPLAY_RESULT='+JSON.stringify(result))
