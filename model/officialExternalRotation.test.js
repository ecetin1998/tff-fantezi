const assert=require('node:assert/strict')
const fs=require('node:fs')
;(async ()=>{
  const {applyOfficialMinutesEvidence:calc}=await import('../supabase/functions/weekly-model-lifecycle/externalRole.mjs')
  const kickoff='2026-10-17T13:00:00Z'
  const played=(minutes,started=true,competition='UEFA_CL')=>({
    match_ref:'uefa-ucl-2026-2049576',minutes,started,
    squad_status:started?'started':minutes>0?'substitute':'unused',
    competition,finished_at:'2026-10-13T21:00:00Z',
    source_url:'https://www.uefa.com/news-media/mediaservices/informationkits/competitions/uefachampionsleague/2027/match/2049576/'
  })
  const os=calc({
    baseline:.1318777777,durations:[13,1],durationWeights:[.5555555556,.4444444444],
    fixtureKickoff:kickoff,availability:1,evidence:played(90)
  })
  const deniz=calc({
    baseline:.7825666667,durations:[77,46],durationWeights:[.5555555556,.4444444444],
    fixtureKickoff:kickoff,availability:1,
    evidence:played(0,false),sameSlotStarter:true
  })
  assert.equal(os.applied,true)
  assert.equal(deniz.applied,true)
  assert(os.role>.70,'Verified full 90 after injury must outweigh older 13/1-min league cameos')
  assert(deniz.role<.56,'Direct unused striker competitor should lose some lineup weight')
  assert(os.role>deniz.role,'UEFA full 90-minute starter should leapfrog unused direct striker backup')
  assert.equal(os.durations[0],90)
  assert(os.duration_weights[0]>.70,'Verified 90 minutes informs expected duration, not just XI')
  assert(Math.abs(os.duration_weights.reduce((a,b)=>a+b,0)-1)<1e-9)
  assert.deepEqual(deniz.durations,[77,46],'Unused cup substitute does not invent new played minutes')

  const cupUnrelated=calc({
    baseline:.7825666667,durations:[77,46],durationWeights:[.56,.44],
    fixtureKickoff:kickoff,availability:1,evidence:played(0,false),sameSlotStarter:false
  })
  assert.equal(cupUnrelated.applied,false,'Non-conflicting unused subs are not evidence of being benched next league match')
  const suspended=calc({
    baseline:.1318,durations:[13,1],fixtureKickoff:kickoff,
    evidence:played(90),availability:0
  })
  assert.equal(suspended.applied,false,'External appearance never bypasses an active suspension or injury hard zero')

  const ancient=calc({
    baseline:.1318,durations:[13,1],fixtureKickoff:'2026-11-20T14:00:00Z',availability:1,evidence:played(90)
  })
  assert.equal(ancient.applied,false,'Source must expire before 21 days')
  const future=calc({
    baseline:.1318,durations:[13,1],fixtureKickoff:'2026-10-12T14:00:00Z',availability:1,evidence:played(90)
  })
  assert.equal(future.applied,false,'Future and post-kickoff match records must not leak into predictions')
  const national=calc({
    baseline:.1318,durations:[13,1],fixtureKickoff:kickoff,availability:1,
    evidence:played(90,true,'NATIONAL_TEAM')
  })
  assert(national.role<os.role,'National-team starts must not overrule club team selection as strongly')
  const shortRest=calc({
    baseline:.1318,durations:[13,1],availability:1,
    fixtureKickoff:'2026-10-15T13:00:00Z',evidence:played(90)
  })
  assert(shortRest.role<os.role,'Congested match rest reduces expected rotation boost')
  const invalid=calc({
    baseline:.1318,durations:[13,1],availability:1,fixtureKickoff:kickoff,
    evidence:{...played(90),source_url:'not-a-source'}
  })
  assert.equal(invalid.applied,false,'Require source URL for official evidence')
  const worker=fs.readFileSync('supabase/functions/weekly-model-lifecycle/index.ts','utf8')
  assert.match(worker,/officialEvidenceQuery\(sb\)/,'Both run preparation paths must ingest official minutes')
  assert.match(worker,/officialMatchEvidence\(officialQ\.data\|\|\[\]/)
  assert.match(worker,/applyOfficialMinutesEvidence\(/)
  assert.match(worker,/stableRoleMap/,'Intraday refresh must avoid feeding simulation outputs into inputs')
  assert.match(worker,/officialSourceLatest/,'Official external match should trigger predeadline refresh')
  assert.match(worker,/durations:stableInput\.durations,durationWeights:stableInput\.duration_weights/,
    'Official source must always be applied to weekly stable baseline, not prior modified intraday durations.')
  assert.match(worker,/duration_weights:adjusted\.applied\?adjusted\.duration_weights:x\.duration_weights/,
    'The current inputs should change only when authenticated official source is applied.')
  const again=calc({
    baseline:.1318777777,durations:[13,1],durationWeights:[.5555555556,.4444444444],
    fixtureKickoff:kickoff,availability:1,evidence:played(90)
  })
  assert.deepEqual(again.durations,os.durations,
    'Rechecking same official match against stable baseline must not create two 90-minute observations.')
  assert.deepEqual(again.duration_weights,os.duration_weights,
    'Official source weights should remain identical across all intraday candidate reruns.')
  assert.match(worker,/teamKickoffs\.get\(Number\(p\.team_id\)\)/,
    'Next-week rest days must use this club\'s first match, not the global league kickoff.')
  assert.match(worker,/targetKickoffs\.get\(Number\(x\.club_id\)\)/,
    'Intraday evidence must use each team\'s actual match, not the earliest fixture.')
  assert.match(worker,/signal:\(\(\)=>\{/,'Intraday refresh must update visible role signal provenance.')

  assert.doesNotMatch(worker,/officialShift\.xfp|officialShift\.rates/,'Do not inject external Fantasy scoring into league expectations')
  const ddl=fs.readFileSync('supabase/migrations/20261014215000_official_external_match_appearances.sql','utf8')
  assert.match(ddl,/enable row level security/i)
  assert.match(ddl,/revoke all .* from anon, authenticated/i)
  assert.match(ddl,/uefa-ucl-2026-2049576/)
  assert.match(ddl,/1405,'unused',false,0/)
  assert.match(ddl,/507,'started',true,90/)
  console.log('Official competitive match rotation evidence QA passed')
})().catch(error=>{console.error(error);process.exitCode=1})
