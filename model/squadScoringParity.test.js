const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),{spawnSync}=require('node:child_process'),{performance}=require('node:perf_hooks')
const formations=['3-4-3','3-5-2','4-3-3','4-4-2','4-5-1','5-2-3','5-3-2','5-4-1']
const FORMATION_MAP=Object.fromEntries(formations.map(k=>{const [DEF,MID,FWD]=k.split('-').map(Number);return [k,{DEF,MID,FWD}]}))
let src=fs.readFileSync('lib/squadScoring.js','utf8').replace("import {FORMATION_MAP} from '@/lib/rules'",'').replaceAll('export function ','function ')
src+='\nmodule.exports={expectedAutosubValue,scoreSquad};'
const sandbox={module:{exports:{}},exports:{},FORMATION_MAP,Map,Set,Object,Array,Math,Number};vm.createContext(sandbox);vm.runInContext(src,sandbox)
const {expectedAutosubValue,scoreSquad}=sandbox.module.exports
const mk=(id,position,xfp,play=.82)=>({id,position,projection:{xfp,appearance_probability:play,xi_probability:play,x_minutes:play*90,availability_probability:1}})
const players=[mk(1,'GK',4.2,.9),mk(2,'GK',3.1,.8),...Array.from({length:5},(_,i)=>mk(10+i,'DEF',5-i*.3,.75+i*.03)),...Array.from({length:5},(_,i)=>mk(20+i,'MID',6.2-i*.35,.72+i*.04)),...Array.from({length:3},(_,i)=>mk(30+i,'FWD',6.8-i*.4,.78+i*.04))]
const map=new Map(players.map(p=>[p.id,p])),ids=players.map(p=>p.id),scored=scoreSquad(ids,{playerMap:map,weeks:[0]})
const xi=scored.firstWeek.lineup.map(id=>map.get(id)),bench=scored.firstWeek.bench.map(id=>map.get(id))
const jsAuto=expectedAutosubValue(xi,bench)
const payload={xi:xi.map(p=>({id:p.id,position:p.position,xfp:p.projection.xfp,appearance_probability:p.projection.appearance_probability})),bench:bench.map(p=>({id:p.id,position:p.position,xfp:p.projection.xfp,appearance_probability:p.projection.appearance_probability}))}
const py=spawnSync('python3',['-c',`import ast,sys;src=open('model/optimizer_rules.py').read();tree=ast.parse(src);names={'_formation_key_from_counts','play_probability','conditional_xfp','_starter_absence_distribution','expected_autosub_value'};body=[n for n in tree.body if isinstance(n,(ast.Import,ast.ImportFrom)) or (isinstance(n,ast.FunctionDef) and n.name in names)];ns={};exec(compile(ast.Module(body=body,type_ignores=[]),'optimizer_rules.py','exec'),ns);import json;d=json.load(sys.stdin);print(ns['expected_autosub_value'](d['xi'],d['bench']))`],{input:JSON.stringify(payload),encoding:'utf8'})
assert.equal(py.status,0,py.stderr);assert.ok(Math.abs(jsAuto-Number(py.stdout.trim()))<=.01,'JS/Python autosub parity must be within .01')
const t=performance.now();for(let n=0;n<120;n++)scoreSquad(ids,{playerMap:map,weeks:[0,1,2],weekFactor:(p,w)=>w?0.9:1});const elapsed=performance.now()-t
assert.ok(elapsed<200,`Pruned planner-equivalent scoring batch must stay under 200ms; got ${elapsed.toFixed(1)}ms`)
console.log('squad scoring parity/perf',jsAuto,elapsed.toFixed(1))
