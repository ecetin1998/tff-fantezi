const LABELS={
  GK:'Kaleci',
  CB:'Stoper',
  FB:'Bek',
  WB:'Kanat bek',
  DM:'Ön libero',
  CM:'Merkez orta saha',
  AM:'Ofansif orta saha',
  WM:'Kenar orta saha',
  W:'Kanat',
  SS:'İkinci forvet',
  ST:'Santrfor',
  DEF_UNKNOWN:'Defans • detay rol bekleniyor',
  MID_UNKNOWN:'Orta saha • detay rol bekleniyor',
  FWD_UNKNOWN:'Forvet • detay rol bekleniyor',
}

const SIDE={
  L:'sol',
  R:'sağ',
  C:'merkez',
  BOTH:'iki taraf',
}

export function playerRoleLabel(player){
  const role=player?.primary_role
  if(!role)return ''
  const base=LABELS[role]||role
  const side=SIDE[player?.role_side]
  if(!side||['GK','CB','DM','CM','AM','SS','ST'].includes(role))return base
  return side+' '+base.toLocaleLowerCase('tr')
}

export function roleIsDetailed(player){
  const role=player?.primary_role
  return Boolean(role&&!role.endsWith('_UNKNOWN'))
}

export function roleCode(player){
  return player?.primary_role||null
}
