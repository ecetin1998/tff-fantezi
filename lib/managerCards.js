export const MANAGER_CARD_NONE='none'

export const MANAGER_CARDS=Object.freeze([
  {id:'none',label:'Kart kullanma',shortLabel:'Kart yok',description:'Standart maç haftası kuralları uygulanır.',captainMultiplier:2,budget:null,benchBoost:false,attack:false,unlimitedBudget:false},
  {id:'triple_captain',label:'Tripleks Kaptan',shortLabel:'Tripleks',description:"Kaptanın puanı 3'e katlanır.",captainMultiplier:3,budget:null,benchBoost:false,attack:false,unlimitedBudget:false},
  {id:'quad_captain',label:'Dört Dörtlük Kaptan',shortLabel:'Dört Dörtlük',description:"Kaptanın puanı 4'e katlanır.",captainMultiplier:4,budget:null,benchBoost:false,attack:false,unlimitedBudget:false},
  {id:'bench_boost',label:'Tüm Takım Sahaya',shortLabel:'Tüm Takım',description:'Yedek oyuncuların puanları da haftalık toplama eklenir.',captainMultiplier:2,budget:null,benchBoost:true,attack:false,unlimitedBudget:false},
  {id:'attack',label:'Hücum',shortLabel:'Hücum',description:'15 kişilik kadro dağılımını 2 KL / 3 DEF / 5 OS / 5 FOR yapar. İlk 11, 100m bütçe ve diğer kurallar değişmez.',captainMultiplier:2,budget:null,benchBoost:false,attack:true,unlimitedBudget:false},
  {id:'unlimited_budget',label:'Limitsiz Bütçe',shortLabel:'Limitsiz',description:'Bu maç haftasında kadro bütçesi sınırı uygulanmaz.',captainMultiplier:2,budget:null,benchBoost:false,attack:false,unlimitedBudget:true},
])

export const MANAGER_CARD_IDS=new Set(MANAGER_CARDS.map(card=>card.id))
export const MANAGER_CARD_MAP=Object.freeze(Object.fromEntries(MANAGER_CARDS.map(card=>[card.id,card])))
export const ATTACK_SQUAD_LIMITS=Object.freeze({GK:2,DEF:3,MID:5,FWD:5})

export function normalizeManagerCard(value){
  const id=String(value||MANAGER_CARD_NONE)
  return MANAGER_CARD_IDS.has(id)?id:MANAGER_CARD_NONE
}

export function managerCardInfo(value){
  return MANAGER_CARD_MAP[normalizeManagerCard(value)]
}

export function captainMultiplierForCard(value){
  return Number(managerCardInfo(value)?.captainMultiplier||2)
}


export function squadLimitsForCard(value,baseLimits){
  return normalizeManagerCard(value)==='attack'
    ?ATTACK_SQUAD_LIMITS
    :baseLimits
}
