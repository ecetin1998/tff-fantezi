const fs=require('node:fs')
const assert=require('node:assert/strict')
const read=p=>fs.readFileSync(p,'utf8')
const home=read('app/page.js'),nav=read('components/Nav.js'),search=read('components/GlobalPlayerSearch.js'),route=read('app/api/player-search/route.js'),detail=read('app/players/[id]/page.js'),data=read('lib/data.js'),health=read('app/model-health/page.js'),css=read('components/PremiumViews.module.css'),squad=read('components/SquadBuilder.js'),teams=read('components/TeamsExplorer.js'),picker=read('components/ManagerCardPicker.js'),recs=read('components/ManagerCardRecommendations.js')
assert.doesNotMatch(home,/KADRON İÇİN BU HAFTA/);
assert.match(home,/getMySquadOverview/);
assert.match(home,/savedSquad\?\.run\?\.id===run\?\.id/);
assert.match(home,/export const dynamic='force-dynamic'/);
assert.match(home,/mySquad\?<section/);
assert.match(data,/const getHomeOverviewBaseShared=unstable_cache/);
assert.match(data,/async function _getMySquadOverview\(\)/);
assert.doesNotMatch(data.slice(data.indexOf('async function _getHomeOverviewBase'),data.indexOf('async function _getSquadPlayerPool')),/scout_user_squad_members|scout_user_squads/);assert.match(nav,/GlobalPlayerSearch/);assert.match(nav,/Model Sağlığı/);assert.match(search,/Oyuncu ara/);assert.match(route,/stale-while-revalidate/);assert.match(detail,/TAHMİN ARALIĞI vs GERÇEKLEŞEN/);assert.match(detail,/P25–P90/);assert.match(detail,/replayHitCount/);assert.match(data,/scout_replay_players/);assert.match(data,/scout_backtest_players/);assert.match(data,/live_frozen/);assert.match(data,/getMySquadOverview/);assert.match(data,/getModelHealthOverview/);assert.match(health,/MODEL OPERASYONU/);assert.match(health,/YAYIN KAPILARI/);assert.match(css,/scroll-padding-bottom/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/prediction-history-list/);assert.doesNotMatch(squad,/DEADLINE KONTROLÜ/);assert.doesNotMatch(squad,/className="picker-simulate-link"/);assert.match(squad,/Taban • P25/);assert.doesNotMatch(squad,/3 MH Transfer Planlayıcısı/);assert.doesNotMatch(squad,/const transferPlanRows=useMemo/);assert.match(teams,/fixture-strength-strip/);assert.match(data,/getFutureFixturePlan/);assert.match(picker,/manager-card-delta/);assert.match(recs,/Kart etkisini xFP ile karşılaştır/);assert.match(recs,/ManagerCardPicker/);assert.match(recs,/Kartlı hafta xFP/);

const sky=read('components/SkyBlueTheme.module.css')
const globalStyles=read('app/globals.css')
// Regression: old 4-column home-personal-grid won CSS specificity over the new
// 3-column dashboard and left a blank fourth card-sized gap on desktop.
assert.match(home,/className="home-decision-grid"/)
assert.doesNotMatch(home,/className="home-personal-grid"/)
assert.match(sky,/\.scope :global\(\.home-decision-grid\)\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/)
assert.match(sky,/\.scope :global\(\.home-decision-grid\)\s*\{[^}]*width:100%/)
assert.match(sky,/@media\(max-width:940px\)/)
assert.match(sky,/@media\(max-width:660px\)/)
assert.doesNotMatch(globalStyles,/\.home-personal-grid\s*\{/)
assert.match(home,/home-decision-captain-name/)
assert.match(home,/home-decision-method/)
assert.match(home,/savedSquad\?\.run\?\.id===run\?\.id/)
console.log('product ux expansion contract ok')
