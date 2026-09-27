import fs from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'
import purgecss from '@fullhuman/postcss-purgecss'

function filesUnder(dir,predicate){
  if(!fs.existsSync(dir))return []
  const out=[]
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory())out.push(...filesUnder(full,predicate))
    else if(entry.isFile()&&predicate(full))out.push(full)
  }
  return out
}

const cssRoot=path.resolve('.next/static')
const cssFiles=filesUnder(cssRoot,file=>file.endsWith('.css'))
const content=[
  './app/**/*.js',
  './components/**/*.js',
  './.next/server/**/*.js',
  './.next/server/**/*.html',
  './.next/static/**/*.js',
]
const plugin=purgecss({
  content,
  defaultExtractor:raw=>raw.match(/[A-Za-z0-9_:/-]+/g)||[],
  safelist:{
    standard:[
      'active','compact','recommended','alternative','warning','critical',
      'good','neutral','tough','high','medium','low','edge','G','B','M',
      'GK','DEF','MID','FWD','is-return','is-emphasis'
    ],
    greedy:[/scope/,/^row-(GK|DEF|MID|FWD)$/, /^position-(gk|def|mid|fwd)$/]
  }
})

for(const file of cssFiles){
  const css=fs.readFileSync(file,'utf8')
  const result=await postcss([plugin]).process(css,{from:file,to:file})
  fs.writeFileSync(file,result.css)
}
console.log(`Purged ${cssFiles.length} built CSS assets using app/components and emitted Next chunks.`)
