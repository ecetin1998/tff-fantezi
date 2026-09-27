import fantasyRules from '@/rules/tff-fantasy.json'

export const RULES=fantasyRules
export const CURRENT_SEASON=RULES.season
export const BUDGET=Number(RULES.budget)
export const SQUAD_LIMITS=Object.freeze({...RULES.squad})
export const MAX_PLAYERS_PER_CLUB=Number(RULES.max_per_club)
export const FORMATIONS=Object.freeze([...RULES.formations])
export const FORMATION_SET=new Set(FORMATIONS)
export const FORMATION_SHAPES=Object.freeze(Object.fromEntries(
  FORMATIONS.map(key=>{
    const [DEF,MID,FWD]=key.split('-').map(Number)
    return [key,{DEF,MID,FWD}]
  })
))
export const SCORING=RULES.scoring
export const TRANSFER_RULES=RULES.transfers
export const VICE_CAPTAIN_ENABLED=Boolean(RULES.vice_captain)
export const OPTIMIZER_RULES=RULES.optimizer||{}
