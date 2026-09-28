const LABELS={
  GK:'Kaleci',
  CB:'Stoper',
  FB:'Bek',
  WB:'Kanat Bek',
  DM:'Ön Libero',
  CM:'Merkez Orta Saha',
  AM:'Ofansif Orta Saha',
  WM:'Kenar Orta Saha',
  W:'Kanat',
  SS:'İkinci Forvet',
  ST:'Santrfor',
  DEF_UNKNOWN:'Defans',
  MID_UNKNOWN:'Orta Saha',
  FWD_UNKNOWN:'Forvet',
}

const SIDE={
  L:'Sol',
  R:'Sağ',
}

const SIDE_AWARE_ROLES=new Set(['FB','WB','WM','W'])

export function playerRoleLabel(player){
  const role=player?.primary_role
  if(!role)return ''
  const base=LABELS[role]||role
  if(!SIDE_AWARE_ROLES.has(role))return base
  if(player?.role_side==='BOTH')return 'Çift Taraflı '+base
  const side=SIDE[player?.role_side]
  return side?side+' '+base:base
}

export function roleIsDetailed(player){
  const role=player?.primary_role
  return Boolean(role&&!role.endsWith('_UNKNOWN'))
}

export function roleCode(player){
  return player?.primary_role||null
}
