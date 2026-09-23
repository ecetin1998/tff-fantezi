export const TEAM_THEMES = {
  'Fenerbahçe': { primary:'#F4D21F', secondary:'#123C8C', text:'#102A5D' },
  'Galatasaray': { primary:'#F4B41B', secondary:'#A71930', text:'#5A1420' },
  'Beşiktaş': { primary:'#111111', secondary:'#F3F4F6', text:'#111111' },
  'Trabzonspor': { primary:'#7A263A', secondary:'#4FA3D9', text:'#4B1826' },
  'Göztepe': { primary:'#F2C300', secondary:'#C8102E', text:'#641019' },
  'Kocaelispor': { primary:'#17864B', secondary:'#171717', text:'#0B4A2A' },
  'Konyaspor': { primary:'#17864B', secondary:'#F5F7F8', text:'#0B4A2A' },
  'Samsunspor': { primary:'#D71920', secondary:'#F5F5F5', text:'#761014' },
  'Başakşehir': { primary:'#F58220', secondary:'#17365D', text:'#71390D' },
  'Alanyaspor': { primary:'#F58220', secondary:'#171717', text:'#71390D' },
  'Gaziantep': { primary:'#C8102E', secondary:'#171717', text:'#6D0E18' },
  'Rizespor': { primary:'#2D95D3', secondary:'#2E9C67', text:'#185375' },
  'Gençlerbirliği': { primary:'#C8102E', secondary:'#171717', text:'#6D0E18' },
  'Kasımpaşa': { primary:'#2B67C8', secondary:'#F4F7FB', text:'#183E7D' },
  'Eyüpspor': { primary:'#6C2E91', secondary:'#F2C94C', text:'#4A1D66' },
  'Erzurumspor': { primary:'#2E86C1', secondary:'#F5F7FB', text:'#18547B' },
  'Çorum FK': { primary:'#D11F2E', secondary:'#171717', text:'#75101A' },
  'Amed': { primary:'#168B4B', secondary:'#D12235', text:'#0B4E2A' },
}

const fallback={ primary:'#6674A8', secondary:'#DDE3F4', text:'#253054' }

export function getTeamTheme(team){
  return TEAM_THEMES[team] || fallback
}

export function teamCssVars(team){
  const t=getTeamTheme(team)
  return {
    '--club1':t.primary,
    '--club2':t.secondary,
    '--clubText':t.text,
  }
}
