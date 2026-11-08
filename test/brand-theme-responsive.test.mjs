import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('app/page.js','utf8');
const layout=readFileSync('app/layout.js','utf8');
const css=readFileSync('components/BrandTheme.module.css','utf8');

test('homepage has three real accessible links, all sharing button geometry',()=>{
  const cta=page.match(/<div className="home-intro-actions"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(cta,'Home hero CTA group must exist');
  for(const [href,label] of [['/players','Oyuncuları incele'],['/squad','Kadromu kur'],['/matches','Maç modeline git']]){
    assert.ok(cta[1].includes('href="'+href+'"'),'CTA '+href+' missing');
    assert.ok(cta[1].includes(label),'CTA label '+label+' missing');
  }
  assert.equal((cta[1].match(/home-cta-btn/g)||[]).length,3);
  assert.ok(!cta[1].includes('text-action'),'The match action must no longer be an inline text link');
});
test('brand theme is loaded on all routes and uses exact reference colors',()=>{
  assert.ok(layout.includes("import brandTheme from '@/components/BrandTheme.module.css'"));
  assert.ok(layout.includes('brandTheme.scope'));
  for(const color of ['#F3EEE3','#111111','#D9541E'])assert.ok(css.includes(color),color+' palette token missing');
  assert.ok(css.includes('--premium-bg:var(--brand-cream)'),'Page-wide premium surface token must be rebranded');
  assert.ok(css.includes('--premium-accent:var(--brand-orange)'),'Premium actions must follow the new accent');
});
test('hero actions are responsive equal-width buttons',()=>{
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.scope :global\(\.home-intro-actions\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.scope :global\(\.home-intro-actions\)>:global\(\.home-cta-btn\)\{[\s\S]*?width:100%/);
  assert.match(css,/min-height:50px/);
});
