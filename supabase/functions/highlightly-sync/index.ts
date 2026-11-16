// Fantezi Lig Rehberi: Highlightly supplementary source, free-tier quota-controlled.
// GitHub/Supabase integration is kept private and is *not* an official fantasy scorer.
// Input: scheduled x-sync-auth secret from Vault; never publish this secret or provider key.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const SEASON = "2026-27";
const LEAGUE = 173537;
const BASE = "https://soccer.highlightly.net";
const TABLE_MATCH = "scout_highlightly_matches";
const HEADER = "x-sync-auth";
const source = "highlightly";
const normalized = value => String(value ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ı/g, "i")
  .replace(/[^a-z0-9]/g, "");
const ids = {
  trabzonspor:1, erzurumspor:2, erzurumbb:2, kasimpasa:3,
  kocaelispor:4, kocaelisporfk:4, amed:5, fenerbahce:6,
  konyaspor:7, corumfk:8, yenicorumspor:8, corumspor:8,
  besiktas:9, goztepe:10, genclerbirligi:11, rizespor:12,
  basaksehir:13, istanbulbasaksehir:13, alanyaspor:14,
  samsunspor:15, eyupspor:16, galatasaray:17,
  gaziantep:18, gaziantepfk:18, gazisehirgaziantep:18
};
const teamId = name => ids[normalized(name)] ?? null;
const optionalNumber = v => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const optionalInt = v => {
  const num = optionalNumber(v);
  return num === null ? null : Math.max(0,Math.trunc(num));
};
const signedInt = v => {
  const num = optionalNumber(v);
  return num === null ? null : Math.trunc(num);
};
const millis = date => Date.parse(date || "");
const json = (obj,status=200) => new Response(JSON.stringify(obj), {
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const clock = () => new Date().toISOString();
const utcDay = () => clock().slice(0,10);
function assert(error,ctx) { if (error) throw new Error(ctx+": "+error.message) }
function uniqueMatch(player, candidates) {
  const matches = new Set([normalized(player.name),normalized(player.fullName)].filter(Boolean));
  const exact = candidates.filter(p =>
    [p.full_name,p.display_name,p.short_label].some(n=>matches.has(normalized(n))));
  if(exact.length === 1) return exact[0].id;
  // A jersey match alone is unsafe after transfers. Require corroborating name evidence.
  const shirt = optionalInt(player.shirtNumber);
  if (shirt===null) return null;
  const byShirt = candidates.filter(p=>p.shirt_number===shirt);
  if (byShirt.length!==1) return null;
  const candidate = byShirt[0];
  const names = [candidate.full_name,candidate.display_name,candidate.short_label]
    .map(normalized).filter(x=>x.length>=4);
  return names.some(n=>[...matches].some(pn=>pn.includes(n)||n.includes(pn))) ? candidate.id : null;
}
async function sha256(value) {
  const raw = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(raw)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function equalHash(a,b) {
  if (!a || !b || a.length!==b.length) return false;
  let bad=0; for(let i=0;i<a.length;i++) bad|=a.charCodeAt(i)^b.charCodeAt(i);
  return bad===0;
}
async function getData(sb,table,cols="*") {
  const {data,error} = await sb.from(table).select(cols).limit(1000);
  assert(error,"READ_"+table);
  return data || [];
}
async function main(req) {
  if(req.method!=="POST") return json({error:"not found"},404);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const endpoint = Deno.env.get("SUPABASE_URL");
  const apiKey = Deno.env.get("HIGHLIGHTLY_API_KEY");
  if(!serviceKey||!endpoint||!apiKey) return json({error:"not configured"},503);
  const sb = createClient(endpoint, serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const config = await getData(sb,"scout_highlightly_sync_control");
  const c = config.find(x=>x.id===1);
  const supplied=req.headers.get(HEADER)||"";
  if (!supplied || !c || !equalHash(await sha256(supplied),c.auth_sha256))
    return json({error:"not found"},404);

  const leaseId = crypto.randomUUID(), today=utcDay(),now=clock();
  const leaseEnd=new Date(Date.now()+150000).toISOString();
  const lock=await sb.from("scout_highlightly_sync_control")
    .update({lease_owner:leaseId,lease_until:leaseEnd,updated_at:now,last_attempt_at:now})
    .eq("id",1).or("lease_until.is.null,lease_until.lt."+now).select().maybeSingle();
  assert(lock.error,"ACQUIRE_LEASE");
  if (!lock.data) return json({status:"already_running"});
  let used = lock.data.quota_day===today ? lock.data.requests_used : 0;
  let remaining = lock.data.quota_day===today ? lock.data.provider_remaining : null;
  let processed=0,mapped=0,failures=[],mappedUnknown=[],providerRequests=0;
  const budget = lock.data.daily_budget;
  async function recordQuota() {
    const {error}=await sb.from("scout_highlightly_sync_control")
      .update({quota_day:today,requests_used:used,provider_remaining:remaining,updated_at:clock()})
      .eq("id",1).eq("lease_owner",leaseId);
    assert(error,"SAVE_QUOTA");
  }
  async function provider(path) {
    if(used>=budget || remaining!==null && remaining<=10)
      throw new Error("DAILY_QUOTA_GUARD");
    // Charge before external fetch so request failures still count.
    used++; providerRequests++; await recordQuota();
    const res=await fetch(BASE+path,{
      headers:{"x-rapidapi-key":apiKey,"accept":"application/json"},
      signal:AbortSignal.timeout(12000)
    });
    const header=res.headers.get("x-ratelimit-requests-remaining");
    if(header!==null && Number.isInteger(Number(header)))remaining=Number(header);
    await recordQuota();
    if(res.status===429)throw new Error("PROVIDER_QUOTA_429");
    if(!res.ok)throw new Error("PROVIDER_HTTP_"+res.status+"_"+path.split("?")[0]);
    return res.json();
  }
  async function upsert(table,rows,onConflict) {
    if(!rows.length) return;
    for(let i=0;i<rows.length;i+=80){
      const {error}=await sb.from(table).upsert(rows.slice(i,i+80),{onConflict});
      assert(error,"WRITE_"+table);
    }
  }
  try {
    await recordQuota();
    const history = await getData(sb,"scout_match_history",
      "season,gameweek,match_id,kickoff_at,home_team_id,away_team_id,home_team_name,away_team_name,home_goals,away_goals,match_status");
    const finished=history.filter(x=>x.season===SEASON&&x.match_status==="Bitti");
    const registered=await getData(sb,TABLE_MATCH);
    const exists = new Set(registered.map(x=>Number(x.match_id)));
    const missing=finished.filter(x=>!exists.has(Number(x.match_id)));

    if(missing.length && used+3<=budget && (remaining===null||remaining>13)) {
      const fixtures=[];
      for(const offset of [0,100,200]){
        const res=await provider("/matches?leagueId="+LEAGUE+"&season=2026&limit=100&offset="+offset);
        if (!Array.isArray(res.data)) throw new Error("FIXTURE_SHAPE_ERROR");
        fixtures.push(...res.data);
      }
      const newRows=[];
      const externalRows=[];
      const encountered=new Set();
      for(const h of missing) {
        const candidates=fixtures.filter(f=>
          Number((String(f.round||"").match(/(\d+)$/)||[])[1])===Number(h.gameweek) &&
          teamId(f.homeTeam?.name)===Number(h.home_team_id) &&
          teamId(f.awayTeam?.name)===Number(h.away_team_id) &&
          Number.isFinite(millis(f.date)) &&
          Number.isFinite(millis(h.kickoff_at)) &&
          Math.abs(millis(f.date)-millis(h.kickoff_at))<=18*3600*1000);
        if (candidates.length!==1 || encountered.has(candidates[0]?.id)) {
          mappedUnknown.push({matchId:h.match_id,week:h.gameweek,
            reason:candidates.length===0?"NO_PROVIDER_FIXTURE":"AMBIGUOUS_PROVIDER_FIXTURE"});
          continue;
        }
        const f=candidates[0];encountered.add(f.id);
        if(f.state?.description!=="Finished") {
          mappedUnknown.push({matchId:h.match_id,week:h.gameweek,reason:"PROVIDER_NOT_FINAL"});
          continue;
        }
        newRows.push({
          season:SEASON,gameweek:h.gameweek,match_id:h.match_id,provider_match_id:f.id,
          home_team_id:h.home_team_id,away_team_id:h.away_team_id,
          provider_home_name:f.homeTeam.name,provider_away_name:f.awayTeam.name,
          kickoff_at:f.date,provider_status:"Finished"
        });
        externalRows.push({
          season:SEASON,gameweek:h.gameweek,internal_match_id:h.match_id,
          source,external_match_id:f.id,source_url:BASE+"/matches/"+f.id,verified_at:clock()
        });
      }
      await upsert(TABLE_MATCH,newRows,"season,match_id");
      // The existing identity map has unique (season, internal_match_id, source).
      await upsert("scout_match_external_ids",externalRows,"season,internal_match_id,source");
      registered.push(...newRows.map(r=>({
        ...r,box_done:false,stats_done:false,lineups_done:false
      })));
      mapped=newRows.length;
    }

    const players=await getData(sb,"scout_players",
      "id,team_id,full_name,display_name,short_label,shirt_number,active");
    const activeByTeam=new Map();
    for(const p of players){
      if(!activeByTeam.has(p.team_id))activeByTeam.set(p.team_id,[]);
      activeByTeam.get(p.team_id).push(p);
    }
    const legacyMap=new Map();
    // Initial known provider identity mappings are stable across matches, but verify team as well.
    const mapRows=await getData(sb,"scout_highlightly_player_matches",
      "provider_player_id,player_id,team_id");
    for(const x of mapRows)if(x.player_id!=null) {
      const id=Number(x.provider_player_id), value=Number(x.player_id),club=Number(x.team_id);
      if(!legacyMap.has(id))legacyMap.set(id,{value,club});
      else if(legacyMap.get(id).value!==value || legacyMap.get(id).club!==club)
        legacyMap.set(id,{value:null,club:null});
    }

    const toProcess=registered
      .filter(x=>finished.some(h=>Number(h.match_id)===Number(x.match_id)))
      .filter(x=>!x.box_done || !x.stats_done || !x.lineups_done)
      .sort((a,b)=>Number(b.gameweek)-Number(a.gameweek)||Number(a.match_id)-Number(b.match_id))
      .slice(0,7);
    for(const m of toProcess) {
      if(used>=budget || remaining!==null && remaining<=10)break;
      const pid=m.provider_match_id,matchId=m.match_id,week=m.gameweek;
      const sideIds=new Set([Number(m.home_team_id),Number(m.away_team_id)]);
      const patch={updated_at:clock(),last_error:null};
      try {
        if(!m.box_done) {
          const box=await provider("/box-score/"+pid);
          if(!Array.isArray(box)||box.length!==2)throw new Error("INVALID_BOX_TEAM_COUNT");
          const rows=[];
          const observedTeams=new Set();
          for(const side of box){
            const club=teamId(side.team?.name);
            if(!sideIds.has(club) || observedTeams.has(club))throw new Error("INVALID_BOX_TEAM_ID");
            observedTeams.add(club);
            const roster=side.players;
            if(!Array.isArray(roster)||roster.length<11)throw new Error("INVALID_BOX_ROSTER");
            for(const p of roster) {
              if(!Number.isInteger(Number(p.id)) || !p.name)throw new Error("INVALID_BOX_PLAYER");
              const v=p.statistics??{};
              const known=legacyMap.get(Number(p.id));
              const resolved=known?.club===club && known?.value!=null
                ?known.value:uniqueMatch(p,activeByTeam.get(club)||[]);
              rows.push({
                season:SEASON,gameweek:week,match_id:matchId,
                provider_player_id:Number(p.id),provider_team_id:side.team?.id??null,
                team_id:club,player_id:resolved,player_name:p.fullName||p.name,
                shirt_number:optionalInt(p.shirtNumber),registered_position:p.position??null,
                is_substitute:p.isSubstitute??null,minutes:optionalInt(p.minutesPlayed),
                goals:optionalInt(v.goalsScored),assists:optionalInt(v.assists),
                saves:optionalInt(v.goalsSaved),yellow_cards:optionalInt(v.cardsYellow),
                red_cards:optionalInt(v.cardsRed),shots:optionalInt(v.shotsTotal),
                shots_on_target:optionalInt(v.shotsOnTarget),key_passes:optionalInt(v.passesKey),
                dribbles:optionalInt(v.dribblesTotal),successful_dribbles:optionalInt(v.dribblesSuccessful),
                xg:optionalNumber(v.expectedGoals),xa:optionalNumber(v.expectedAssists),
                metrics:v,observed_at:clock()
              });
            }
          }
          if(rows.length<34)throw new Error("INVALID_BOX_ROSTER_TOTAL");
          await upsert("scout_highlightly_player_matches",rows,"season,match_id,provider_player_id");
          patch.box_done=true;patch.box_updated_at=clock();
          for(const row of rows)if(row.player_id!=null){
            if(!legacyMap.has(row.provider_player_id))
              legacyMap.set(row.provider_player_id,{value:row.player_id,club:row.team_id});
          }
        }
        if(!m.stats_done) {
          const stats=await provider("/statistics/"+pid);
          if(!Array.isArray(stats)||stats.length!==2)throw new Error("INVALID_STATS_TEAM_COUNT");
          const rows=stats.map(t=>{
            const club=teamId(t.team?.name);
            if(!sideIds.has(club))throw new Error("INVALID_STATS_TEAM");
            const metrics=Array.isArray(t.statistics)?t.statistics:[];
            const byName = n => metrics.find(v=>v.displayName===n)?.value??null;
            return {
              season:SEASON,gameweek:week,match_id:matchId,team_id:club,
              provider_team_id:t.team?.id??null,
              xg:optionalNumber(byName("Expected Goals")),
              xa:optionalNumber(byName("Expected Assists")),
              shots:optionalInt(byName("Shots")),
              shots_on_target:optionalInt(byName("Shots on target")),
              big_chances:optionalInt(byName("Big Chances Created")),
              key_passes:optionalInt(byName("Key Passes")),
              possession:optionalNumber(byName("Possession")),
              crosses:optionalInt(byName("Crosses")),
              successful_crosses:optionalInt(byName("Successful Crosses")),
              dribbles:optionalInt(byName("Dribbles")),
              successful_dribbles:optionalInt(byName("Successful Dribbles")),
              statistics:Object.fromEntries(metrics.filter(x=>typeof x.displayName==="string")
                .map(x=>[x.displayName,x.value])),observed_at:clock()
            };
          });
          if(new Set(rows.map(x=>x.team_id)).size!==2 || rows.some(x=>x.xg===null))
            throw new Error("TEAM_ADVANCED_INCOMPLETE");
          await upsert("scout_highlightly_team_matches",rows,"season,match_id,team_id");
          patch.stats_done=true;patch.stats_updated_at=clock();
        }
        if(!m.lineups_done) {
          const lineups=await provider("/lineups/"+pid);
          const rows=["homeTeam","awayTeam"].map(field=>{
            const team=lineups?.[field],club=teamId(team?.name);
            if(!sideIds.has(club))throw new Error("INVALID_LINEUP_TEAM");
            const grid=Array.isArray(team.initialLineup)?team.initialLineup:[];
            const starters=grid.reduce((sum,g)=>sum+(Array.isArray(g)?g.length:0),0);
            if(starters!==11)throw new Error("INVALID_LINEUP_STARTERS_"+starters);
            return {season:SEASON,gameweek:week,match_id:matchId,team_id:club,
              provider_team_id:team.id??null,formation:team.formation??null,
              starter_count:starters,lineup:{
                initialLineup:grid,substitutes:team.substitutes??[],
                formation:team.formation??null
              },observed_at:clock()};
          });
          if(new Set(rows.map(x=>x.team_id)).size!==2)throw new Error("DUPLICATE_LINEUP_TEAMS");
          await upsert("scout_highlightly_lineups",rows,"season,match_id,team_id");
          patch.lineups_done=true;patch.lineups_updated_at=clock();
        }
        if(patch.box_done||patch.stats_done||patch.lineups_done)processed++;
        const {error}=await sb.from(TABLE_MATCH).update(patch)
          .eq("season",SEASON).eq("match_id",matchId);
        assert(error,"MARK_DONE");
      }catch(e) {
        const msg=String(e?.message||e).slice(0,220);
        failures.push({match_id:matchId,week,error:msg});
        await sb.from(TABLE_MATCH).update({...patch,last_error:msg})
          .eq("season",SEASON).eq("match_id",matchId);
        if(msg.includes("QUOTA")||msg.includes("PROVIDER_HTTP_401")||msg.includes("PROVIDER_HTTP_403"))break;
      }
    }

    const {error:finishErr}=await sb.from("scout_highlightly_sync_control").update({
      last_success_at:clock(),last_error:failures[0]?.error ||
        (mappedUnknown.length?"UNMAPPED_MATCHES_"+mappedUnknown.length:null),
      updated_at:clock()
    }).eq("id",1).eq("lease_owner",leaseId);
    assert(finishErr,"FINISH");
    return json({
      status:"ok",mapped,unmapped_count:mappedUnknown.length,
      mappedUnknown:mappedUnknown.slice(0,12),processed,providerRequests,
      provider_remaining:remaining,requests_integration_today:used,budget,
      failures:failures.slice(0,8),published_model_unchanged:true
    });
  }catch(e){
    const msg=String(e?.message||e).slice(0,220);
    await sb.from("scout_highlightly_sync_control").update({last_error:msg,updated_at:clock()})
      .eq("id",1).eq("lease_owner",leaseId);
    return json({status:"failed",error:msg,providerRequests,
      provider_remaining:remaining,requests_integration_today:used},500);
  }finally{
    await sb.from("scout_highlightly_sync_control").update({
      lease_owner:null,lease_until:null,updated_at:clock()
    }).eq("id",1).eq("lease_owner",leaseId);
  }
}
Deno.serve(main);
