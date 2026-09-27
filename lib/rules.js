import rules from '../rules/tff-fantasy.json' with {type:'json'}

export const CURRENT_SEASON='2026-27'
export const TFF_FANTASY_RULES=Object.freeze(rules)
export const BUDGET=Number(rules.budget)
export const SQUAD_LIMITS=Object.freeze({...rules.squad})
export const MAX_PLAYERS_PER_CLUB=Number(rules.max_per_club)
export const FORMATIONS=Object.freeze([...rules.formations])
export const FORMATION_SET=new Set(FORMATIONS)
export const FORMATION_MAP=Object.freeze(Object.fromEntries(FORMATIONS.map(value=>{
  const [DEF,MID,FWD]=value.split('-').map(Number)
  return [value,Object.freeze({DEF,MID,FWD})]
})))
export const SCORING=Object.freeze(rules.scoring)
export const TRANSFER_RULES=Object.freeze(rules.transfers)
export const SQUAD_SIZE=Object.values(SQUAD_LIMITS).reduce((sum,n)=>sum+Number(n),0)
const firstFormation=FORMATION_MAP[FORMATIONS[0]]
export const STARTING_XI_SIZE=1+Object.values(firstFormation).reduce((sum,n)=>sum+Number(n),0)
export const STARTING_GK=STARTING_XI_SIZE-Object.values(firstFormation).reduce((sum,n)=>sum+Number(n),0)
export const BENCH_SIZE=SQUAD_SIZE-STARTING_XI_SIZE
