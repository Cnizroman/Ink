const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const theme=require('../theme-tools.js');
test('personal palettes provide safe CSS variables with readable text and accents',()=>{
 for(const preset of theme.presets){const p=theme.validate(preset),v=theme.variables(p);assert.equal(v['--bg'],preset.background);for(const name of ['--text','--muted','--faint','--gold','--gold2'])for(const background of [p.background,p.panel])assert.ok(theme.contrast(v[name],background)>=4.5);assert.ok(theme.contrast(v['--ink'],p.accent)>=4.5);}
 for(const value of ['red','url(https://evil.test)','</style>','#fff;background:red'])assert.throws(()=>theme.validate({...theme.presets[0],background:value}));
 assert.throws(()=>theme.validate({...theme.presets[0],text:'#0a0908'}),/контраст/);assert.throws(()=>theme.validate({...theme.presets[0],accent:'#161310'}),/контраст/);
});
test('personal theme restores per-account choices and falls back safely on corrupted storage',()=>{
 const values=new Map(),css=new Map(),root={style:{setProperty:(k,v)=>css.set(k,v)},dataset:{}};
 values.set('chernila_site_theme_alice',JSON.stringify(theme.presets[1]));values.set('chernila_site_theme_bob','{"background":"javascript:bad"}');
 const ctx={document:{documentElement:root},localStorage:{getItem:k=>values.get(k)||null}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').resolve(__dirname,'../theme-tools.js'),'utf8'),ctx);
 ctx.InkTheme.activate('alice');assert.equal(css.get('--bg'),theme.presets[1].background);assert.equal(root.style.colorScheme,'light');
 ctx.InkTheme.activate('bob');assert.equal(css.get('--bg'),theme.presets[0].background);ctx.InkTheme.activate('alice');assert.equal(css.get('--bg'),theme.presets[1].background);
 ctx.InkTheme.activate(null);assert.equal(css.get('--bg'),theme.presets[0].background);
});
