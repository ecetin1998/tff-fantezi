import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizePlayerSearch,searchComparisonPlayers} from '../lib/playerComparisonSearch.mjs'

const pool=[
 {id:1,full_name:'İrfan Can Kahveci',team:'Fenerbahçe',position:'MID'},
 {id:2,full_name:'Çağlar Söyüncü',team:'Fenerbahçe',position:'DEF'},
 {id:3,full_name:'Uğurcan Çakır',team:'Galatasaray',position:'GK'},
 {id:4,full_name:'Deniz Türüç',team:'Başakşehir',position:'MID'},
]
test('Turkish accents, dots and loose casing do not prevent name matches',()=>{
 assert.equal(normalizePlayerSearch('İRFAN'), 'irfan')
 assert.equal(normalizePlayerSearch('ÇAĞLAR SÖYÜNCÜ'), 'caglar soyuncu')
 assert.equal(searchComparisonPlayers(pool,'irfan can').items[0]?.id,1)
 assert.equal(searchComparisonPlayers(pool,'caglar soyuncu').items[0]?.id,2)
 assert.equal(searchComparisonPlayers(pool,'turuc').items[0]?.id,4)
})
test('team and position search exclude the already selected opposing player',()=>{
 const result=searchComparisonPlayers(pool,'Fenerbahce',1)
 assert.deepEqual(result.items.map(p=>p.id),[2])
 assert.equal(searchComparisonPlayers(pool,'OS').total,2)
 assert.equal(searchComparisonPlayers(pool,'galatasaray').items[0]?.id,3)
})
test('large pool only renders ten results, but preserves total count',()=>{
 const many=Array.from({length:456},(_,i)=>({id:i+1,full_name:'Oyuncu '+i,team:'Takim'}))
 const result=searchComparisonPlayers(many,'',0,10)
 assert.equal(result.total,456)
 assert.equal(result.items.length,10)
 assert.deepEqual(result.items.map(p=>p.id),[1,2,3,4,5,6,7,8,9,10])
})
test('search does not leak restricted projection fields or mutate pool',()=>{
 const withPro=[{...pool[0],projection:{p90:9.9,six_plus_probability:.8}}]
 const before=JSON.stringify(withPro)
 const result=searchComparisonPlayers(withPro,'irfan')
 assert.equal(result.items[0],withPro[0])
 assert.equal(JSON.stringify(withPro),before)
})
