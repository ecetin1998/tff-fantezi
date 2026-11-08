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
  for(const color of ['#102D35','#E8F7F5','#D9FA57'])assert.ok(css.includes(color),color+' palette token missing');
  assert.ok(css.includes('--premium-bg:var(--brand-ice)'),'Page-wide premium surface token must be rebranded');
  assert.ok(css.includes('--premium-accent:var(--brand-petrol)'),'Premium actions must follow the new accent');
});
test('hero actions are responsive equal-width buttons',()=>{
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:680px\)[\s\S]*?\.scope :global\(\.home-intro-actions\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.scope :global\(\.home-intro-actions\)>:global\(\.home-cta-btn\)\{[\s\S]*?width:100%/);
  assert.match(css,/min-height:50px/);
});


test('new palette uses Petrol Blue hierarchy and lime buttons with readable ink',()=>{
  assert.match(css,/\.scope :global\(\.topbar\)\{\s*background:rgba\(16,45,53,/);
  assert.match(css,/\.scope :global\(\.home-intro-hero\)\{\s*background:linear-gradient\(128deg,#102D35/);
  assert.match(css,/\.scope :global\(\.home-intro-hero\) h1 span\{color:var\(--brand-lime\)\}/);
  assert.match(css,/\.scope :global\(\.cta\),[\s\S]*?\.scope :global\(\.pro-btn\),[\s\S]*?\.scope :global\(\.multi-filter-done\)\{\s*background:var\(--brand-lime\);[\s\S]*?color:var\(--brand-petrol\)/);
  assert.match(css,/\.scope :global\(\.mobile-bottom-nav\) a:global\(\.active\)\{\s*background:var\(--brand-lime\)/);
  for(const old of ['#F3EEE3','#111111','#D9541E']){
    assert.ok(!css.includes(old),'Old warm design-system color should not remain: '+old);
  }
});
test('lime foreground contrast on Petrol Blue meets WCAG AA for ordinary text',()=>{
  const luminance=hex=>{
    const rgb=hex.match(/[a-f0-9]{2}/gi).map(c=>parseInt(c,16)/255);
    const channel=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*channel[0]+.7152*channel[1]+.0722*channel[2];
  };
  const a=luminance('102D35'),b=luminance('D9FA57');
  const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(ratio>=4.5,'Petrol Blue text on Signal Lime buttons must meet AA contrast');
});


test('hero secondary CTA text cannot be overridden to dark on dark Petrol',()=>{
  assert.match(css,/\.scope :global\(\.home-intro-hero\) :global\(\.home-intro-actions\) > :global\(a\.home-cta-outline\),[\s\S]*?color:var\(--brand-ice\)!important;/,
    'both secondary links must force Ice White text on their dark translucent surface');
  assert.match(css,/\.scope :global\(\.home-intro-hero\) :global\(\.home-intro-actions\) > :global\(a\.home-cta-outline:hover\),[\s\S]*?color:var\(--brand-petrol\)!important;/,
    'hover may show dark text only when lime background is provided');
  assert.match(css,/\.scope :global\(\.home-intro-hero\) :global\(\.home-intro-actions\) > :global\(a\.home-cta-primary\),[\s\S]*?color:var\(--brand-petrol\)!important;/,
    'lime primary CTA must retain dark text');
});
