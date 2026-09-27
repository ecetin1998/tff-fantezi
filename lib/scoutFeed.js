import {getAvailability,getMatches,getPlayersWithProjection,getRecommendation} from '@/lib/data'

export const SCOUT_FEED_SCHEMA_VERSION='2.0'
export const SCOUT_FEED_SECTIONS=Object.freeze(['all','summary','players','matches','squads','availability','roles','weekly','performance'])

export function scoutFeedMatchRow(m){
  return {
    match_id:m.match_id,
    kickoff_at:m.kickoff_at,
    home_team_id:m.home_team_id,
    away_team_id:m.away_team_id,
    home_team:m.home_team,
    away_team:m.away_team,
    home_xg:Number(m.home_xg||0),
    away_xg:Number(m.away_xg||0),
    home_win_probability:Number(m.home_win_probability||0),
    draw_probability:Number(m.draw_probability||0),
    away_win_probability:Number(m.away_win_probability||0),
    home_cs_probability:Number(m.home_cs_probability||0),
    away_cs_probability:Number(m.away_cs_probability||0)
  }
}

function compactSquad(data){
  return {
    budget:Number(data?.recommendation?.budget||0),
    xi_xfp:Number(data?.recommendation?.xi_xfp||0),
    players:(data?.members||[]).map(m=>({
      id:m.player_id,
      name:m.player?.full_name||m.player?.display_name||m.player?.short_label||null,
      position:m.player?.position||null,
      price:Number(m.player?.price||0),
      captain:Boolean(m.is_captain),
      squad_slot:m.squad_slot,
      bench_order:m.bench_order??null
    }))
  }
}

export async function buildScoutSummary(){
  const [playerData,matchData,recommended,alternative,availability]=await Promise.all([
    getPlayersWithProjection(),
    getMatches(),
    getRecommendation('recommended'),
    getRecommendation('alternative'),
    getAvailability()
  ])

  const top_players=[...(playerData.players||[])]
    .sort((a,b)=>Number(b.projection?.xfp||0)-Number(a.projection?.xfp||0))
    .slice(0,35)
    .map(p=>({
      id:p.id,
      name:p.full_name||p.display_name||p.short_label,
      team:p.team,
      team_id:p.team_id,
      position:p.position,
      price:Number(p.price||0),
      xfp:Number(p.projection?.xfp||0),
      p90:Number(p.projection?.p90||0),
      xi_probability:Number(p.projection?.xi_probability||0),
      x_minutes:Number(p.projection?.x_minutes||0),
      six_plus_probability:Number(p.projection?.six_plus_probability||0),
      opponent:p.projection?.opponent_name||null,
      venue:p.projection?.venue||null,
      expected_goals:Number(p.projection?.expected_goals||0),
      expected_assists:Number(p.projection?.expected_assists||0),
      availability_probability:Number(p.projection?.availability_probability??1)
    }))

  const availability_issues=(availability.rows||[])
    .filter(a=>Number(a.availability_probability??1)<.99)
    .slice(0,50)
    .map(a=>({
      player_id:a.player_id,
      name:a.player?.full_name||a.player?.display_name||a.player?.short_label||null,
      team:a.team||null,
      team_id:a.player?.team_id||null,
      probability:Number(a.availability_probability??1),
      reason:a.canonical_reason||null,
      expected_return_date:a.expected_return_date||null,
      suspension_fixture:a.suspension_fixture||null
    }))

  return {
    schema_version:SCOUT_FEED_SCHEMA_VERSION,
    gameweek:Number(playerData.run?.gameweek||0),
    cached_at:new Date().toISOString(),
    model_updated_at:playerData.run?.generated_at||null,
    source_updated_at:playerData.run?.source_updated_at||null,
    top_players,
    matches:(matchData.matches||[]).map(scoutFeedMatchRow),
    squads:{
      recommended:compactSquad(recommended),
      alternative:compactSquad(alternative)
    },
    availability_issues
  }
}
