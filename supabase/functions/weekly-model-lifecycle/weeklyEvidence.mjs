/**
 * Fetch the latest five gameweeks of final minutes evidence without silently
 * truncating at Supabase/PostgREST's configured max-rows cap (often 1,000).
 * Important: absence of older weeks is NOT a verified zero-minute benching.
 * Stable ordering is required for offset pagination.
 */
export async function fetchTrustedWeeklyEvidence(sb, targetWeek) {
  const pageSize=500
  const maxRows=10000
  const rows=[]
  for(let offset=0;offset<maxRows;offset+=pageSize){
    const page=await sb.from("scout_player_weekly_points")
      .select("player_id,gameweek,match_id,minutes,points,is_final,source_kind,source_updated_at")
      .gte("gameweek",Math.max(1,Number(targetWeek)-5))
      .lt("gameweek",Number(targetWeek))
      .eq("is_final",true)
      .order("gameweek",{ascending:false})
      .order("player_id",{ascending:true})
      .order("match_id",{ascending:true})
      .range(offset,offset+pageSize-1)
    if(page.error)return {data:null,error:page.error}
    const batch=page.data||[]
    rows.push(...batch)
    if(batch.length<pageSize)return {data:rows,error:null}
  }
  return {data:null,error:new Error("RECENT_WEEKLY_EVIDENCE_PAGINATION_LIMIT")}
}
