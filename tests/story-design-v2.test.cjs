const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),story=require('../story-tools'),text=require('../text-format'),workshop=require('../workshop-tools');
test('honest combination floor uses distinct bundled fonts and actual independent slider ticks, no palettes or presets',()=>{
 const ticks=k=>Math.round((story.ranges[k][1]-story.ranges[k][0])/story.ranges[k][2])+1;
 assert.equal(story.fontCatalog.length,20);assert.equal(story.dividers.length,24);assert.equal(story.layouts.length,12);
 assert.equal(story.combinationCount(),910350000000n);assert.ok(story.combinationCount()>100000000000n);
 assert.equal(20*20*25*25*25*17*17*21*24,Number(story.combinationCount()));
 for(const k of ['size','leading','width','paragraphGap','indent','letterSpacing']){const [min,,step]=story.ranges[k],set=new Set();for(let i=0;i<ticks(k);i++){const value=story.clean({[k]:min+i*step})[k];set.add(value);assert.notEqual(story.css({[k]:value}),story.css({[k]:value===min?min+step:min}));}assert.equal(set.size,ticks(k));}
 assert.equal(new Set(story.fontCatalog.map(([id])=>story.css({font:id}))).size,20);assert.equal(new Set(story.fontCatalog.map(([id])=>story.css({headingFont:id}))).size,20);
 assert.equal(new Set(story.dividers.map(([id])=>JSON.stringify(story.dividerCSS(id)))).size,24);
});
test('all 20 real local fonts have Cyrillic, Latin, pinned provenance, licenses and matching nonempty WOFF2 files',()=>{
 const dir='assets/story-fonts/',manifest=JSON.parse(fs.readFileSync(dir+'manifest.json')),css=fs.readFileSync('story-fonts.css','utf8'),hashes=[];assert.equal(manifest.length,20);assert.ok(!css.includes('https://'));
 for(const f of manifest){assert.ok(story.fontCatalog.some(([id,name])=>id===f.id&&name===f.family));assert.match(f.version,/^\d+\.\d+\.\d+$/);assert.ok(fs.readFileSync(dir+f.license).length>1000);for(const subset of ['cyrillic','latin']){const entry=f.files.find(e=>e.file===`${f.id}-${subset}-400-normal.woff2`);assert.ok(entry,f.id+subset);const data=fs.readFileSync(dir+entry.file);assert.ok(data.length>2000);assert.equal(data.subarray(0,4).toString(),'wOF2');assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);hashes.push(entry.sha256);assert.ok(css.includes(entry.file));}}
 assert.equal(new Set(hashes).size,40);
});
test('v2 colors are unrestricted by contrast, all style fields are bounded and CSS-string injection is inert',()=>{
 const s=story.clean({palette:'custom',customBg:'#111111',customText:'#111111',customAccent:'#111111',customDivider:'";}body{display:none}/*',divider:'custom',font:'bad-script',headingFont:'literata',texture:'grid',pageLayout:'custom',radius:500,letterSpacing:NaN,evil:'javascript:'});
 assert.equal(s.customBg,s.customText);assert.equal(s.customText,s.customAccent);assert.equal(s.radius,48);assert.equal(s.letterSpacing,0);assert.equal(s.evil,undefined);assert.ok(!story.css(s).includes('body'));assert.match(story.css(s),/--story-divider-symbol:"\\22 /);
 for(const [key,values] of Object.entries(story.options)){for(const v of values)assert.equal(story.clean({[key]:v})[key],v);assert.equal(story.clean({[key]:'url(https://evil)'} )[key],story.defaults[key]);}
 for(const [key,[min,max]] of Object.entries(story.ranges)){assert.equal(story.clean({[key]:-1e8})[key],min);assert.equal(story.clean({[key]:1e8})[key],max);}
 assert.equal(Array.from(story.clean({customDivider:'😀'.repeat(40)+'\n'}).customDivider).length,24);assert.equal(story.clean({customDivider:'a\u0085\ud800😀'}).customDivider,'a😀');
});
test('new page, scene-divider and creative block markup uses strict allowlists and still escapes HTML',()=>{
 for(const [id] of story.layouts){const html=text.render(`:::page[${id}] Заголовок\nТекст <img src=x onerror=bad()>\n:::`);assert.ok(html.includes('class="text-page"'));assert.ok(html.includes(`data-page-layout="${id}"`));assert.ok(!html.includes('<img'));}
 for(const [id] of story.dividers)assert.ok(text.render(`---{${id}}`).includes(`data-divider="${id}"`));
 for(const [kind] of Object.entries(text.blockTypes))assert.ok(!text.render(`:::${kind} <svg onload=evil()>\n<script>evil()</script>\n:::`).includes('<script>'));
 assert.ok(text.render('===page===').includes('text-pagebreak'));assert.ok(!text.render(':::page[url] Bad\nText\n:::').includes('class="text-page"'));assert.ok(!text.render('---{evil}').includes('<hr'));assert.ok(!text.render('---{stars;position:fixed}').includes('style='));
 const nested=text.render(':::page[archive] Дело\n:::letter Письмо\nТекст\n:::\n:::');assert.match(nested,/<section.*<aside.*<p>Текст<\/p><\/aside><\/section>/);
});
test('new style survives design JSON and chapter backup import; legacy databases reject only unsupported upgrades',()=>{
 const style=story.clean({font:'caveat',headingFont:'pt-serif',palette:'custom',customBg:'#010203',size:33,pageLayout:'custom',divider:'moon',texture:'grid',indent:36});
 const raw=JSON.stringify({format:'chernila-design-v2',style});assert.deepEqual(story.parseDesign(raw),style);assert.deepEqual(story.parseDesign(JSON.stringify(style)),style);assert.deepEqual(workshop.parseDraft(JSON.stringify({body:':::page[book] Лист\nТекст\n:::',readerStyle:style}),true).readerStyle,style);
 assert.throws(()=>story.parseDesign('[]'));assert.throws(()=>story.parseDesign('x'.repeat(65537)));assert.deepEqual(story.clean(story.parseDesign('{"__proto__":{"polluted":true},"font":"url(evil)"}')),story.clean());assert.equal({}.polluted,undefined);
 assert.deepEqual(Object.keys(story.legacy({palette:'plum',font:'mono'})),['palette','font','size','leading','width','align','dropcap','headings','divider']);assert.doesNotThrow(()=>story.legacy({palette:'midnight',customBg:'#0d1725'}));assert.throws(()=>story.legacy(style),/STORY_DESIGN_UPGRADE/);
});
test('auxiliary ornament fonts are local, licensed, hash-pinned and excluded from the 20 text choices',()=>{
 const manifest=JSON.parse(fs.readFileSync('assets/story-fonts/symbols-manifest.json','utf8'));assert.equal(manifest.length,3);
 for(const f of manifest){assert.ok(fs.readFileSync('assets/story-fonts/'+f.license).length>1000);for(const entry of f.files){const data=fs.readFileSync('assets/story-fonts/'+entry.file);assert.equal(data.subarray(0,4).toString(),'wOF2');assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);}}
 assert.equal(story.fontCatalog.length,20);assert.ok(story.dividers.some(([id,,glyph])=>id==='asterisk'&&glyph==='✻'));
});
