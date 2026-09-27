export const SCOUT_QUERY_KEYS=new Set(['section','team','position','limit','fields'])
const POSITIONS=new Set(['GK','DEF','MID','FWD'])
const FIELD_NAME=/^[a-z][a-z0-9_]*$/i

export function parseScoutQuery(url){
  const unknown=[...url.searchParams.keys()].filter(key=>!SCOUT_QUERY_KEYS.has(key))
  const teamRaw=url.searchParams.get('team')
  const team=teamRaw===null?null:Number(teamRaw)
  const position=(url.searchParams.get('position')||'').toUpperCase()||null
  const limitRaw=url.searchParams.get('limit')
  const limit=limitRaw===null?null:Number(limitRaw)
  const fieldsRaw=String(url.searchParams.get('fields')||'').trim()
  const fields=fieldsRaw?[...new Set(fieldsRaw.split(',').map(x=>x.trim()).filter(Boolean))]:[]
  if(teamRaw!==null&&(!Number.isInteger(team)||team<=0))return {error:'team geçersiz.'}
  if(position&&!POSITIONS.has(position))return {error:'position geçersiz.'}
  if(limitRaw!==null&&(!Number.isInteger(limit)||limit<1||limit>500))return {error:'limit 1-500 arasında olmalı.'}
  if(fields.some(field=>!FIELD_NAME.test(field)))return {error:'fields geçersiz.'}
  return {unknown,team,position,limit:limit||null,fields,fieldsKey:fields.join(',')}
}

function teamMatches(row,team){
  if(!team)return true
  return Number(row?.team_id)===team||Number(row?.home_team_id)===team||Number(row?.away_team_id)===team||Number(row?.player?.team_id)===team
}
function positionMatches(row,position){
  if(!position)return true
  return row?.position===position||row?.player?.position===position
}
function pick(row,fields){
  if(!fields?.length)return row
  return Object.fromEntries(fields.filter(field=>Object.prototype.hasOwnProperty.call(row,field)).map(field=>[field,row[field]]))
}
function processRows(rows,filters){
  const filtered=(rows||[]).filter(row=>teamMatches(row,filters.team)&&positionMatches(row,filters.position))
  return filtered.slice(0,filters.limit||filtered.length).map(row=>pick(row,filters.fields))
}
export function applyScoutFilters(payload,filters){
  const out={...payload}
  for(const key of ['players','top_players','matches','rows','availability_issues']){
    if(Array.isArray(out[key]))out[key]=processRows(out[key],filters)
  }
  return out
}
