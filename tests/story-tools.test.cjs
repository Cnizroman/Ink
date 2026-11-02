const {test}=require('node:test'),assert=require('node:assert/strict'),story=require('../story-tools.js'),theme=require('../theme-tools.js');
test('all six book palettes are readable and designer metadata is bounded and CSS-safe',()=>{
 for(const p of story.palettes){assert.ok(theme.contrast(p.bg,p.text)>=4.5,p.id);assert.ok(theme.contrast(p.bg,p.accent)>=4.5,p.id);assert.ok(story.css({palette:p.id}).includes(p.bg));}
 const safe=story.clean({palette:'url(evil)',font:'</style><script>',size:10000,leading:-100,width:Infinity,align:'expression(evil)',headings:'url(evil)',divider:'<svg>',dropcap:'true',arbitrary:'javascript:'});assert.equal(safe.size,28);assert.equal(safe.leading,1.4);assert.equal(safe.width,760);assert.equal(safe.palette,'paper');assert.equal(safe.font,'serif');assert.equal(safe.dropcap,false);assert.ok(!/url|script|expression|undefined|NaN|Infinity/.test(story.css(safe)));assert.deepEqual(story.clean(null),story.clean());
});
test('personal reader colors override author colors without mutating saved design',()=>{
 const input=story.clean({palette:'plum',font:'mono',dropcap:true}),values={},host={classList:{add(){}},style:{setProperty:(k,v)=>values[k]=v},dataset:{}};
 story.apply(host,input,'light');assert.equal(input.palette,'plum');assert.equal(values['--story-bg'],'#fffefa');assert.equal(values['--story-text'],'#26231e');assert.equal(host.dataset.dropcap,'true');assert.ok(host.style.cssText.includes('ui-monospace'));
});
