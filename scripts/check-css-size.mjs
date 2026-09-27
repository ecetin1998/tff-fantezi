import fs from 'node:fs'
import path from 'node:path'

const root=path.resolve('.next/static')
if(!fs.existsSync(root)){
  console.error('Next static output directory missing:',root)
  process.exit(1)
}

function cssFiles(dir){
  const out=[]
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name)
    if(entry.isDirectory())out.push(...cssFiles(full))
    else if(entry.isFile()&&entry.name.endsWith('.css'))out.push(full)
  }
  return out
}

const files=cssFiles(root)
if(!files.length){
  console.error('No production CSS assets found under',root)
  process.exit(1)
}
const bytes=files.reduce((sum,file)=>sum+fs.statSync(file).size,0)
const kb=bytes/1024
console.log(`Production CSS: ${kb.toFixed(1)} KB across ${files.length} files`)
for(const file of files)console.log(` - ${path.relative(root,file)}: ${(fs.statSync(file).size/1024).toFixed(1)} KB`)
if(bytes>=120*1024){
  console.error('Production CSS must stay below 120 KB')
  process.exit(1)
}
