const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness({db,storage,remote}={}){
  const values=storage||new Map();
  if(db) values.set('chernila_db_v2',JSON.stringify(db));
  const ephemeral=new Map();
  const ctx={TextEncoder,atob,URL,URLSearchParams,Blob,sessionStorage:{getItem:k=>ephemeral.get(k)||null,setItem:(k,v)=>ephemeral.set(k,v),removeItem:k=>ephemeral.delete(k)},console,crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{reload(){}},fetch:remote};
  ctx.window=ctx;
  if(remote) ctx.CHERNILA_SUPABASE_CONFIG={url:'https://example.invalid',anonKey:'public'};
  vm.createContext(ctx);
  for(const file of ['data.js','profile-tools.js','workshop-freedom.js','story-tools.js','store.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  return {ctx,store:ctx.Store,storage:values,ephemeral};
}
async function founder(store){await store.login({login:'cnizroman',password:'demo1234'});}
const input=(workIds,extra={})=>({title:'Мой цикл',kind:'trilogy',description:'Описание',workIds,...extra});

test('seed contains only six existing source files, zero fake views and no teaser chapters',async()=>{
  const {store}=harness();await store.init();
  assert.equal(store.state.works.length,6);assert.equal(store.state.authors.length,1);
  assert.equal(store.state.chapters.length,0);
  for(const w of store.state.works){assert.equal(w.views,0);assert.ok(fs.existsSync(path.join(root,w.legacyUrl)));}
  assert.equal(store.state.groups[0].kind,'tetralogy');
  assert.equal(store.state.groups[0].workIds.length,5);
  assert.ok(!store.state.groups[0].workIds.includes('belaya-golova'));
});

test('migration removes identifiable demos, preserves real works/accounts and runs once',async()=>{
  const {store:first,storage}=harness();await first.init();
  const db=clone(first.state);delete db.catalogVersion;delete db.groupsInitialized;delete db.groups;
  db.works[0].views=12483;
  db.authors.push({id:'demo-a',username:'demo-a',demo:true},{id:'real-a',username:'real-a'});
  db.users.push({id:'real-a',authorId:'real-a',email:'real@example.com',pass:'safe'});
  db.works.push({id:'fake',authorId:'demo-a'},{id:'real',authorId:'real-a',title:'Настоящая работа'});
  db.chapters.push({id:'c-intro-1',workId:'ne-s-nachala'},{id:'fake-c',workId:'fake'},{id:'real-c',workId:'real',body:'Настоящий текст'});
  db.likes.push({userId:'real-a',workId:'fake'},{userId:'real-a',workId:'real'});
  const {store}=harness({db,storage});await store.init();
  assert.equal(store.state.works.length,7);assert.ok(store.state.works.some(w=>w.id==='real'));
  assert.deepEqual(clone(store.state.chapters).map(c=>c.id),['real-c']);
  assert.equal(store.state.works[0].views,3);assert.equal(store.state.likes.length,1);
  assert.ok(store.state.users.some(u=>u.email==='real@example.com'));
  const next=harness({storage});await next.store.init();assert.equal(next.store.state.works[0].views,3);
});

test('group CRUD preserves order, supports multiple memberships, reload and safe deletion',async()=>{
  const {store,storage}=harness();await store.init();await founder(store);
  const ids=['sem-dney','doroga-iz-holoda'];
  const g=await store.upsertGroup(input(ids));
  assert.deepEqual(clone(g.workIds),ids);
  await store.upsertGroup(input(['doroga-iz-holoda','belaya-golova']));
  assert.equal(store.state.groups.length,3);
  await store.upsertGroup(input([...ids].reverse(),{id:g.id,title:'Переименован'}));
  const next=harness({storage});await next.store.init();await founder(next.store);
  assert.deepEqual(clone(next.store.state.groups.find(x=>x.id===g.id).workIds),[...ids].reverse());
  await next.store.deleteGroup(g.id);assert.equal(next.store.state.works.length,6);
  await next.store.deleteGroup('nikto-ne-vspomnit');
  const again=harness({storage});await again.store.init();
  assert.ok(!again.store.state.groups.some(x=>x.id==='nikto-ne-vspomnit'));
});

test('rejects empty, duplicate, missing and foreign works; ownership enforced',async()=>{
  const {store}=harness();await store.init();await founder(store);
  for(const ids of [[],['missing'],['sem-dney','sem-dney']]) await assert.rejects(store.upsertGroup(input(ids)));
  await assert.rejects(store.upsertGroup(input(['sem-dney'],{title:'  '})));
  await assert.rejects(store.upsertGroup(input(['sem-dney'],{kind:'invalid'})));
  await store.signup({username:'writer',email:'writer@example.com',password:'password'});
  await assert.rejects(store.upsertGroup(input(['sem-dney'])));
  await assert.rejects(store.upsertGroup(input(['sem-dney'],{id:'nikto-ne-vspomnit'})));
  await assert.rejects(store.deleteGroup('nikto-ne-vspomnit'));
});

test('deleting an owned work removes membership; source books cannot be accidentally deleted',async()=>{
  const {store}=harness();await store.init();await founder(store);
  await assert.rejects(store.deleteWork('sem-dney'),/исходников/);
  const w={...clone(store.state.works[0]),id:store.uid(),legacyUrl:null,title:'Свой текст'};await store.upsertWork(w);
  const g=await store.upsertGroup(input([w.id,'sem-dney']));
  await store.deleteWork(w.id);assert.equal(store.state.works.length,6);assert.deepEqual(clone(g.workIds),['sem-dney']);
});

test('Supabase roundtrip, founder ownership and tombstone survive reload; failed writes stay unsaved',async()=>{
  const rows=[];let fail=false;
  const remote=async(url,opts={})=>{
    const resource=new URL(url).pathname.split('/').pop();
    if(resource==='work_groups'&&opts.method==='POST'){
      if(fail) return {ok:false,status:404,text:async()=>JSON.stringify({message:'missing table'})};
      const r=JSON.parse(opts.body),i=rows.findIndex(x=>x.id===r.id);
      if(i<0) rows.push(r);else rows[i]=r;
    }
    const data=resource==='profiles'?[{id:'real-founder',username:'cnizroman',is_founder:true,role:'admin'}]:resource==='work_groups'?rows:[];
    return {ok:true,text:async()=>JSON.stringify(data)};
  };
  const {store,storage}=harness({remote});await store.init();store.setSession({authorId:'real-founder',token:'test'});
  assert.equal(store.state.groups[0].authorId,'real-founder');
  await store.upsertGroup(input(['doroga-iz-holoda'],{id:'nikto-ne-vspomnit',title:'Моя версия'}));
  await store.pullFromSupabase();assert.equal(store.state.groups[0].title,'Моя версия');
  fail=true;await assert.rejects(store.upsertGroup(input(['sem-dney'])));assert.equal(store.state.groups.length,1);
  fail=false;await store.deleteGroup('nikto-ne-vspomnit');
  const next=harness({storage,remote});await next.store.init();assert.equal(next.store.state.groups.length,0);
  assert.equal(next.store.state.works.length,6);
});


test('missing groups table still shows founder cycle with real account ownership',async()=>{
  const remote=async(url,opts={})=>{
    const name=new URL(url).pathname.split('/').pop();
    if(name==='work_groups') return {ok:false,status:404,text:async()=>'{"message":"missing table"}'};
    return {ok:true,text:async()=>JSON.stringify(name==='profiles'?[{id:'real-founder',username:'cnizroman',is_founder:true,role:'admin'}]:[])};
  };
  const {store}=harness({remote});await store.init();
  assert.equal(store.state.groups[0].authorId,'real-founder');
  assert.ok(store.state.groups[0].workIds.every(id=>store.state.works.some(w=>w.id===id&&w.authorId==='real-founder')));
  store.setSession({authorId:'real-founder',token:'test'});
  await assert.rejects(store.upsertGroup(input(['sem-dney'],{id:'nikto-ne-vspomnit'})),/Группа не сохранена/);
  assert.equal(store.state.groups[0].title,'Никто не вспомнит');
});


test('profile customization is validated, persistent and cannot self-assign badges/roles',async()=>{
  const {store,storage}=harness();await store.init();
  const u=await store.signup({username:'writer',email:'writer@example.com',password:'password'});
  await store.updateProfile({displayName:'Автор',role:'admin',founder:true,badges:['Поддельный'],customization:{accent:'#123456',website:'https://example.com',showLocation:false,genres:['Драма']}});
  assert.equal(u.role,'author');assert.ok(!u.founder);assert.ok(!u.badges.includes('Поддельный'));
  await assert.rejects(store.updateProfile({customization:{avatarUrl:'javascript:alert(1)'}}));
  await assert.rejects(store.setBadges('cnizroman',['Поддельный']));
  const next=harness({storage});await next.store.init();assert.equal(next.store.currentUser().customization.accent,'#123456');
});

test('only owner can edit work/chapters; admin shelf does not adopt other authors work',async()=>{
  const {store}=harness();await store.init();
  const writer=await store.signup({username:'writer',email:'writer@example.com',password:'password'});
  const w={...clone(store.state.works[0]),id:store.uid(),authorId:writer.id,title:'Реальная работа автора',legacyUrl:null};await store.upsertWork(w);
  const chapter={id:store.uid(),workId:w.id,title:'Глава',body:'Реальный текст',status:'draft',order:1};await store.upsertChapter(chapter);
  await founder(store);
  assert.equal(store.state.works.filter(w=>w.authorId===store.currentUser().id).length,6);
  await assert.rejects(store.upsertWork({...w,title:'Чужая правка'}));
  await assert.rejects(store.upsertChapter({...chapter,body:'Чужая правка'}));
  await assert.rejects(store.deleteChapter(chapter.id));
  await store.setBadges(writer.id,['Мастер атмосферы']);assert.deepEqual(clone(writer.badges),['Мастер атмосферы']);
  await store.setBadges(writer.id,[]);assert.deepEqual(clone(writer.badges),[]);
});

test('unverified cnizroman profile does not get founder works or admin role',async()=>{
  const remote=async url=>({ok:true,text:async()=>JSON.stringify(new URL(url).pathname.endsWith('/profiles')?[{id:'unverified',username:'cnizroman',role:'author',is_founder:false}]:[])});
  const {store}=harness({remote});await store.init();store.setSession({authorId:'unverified',token:'test'});
  assert.equal(store.currentUser().role,'author');assert.equal(store.state.works.filter(w=>w.authorId==='unverified').length,0);
  await assert.rejects(store.setBadges('unverified',['Фальшивый админ']));
});

test('cloud mode rejects old local founder session and never falls back to local password login',async()=>{
  const local=harness();await local.store.init();await founder(local.store);
  const remote=async url=>new URL(url).pathname.startsWith('/functions/')?{ok:false,status:404,text:async()=>'{"message":"not deployed"}'}:{ok:true,text:async()=>JSON.stringify([])};
  const {store}=harness({storage:local.storage,remote});await store.init();assert.equal(store.currentUser(),null);
  await assert.rejects(store.login({login:'cnizroman',password:'demo1234'}));assert.equal(store.currentUser(),null);
});

test('failed cloud chapter save does not masquerade as saved data',async()=>{
  const {store}=harness();await store.init();await founder(store);
  const w={...clone(store.state.works[0]),id:store.uid(),legacyUrl:null};await store.upsertWork(w);
  const remote=async(url,opts={})=>opts.method==='POST'?{ok:false,status:403,text:async()=>'{"message":"denied"}'}:{ok:true,text:async()=>JSON.stringify([])};
  const cloud=harness({remote});await cloud.store.init();cloud.store.state.authors.push({id:'writer',username:'writer'});cloud.store.state.works.push({...w,authorId:'writer'});cloud.store.setSession({authorId:'writer',token:'test'});
  await assert.rejects(cloud.store.upsertChapter({id:cloud.store.uid(),workId:w.id,title:'Глава',body:'Текст',status:'draft',order:1}));
  assert.equal(cloud.store.state.chapters.length,0);
});


test('source ownership is repaired and external legacy links cannot execute scripts',async()=>{
  const local=harness();await local.store.init();const db=clone(local.store.state);db.works[0].authorId='wrong-author';
  const next=harness({db});await next.store.init();assert.equal(next.store.state.works[0].authorId,'cnizroman');
  const remote=async url=>({ok:true,text:async()=>JSON.stringify(new URL(url).pathname.endsWith('/works')?[{id:'foreign-work',author_id:'writer',title:'Текст',legacy_url:'javascript:alert(1)'}]:[])});
  const cloud=harness({remote});await cloud.store.init();assert.equal(cloud.store.state.works.find(w=>w.id==='foreign-work').legacyUrl,null);
});


test('profile media is uploaded with a binary content type and is owned by current user',async()=>{
 const requests=[];
 const remote=async(url,opts={})=>{requests.push({url,opts});return {ok:true,text:async()=>JSON.stringify([])};};
 const {store}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'test'});
 const result=await store.uploadProfileImage(new Blob(['image bytes'],{type:'image/webp'}),'avatarUrl');
 assert.match(result,/profile-media\/writer\/avatarUrl-/);
 const upload=requests.find(r=>r.opts.method==='POST'&&r.url.includes('/storage/'));assert.equal(upload.opts.headers['Content-Type'],'image/webp');assert.ok(upload.opts.body instanceof Blob);
 await assert.rejects(store.uploadProfileImage(new Blob(['x'],{type:'image/svg+xml'}),'avatarUrl'));
 await store.removeProfileImage('https://example.invalid/storage/v1/object/public/profile-media/someone-else/file.webp');assert.equal(requests.filter(r=>r.opts.method==='DELETE').length,0);
 await store.removeProfileImage(result);assert.equal(requests.filter(r=>r.opts.method==='DELETE').length,1);
});

test('OAuth is real linking only: local and link-only networks cannot claim connected status',async()=>{
 const {store}=harness();await store.init();await founder(store);
 await assert.rejects(store.beginSocialLink('github'),/общей базой/);
 assert.deepEqual(clone(await store.socialIdentities()),[]);
});

test('OAuth callback validates nonce, account and actual identity; token is stripped from URL',async()=>{
 let returnedId='writer';
 const remote=async(url,opts={})=>({ok:true,text:async()=>JSON.stringify(new URL(url).pathname==='/auth/v1/user'?{id:returnedId,identities:[{provider:'github'}]}:[])});
 const {store,ctx,ephemeral}=harness({remote});await store.init();store.setSession({authorId:'writer',token:'old'});
 let clean='';ctx.history={replaceState:(_,__,url)=>{clean=url;}};
 const attempt=async(nonce='nonce',expires=Date.now()+60000)=>{ephemeral.set('chernila_social_pending',JSON.stringify({nonce:'nonce',expires,authorId:'writer',provider:'github'}));ctx.location.href='https://site.test/Ink/?ink_social='+nonce+'#access_token=new-token&refresh_token=refresh';await store.completeSocialReturn();return JSON.parse(ephemeral.get('chernila_social_result'));};
 assert.equal((await attempt()).ok,true);assert.equal(store.session.token,'new-token');assert.ok(!clean.includes('token'));assert.equal(clean,'/Ink/#/profile');
 store.setSession({authorId:'writer',token:'old'});returnedId='someone-else';assert.equal((await attempt()).ok,false);assert.equal(store.session.token,'old');
 returnedId='writer';assert.equal((await attempt('wrong-nonce')).ok,false);assert.equal(store.session.token,'old');
 assert.equal((await attempt('nonce',1)).ok,false);
});

test('cloud rejects data URLs in profiles and does not allow last identity to be unlinked',async()=>{
 const remote=async url=>({ok:true,text:async()=>JSON.stringify(new URL(url).pathname==='/auth/v1/user'?{id:'writer',identities:[{identity_id:'one',provider:'github'}]}:[])});
 const {store}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer',displayName:'Writer'});store.setSession({authorId:'writer',token:'test'});
 await assert.rejects(store.updateProfile({customization:{avatarUrl:'data:image/png;base64,AAAA'}}));
 await assert.rejects(store.unlinkSocial('one'),/последний/);
});


test('refresh tokens renew cloud sessions without granting a different identity',async()=>{
 const storage=new Map(),expired='x.'+Buffer.from(JSON.stringify({exp:1})).toString('base64url')+'.x';
 storage.set('chernila_session_v2',JSON.stringify({authorId:'writer',token:expired,refreshToken:'old-refresh',expiresAt:1}));
 let refreshed=false;
 const remote=async(url,opts={})=>{if(new URL(url).pathname==='/auth/v1/token'){refreshed=true;assert.equal(JSON.parse(opts.body).refresh_token,'old-refresh');return {ok:true,text:async()=>JSON.stringify({access_token:'renewed',refresh_token:'new-refresh',expires_in:3600,user:{id:'writer'}})};}return {ok:true,text:async()=>JSON.stringify(new URL(url).pathname==='/rest/v1/profiles'?[{id:'writer',username:'writer'}]:[])};};
 const {store}=harness({storage,remote});await store.init();assert.ok(refreshed);assert.equal(store.session.token,'renewed');assert.equal(store.currentUser().id,'writer');
});


test('OAuth cancellation scrubs error parameters and preserves the current account',async()=>{
 const remote=async()=>({ok:true,text:async()=>JSON.stringify([])}),{store,ctx,ephemeral}=harness({remote});await store.init();store.setSession({authorId:'writer',token:'original'});
 ephemeral.set('chernila_social_pending',JSON.stringify({nonce:'cancel',authorId:'writer',provider:'github',expires:Date.now()+60000}));let clean='';ctx.history={replaceState:(_,__,url)=>clean=url};ctx.location.href='https://site.test/Ink/?ink_social=cancel&error=access_denied&error_description=private#access_token=discard';
 await store.completeSocialReturn();assert.equal(store.session.token,'original');assert.equal(clean,'/Ink/#/profile');assert.equal(JSON.parse(ephemeral.get('chernila_social_result')).ok,false);
});

test('expired-session requests share one refresh and never adopt another account',async()=>{
 let refreshCount=0,wrong=false;
 const remote=async(url,opts={})=>{if(new URL(url).pathname==='/auth/v1/token'){refreshCount++;await new Promise(resolve=>setTimeout(resolve,5));return {ok:true,text:async()=>JSON.stringify({access_token:'renewed',refresh_token:'refresh',expires_in:3600,user:{id:wrong?'someone-else':'writer'}})};}return {ok:true,text:async()=>JSON.stringify(new URL(url).pathname==='/auth/v1/user'?{id:'writer',identities:[]}:[])};};
 const {store}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'expired',refreshToken:'refresh',expiresAt:1});await Promise.all([store.socialIdentities(),store.socialIdentities()]);assert.equal(refreshCount,1);assert.equal(store.session.authorId,'writer');
 wrong=true;store.setSession({authorId:'writer',token:'expired',refreshToken:'refresh',expiresAt:1});await assert.rejects(store.socialIdentities());assert.equal(store.session,null);
});


test('regular email confirmation is not misreported as a failed social connection',async()=>{
 const {store,ctx,ephemeral}=harness({remote:async()=>({ok:true,text:async()=>JSON.stringify([])})});await store.init();let clean='';ctx.history={replaceState:(_,__,url)=>clean=url};ctx.location.href='https://site.test/Ink/#access_token=confirmation-token';await store.completeSocialReturn();assert.equal(clean,'/Ink/#/auth');assert.equal(ephemeral.get('chernila_social_result'),undefined);assert.equal(store.session,null);
});


test('PostgREST Prefer is scoped to REST and never sent to Auth or Edge login',async()=>{
 const requests=[];const remote=async(url,opts={})=>{requests.push({url,opts});const path=new URL(url).pathname;return {ok:true,text:async()=>JSON.stringify(path==='/functions/v1/username-login'||path==='/auth/v1/token'?{access_token:'session',refresh_token:'refresh',user:{id:'writer',email:'writer@example.test'}}:path==='/rest/v1/profiles'?[{id:'writer',username:'writer'}]:[])};};
 const {store}=harness({remote});await store.init();await store.login({login:'writer',password:'correct-password'});
 assert.equal(requests.find(x=>x.url.includes('/functions/')).opts.headers.Prefer,undefined);assert.equal(requests.find(x=>x.url.includes('/rest/')).opts.headers.Prefer,'return=representation');
 await store.login({login:'writer@example.test',password:'correct-password'});assert.equal(requests.find(x=>x.url.includes('/auth/v1/token')).opts.headers.Prefer,undefined);
});

test('login infrastructure failures are not reported as incorrect credentials',async()=>{
 for(const status of [404,500,502]){const remote=async(url)=>new URL(url).pathname.startsWith('/functions/')?{ok:false,status,text:async()=>'{"message":"upstream failure"}'}:{ok:true,text:async()=>JSON.stringify([])};const {store}=harness({remote});await store.init();await assert.rejects(store.login({login:'cnizroman',password:'correct-password'}),new RegExp('HTTP '+status));assert.equal(store.session,null);}
});

test('profile headers are always expanded and saving without removed fields preserves avatar fallback',async()=>{
 const {store}=harness();await store.init();await founder(store);const hue=store.currentUser().hue;
 assert.equal(store.cleanCustomization({layout:'compact'}).layout,'expanded');await store.updateProfile({displayName:'Имя автора',customization:{layout:'compact'}});assert.equal(store.currentUser().hue,hue);assert.equal(store.currentUser().customization.layout,'expanded');
});

test('social linking checks enabled Auth providers before redirect and supports current X identities',async()=>{
 let enabled=false,authorization='',redirect='';const remote=async(url)=>{const p=new URL(url).pathname;let body=[];
 if(p==='/auth/v1/settings')body={external:{x:enabled,github:false,email:true}};
 if(p==='/auth/v1/user')body={id:'writer',email_confirmed_at:'2026-01-01',identities:[{provider:'email'}]};
 if(p==='/auth/v1/user/identities/authorize'){assert.equal(new URL(url).searchParams.get('skip_http_redirect'),'true');authorization=url;body={url:'https://x.com/oauth/authorize'};}
 return {ok:true,text:async()=>JSON.stringify(body)};};
 const {store,ctx,ephemeral}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'session'});ctx.location={origin:'https://site.test',pathname:'/Ink/',assign:url=>redirect=url};
 await assert.rejects(store.beginSocialLink('twitter'),/не настроена/);assert.equal(authorization,'');assert.equal(ephemeral.get('chernila_social_pending'),undefined);
 enabled=true;await store.beginSocialLink('twitter');assert.match(authorization,/provider=x&/);assert.equal(redirect,'https://x.com/oauth/authorize');assert.equal(JSON.parse(ephemeral.get('chernila_social_pending')).provider,'x');
});


test('OAuth launch errors distinguish transport, response format, and actual disabled configuration',async()=>{
 for(const fault of ['network','format','url','http','credentials','manual','provider','session']){
  const remote=async(url,opts={})=>{const path=new URL(url).pathname;let body=[];
   if(path==='/auth/v1/settings')body={external:{github:true}};
   if(path==='/auth/v1/user')body={id:'writer',email_confirmed_at:'2026-01-01'};
   if(path==='/auth/v1/user/identities/authorize'){
    assert.equal(opts.redirect,'error');assert.equal(new URL(url).searchParams.get('skip_http_redirect'),'true');
    if(fault==='network')throw new TypeError('Failed to fetch');
    if(fault==='format')return {ok:true,text:async()=>'<html>not JSON</html>'};
    if(['url','http','credentials'].includes(fault))return {ok:true,text:async()=>JSON.stringify({url:{url:'not a URL',http:'http://provider.test',credentials:'https://user:secret@provider.test'}[fault]})};
    const error_code={manual:'manual_linking_disabled',provider:'provider_disabled',session:'bad_jwt'}[fault];return {ok:false,status:fault==='session'?401:400,text:async()=>JSON.stringify({error_code,msg:'upstream failure'})};
   }
   return {ok:true,text:async()=>JSON.stringify(body)};
  };
  const {store,ctx,ephemeral}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'original'});ctx.location={origin:'https://site.test',pathname:'/Ink/',assign:()=>assert.fail('Failed OAuth must not navigate')};
  await assert.rejects(store.beginSocialLink('github'),error=>{if(fault==='network')assert.match(error.message,/Браузер не получил/);if(fault==='format')assert.match(error.message,/не вернул ссылку/);if(fault==='url')assert.match(error.message,/некорректную ссылку/);if(['http','credentials'].includes(fault)){assert.match(error.message,/небезопасную ссылку/);assert.ok(!error.message.includes('secret'));}if(['network','format'].includes(fault))assert.ok(!error.message.includes('Включите провайдер'));if(fault==='manual')assert.match(error.message,/Allow manual linking/);if(fault==='provider')assert.match(error.message,/провайдер отключён/);if(fault==='session')assert.match(error.message,/Сессия истекла/);return true;});
  assert.equal(store.session.token,'original');assert.equal(ephemeral.get('chernila_social_pending'),undefined);
 }
});

test('cloud signup accepts bare or wrapped pending users without fake sessions or password-login retries',async()=>{
 for(const wrapped of [false,true]){
  const calls=[];const remote=async(url,opts={})=>{const p=new URL(url).pathname;calls.push({url,opts});let body=[];if(p==='/auth/v1/signup'){const user={id:'new-writer',identities:[]};body=wrapped?{user}:user;}return {ok:true,text:async()=>JSON.stringify(body)};};
  const {store,storage}=harness({remote});await store.init();calls.length=0;const result=await store.signup({username:'new_writer',email:'writer@example.com',password:'secret-password'});
  assert.equal(result.confirmationRequired,true);assert.equal(store.session,null);assert.equal(store.currentUser(),null);assert.equal(store.state.authors.some(a=>a.id==='new-writer'),false);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/auth/v1/signup'));assert.equal(calls[0].opts.headers.Prefer,undefined);assert.ok(![...storage.values()].join('').includes('secret-password'));
 }
});
test('signup reports actual SMTP restrictions, email quota and disabled registration separately',async()=>{
 for(const code of ['email_address_not_authorized','over_email_send_rate_limit','signup_disabled']){
  const {store}=harness({remote:async url=>({ok:!url.includes('/auth/v1/signup'),status:400,text:async()=>JSON.stringify(url.includes('/auth/v1/signup')?{error_code:code,msg:'upstream failure'}:[])})});await store.init();
  await assert.rejects(store.signup({username:'new_writer',email:'writer@example.com',password:'secret-password'}),code==='email_address_not_authorized'?/SMTP/:code==='over_email_send_rate_limit'?/лимит писем/:/отключена/);assert.equal(store.session,null);
 }
});
test('cloud signup with an immediate session still loads its actual profile',async()=>{
 const {store}=harness({remote:async url=>{const u=new URL(url);let body=[];if(u.pathname==='/auth/v1/signup')body={user:{id:'new-writer'},access_token:'signup-token',refresh_token:'signup-refresh'};if(u.pathname==='/rest/v1/profiles'&&u.searchParams.has('id'))body=[{id:'new-writer',username:'new_writer',display_name:'Writer',role:'author'}];return {ok:true,text:async()=>JSON.stringify(body)};}});await store.init();await store.signup({username:'new_writer',email:'writer@example.com',password:'secret-password'});assert.equal(store.currentUser().id,'new-writer');assert.equal(store.session.token,'signup-token');assert.equal(store.currentUser().role,'author');
});
test('signup rejects non-Latin usernames instead of silently changing their spelling',async()=>{
 const {store}=harness();await store.init();for(const username of ['ваш_логин','roman!','ab','a'.repeat(31)])await assert.rejects(store.signup({username,email:'writer@example.com',password:'secret-password'}),/Логин:/);
});

test('manual review: ordinary authors cannot publish directly; reject, resubmit, approve and edits invalidate visibility',async()=>{
 const {store}=harness();await store.init();await store.signup({username:'writer',email:'writer@example.com',password:'password'});const user=store.currentUser(),w={...clone(store.state.works[0]),id:store.uid(),authorId:user.id,legacyUrl:null,title:'Review me'};
 await store.upsertWork({...w,moderationStatus:'approved'});const stored=store.state.works.find(x=>x.id===w.id);assert.equal(stored.moderationStatus,'draft');
 const c={id:store.uid(),workId:w.id,title:'Chapter',body:'Text',status:'published',order:1};await store.upsertChapter(c);assert.equal(stored.moderationStatus,'pending');assert.equal(store.isWorkPublic(stored),false);await assert.rejects(store.reviewPublication(w.id,stored.moderationRevision,'approved'),/администратор/);
 store.logout();assert.equal(store.canReadWork(stored),false);await founder(store);await assert.rejects(store.reviewPublication(w.id,stored.moderationRevision,'rejected'),/причину/);await store.reviewPublication(w.id,stored.moderationRevision,'rejected','Change the ending');assert.equal(stored.moderationNote,'Change the ending');
 await store.login({login:'writer',password:'password'});await store.upsertWork({...stored,title:'Revised'});assert.equal(stored.moderationStatus,'draft');await store.submitForReview(w.id);const oldRevision=stored.moderationRevision;await store.upsertChapter({...c,body:'Revised text'});
 await founder(store);await assert.rejects(store.reviewPublication(w.id,oldRevision,'approved'),/изменился/);await store.reviewPublication(w.id,stored.moderationRevision,'approved');assert.equal(store.isWorkPublic(stored),true);
 await store.login({login:'writer',password:'password'});await store.upsertChapter({...c,body:'Unreviewed edit'});assert.equal(store.isWorkPublic(stored),false);assert.equal(stored.moderationStatus,'pending');
});
test('admin-owned publications bypass the queue but private chapter drafts remain drafts',async()=>{
 const {store}=harness();await store.init();await founder(store);const w={...clone(store.state.works[0]),id:store.uid(),legacyUrl:null};await store.upsertWork(w);const c={id:store.uid(),workId:w.id,title:'Chapter',body:'Text',order:1,status:'published'};await store.upsertChapter(c);const own=store.state.works.find(x=>x.id===w.id);assert.equal(store.isWorkPublic(own),true);await store.upsertChapter({...c,id:store.uid(),status:'draft'});assert.equal(own.moderationStatus,'approved');
});
test('cloud publication writes fail closed until database moderation is installed',async()=>{
 const {store}=harness({remote:async()=>({ok:true,text:async()=>JSON.stringify([])})});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'fake'});await assert.rejects(store.upsertWork({id:store.uid(),authorId:'writer',title:'Not safe yet'}),/миграцию/);assert.equal(store.state.works.some(w=>w.title==='Not safe yet'),false);
});
test('cloud moderation uses atomic snapshot and expected revision; failed decisions are not applied or cached publicly',async()=>{
 const row={id:'story',author_id:'writer',title:'Snapshot story',moderation_status:'pending',moderation_revision:4,moderation_note:''};let fail=true,decision;
 const remote=async(url,opts={})=>{const p=new URL(url).pathname;let data=[];
  if(p.endsWith('/moderation_version'))data=1;
  if(p.endsWith('/publication_snapshot'))data={works:[row],chapters:[{id:'chapter',work_id:'story',title:'Chapter',body:'Reviewed snapshot',status:'published',sort_order:1}]};
  if(p.endsWith('/profiles'))data=[{id:'admin',username:'owner',role:'admin'},{id:'writer',username:'writer',role:'author'}];
  if(p.endsWith('/review_publication')){decision=JSON.parse(opts.body);if(fail)return {ok:false,status:400,text:async()=>JSON.stringify({message:'Автор изменил текст. Обновите заявку'})};data={...row,moderation_status:'approved',moderation_revision:5};}
  return {ok:true,text:async()=>JSON.stringify(data)};
 };
 const {store,storage}=harness({remote,storage:new Map([['chernila_session_v2',JSON.stringify({authorId:'admin',token:'fake'})]])});await store.init();assert.equal(store.state.chapters.find(c=>c.id==='chapter').body,'Reviewed snapshot');assert.equal(store.state.works.find(w=>w.id==='story').moderationRevision,4);assert.ok(!storage.get('chernila_db_v2').includes('Reviewed snapshot'));
 await assert.rejects(store.reviewPublication('story',4,'approved'),/изменил текст/);assert.equal(store.state.works.find(w=>w.id==='story').moderationStatus,'pending');assert.equal(decision.p_revision,4);fail=false;await store.reviewPublication('story',4,'approved');assert.equal(store.state.works.find(w=>w.id==='story').moderationStatus,'approved');
});

test('password unlock is memory-only, excludes bodies from cloud cache, expires and clears on logout/reload',async()=>{
 const row={id:'locked',author_id:'writer',title:'Protected story',moderation_status:'approved',moderation_revision:4,password_protected:true,reader_style:{palette:'midnight'}},chapter={id:'secret',work_id:'locked',title:'Hidden title',body:'NEVER CACHE THIS BODY',status:'published',sort_order:1};let fail=true;const requests=[];
 const remote=async(url,opts={})=>{const p=new URL(url).pathname;requests.push({p,opts});let data=[];
  if(p.endsWith('/moderation_version')||p.endsWith('/story_studio_version'))data=1;
  if(p.endsWith('/publication_snapshot'))data={works:[row],chapters:[]};
  if(p.endsWith('/profiles'))data=[{id:'writer',username:'writer',role:'author'}];
  if(p.endsWith('/read_locked_story'))data=fail?{error:'incorrect_password'}:{work:row,chapters:[chapter]};
  if(p.endsWith('/set_story_password'))data=row;
  return {ok:true,text:async()=>JSON.stringify(data)};
 };
 const {store,storage}=harness({remote});await store.init();const w=store.state.works.find(w=>w.id==='locked');assert.equal(w.readerStyle.palette,'midnight');assert.equal(store.canReadStory(w),false);
 await assert.rejects(store.unlockStory('locked','reader-password'),/Неверный/);assert.equal(store.state.chapters.length,0);fail=false;await store.unlockStory('locked','reader-password');assert.equal(store.canReadStory(w),true);assert.equal(store.state.chapters.find(c=>c.id==='secret').body,chapter.body);store.save();assert.ok(![...storage.values()].join('').includes(chapter.body));assert.ok(![...storage.values()].join('').includes('reader-password'));
 store.unlockedStories.get('locked').until=Date.now()-1;assert.equal(store.canReadStory(w),false);await store.unlockStory('locked','reader-password');w.moderationRevision++;assert.equal(store.canReadStory(w),false);await store.unlockStory('locked','reader-password');store.logout();assert.equal(store.canReadStory(w),false);assert.equal(store.state.chapters.length,0);
 const reloaded=harness({remote,storage});await reloaded.store.init();assert.equal(reloaded.store.canReadStory(reloaded.store.state.works.find(w=>w.id==='locked')),false);
 store.setSession({authorId:'writer',token:'fake'});assert.equal(store.canReadStory(w),true);await assert.rejects(store.setStoryPassword('locked','я'.repeat(37)),/байт/);await store.setStoryPassword('locked','new-password');assert.ok(![...storage.values()].join('').includes('new-password'));assert.equal(JSON.parse(requests.find(r=>r.p.endsWith('/set_story_password')).opts.body).p_password,'new-password');
 const local=harness();await local.store.init();await founder(local.store);await assert.rejects(local.store.setStoryPassword(local.store.state.works[0].id,'not-real'),/HTML|серверная/);
});
test('late password response cannot repopulate unlocked bodies after logout; token refresh retains epoch',async()=>{
 let resolve;const row={id:'locked',author_id:'writer',password_protected:true,moderation_status:'approved',moderation_revision:1};
 const remote=async url=>{const p=new URL(url).pathname;let data=[];if(p.endsWith('/moderation_version')||p.endsWith('/story_studio_version'))data=1;if(p.endsWith('/publication_snapshot'))data={works:[row],chapters:[]};if(p.endsWith('/read_locked_story'))await new Promise(r=>resolve=r);return {ok:true,text:async()=>JSON.stringify(p.endsWith('/read_locked_story')?{work:row,chapters:[{id:'s',work_id:'locked',body:'Late secret',status:'published'}]}:data)};};
 const {store}=harness({remote});await store.init();const pending=store.unlockStory('locked','password');await new Promise(r=>setImmediate(r));store.logout();resolve();await assert.rejects(pending,/Аккаунт изменился/);assert.equal(store.state.chapters.length,0);
 store.setSession({authorId:'writer',token:'one'});const epoch=store.sessionEpoch;store.setSession({authorId:'writer',token:'renewed'});assert.equal(store.sessionEpoch,epoch);
});
test('late chapter save cannot cache unseen text under an old public parent after logout',async()=>{
 let release;const row={id:'story',author_id:'writer',title:'Story',moderation_status:'approved',moderation_revision:1};
 const remote=async(url,opts={})=>{const p=new URL(url).pathname;let data=[];if(p.endsWith('/moderation_version'))data=1;if(p.endsWith('/publication_snapshot'))data={works:[row],chapters:[]};if(p.endsWith('/profiles'))data=[{id:'writer',username:'writer',role:'author'}];if(p.endsWith('/chapters')&&opts.method==='POST'){await new Promise(r=>release=r);data=[{id:'chapter',work_id:'story',title:'New chapter',body:'UNSEEN AFTER LOGOUT',status:'published'}];}return {ok:true,text:async()=>JSON.stringify(data)};};
 const {store,storage}=harness({remote,storage:new Map([['chernila_session_v2',JSON.stringify({authorId:'writer',token:'fake'})]])});await store.init();const pending=store.upsertChapter({id:store.uid(),workId:'story',title:'New chapter',body:'UNSEEN AFTER LOGOUT',status:'published',order:1});await new Promise(r=>setImmediate(r));store.logout();release();await assert.rejects(pending,/Аккаунт изменился/);store.save();assert.ok(![...storage.values()].join('').includes('UNSEEN AFTER LOGOUT'));assert.equal(store.state.chapters.length,0);
});
test('Telegram custom OIDC bypasses built-in discovery only, requests minimal scopes and verifies the exact identity on return',async()=>{
 let launched='',callback='',identityProvider='github',owner='writer',blocked=false;const requests=[];
 const remote=async(url,opts={})=>{const u=new URL(url);requests.push({u,opts});let data=[];
  if(u.pathname==='/auth/v1/settings')data={external:{github:true}}; // GoTrue omits custom providers.
  if(u.pathname==='/auth/v1/user')data={id:owner,email_confirmed_at:'2026-01-01',identities:[{identity_id:'email',provider:'email'},{identity_id:'tg',provider:identityProvider,identity_data:{preferred_username:'real_owner'}}]};
  if(u.pathname==='/auth/v1/user/identities/authorize'){callback=u.searchParams.get('redirect_to');if(blocked)return {ok:false,status:400,text:async()=>JSON.stringify({error_code:'validation_failed',msg:'Unsupported provider'})};const target=new URL('https://oauth.telegram.org/auth');target.search=new URLSearchParams({client_id:'fixture',redirect_uri:'https://example.invalid/auth/v1/callback',response_type:'code',scope:'openid profile',state:'fixture-state',code_challenge:'fixture-challenge',code_challenge_method:'S256',redirect_to:callback,skip_http_redirect:'true'}).toString();data={url:target.href.replace(/&/g,'&amp;')};}
  return {ok:true,text:async()=>JSON.stringify(data)};
 };
 const {store,ctx,ephemeral}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer'});store.setSession({authorId:'writer',token:'original'});ctx.location={origin:'https://site.test',pathname:'/Ink/',assign:url=>launched=url};ctx.history={replaceState:(_,__,url)=>{assert.ok(!url.includes('access_token'));}};
 assert.deepEqual(clone(await store.socialProviders()),['github']);await store.beginSocialLink('telegram');assert.ok(launched.startsWith('https://oauth.telegram.org/'));const target=new URL(launched);assert.equal(target.searchParams.get('redirect_uri'),'https://example.invalid/auth/v1/callback');assert.equal(target.searchParams.get('state'),'fixture-state');assert.equal(target.searchParams.get('code_challenge'),'fixture-challenge');assert.equal(target.searchParams.has('redirect_to'),false);assert.equal(target.searchParams.has('skip_http_redirect'),false);assert.ok(!launched.includes('&amp;'));const request=requests.find(r=>r.u.pathname.endsWith('/identities/authorize'));assert.equal(request.u.searchParams.get('provider'),'custom:telegram');assert.equal(request.u.searchParams.get('scopes'),'openid profile');assert.equal(request.u.searchParams.get('skip_http_redirect'),'true');assert.equal(request.opts.headers.Prefer,undefined);assert.equal(request.opts.headers.Authorization,'Bearer original');assert.equal(JSON.parse(ephemeral.get('chernila_social_pending')).provider,'custom:telegram');
 ctx.location.href=callback+'#access_token=tg-session';await store.completeSocialReturn();assert.equal(JSON.parse(ephemeral.get('chernila_social_result')).ok,false);assert.equal(store.session.token,'original');
 await store.beginSocialLink('telegram');identityProvider='custom:telegram';ctx.location.href=callback+'#access_token=tg-session';await store.completeSocialReturn();assert.equal(JSON.parse(ephemeral.get('chernila_social_result')).ok,true);assert.equal(store.session.token,'tg-session');assert.equal(store.currentUser().id,'writer');
 blocked=true;await assert.rejects(store.beginSocialLink('telegram'),/создан и включён OIDC-провайдер custom:telegram/);assert.equal(ephemeral.get('chernila_social_pending'),undefined);
 blocked=false;await store.beginSocialLink('telegram');owner='other';ctx.location.href=callback+'#access_token=other-session';await store.completeSocialReturn();assert.equal(JSON.parse(ephemeral.get('chernila_social_result')).ok,false);assert.equal(store.session.token,'tg-session');
});

test('studio v2 capability persists full styles; v1 preserves old settings and rejects unsupported style without a write',async()=>{
 for(const version of [1,2]){let writes=[];const row={id:'story',author_id:'writer',title:'Story',type:'story',genre:'Драма',reader_style:{},moderation_status:'approved'};
  const remote=async(url,opts={})=>{const p=new URL(url).pathname;let data=[];if(p.endsWith('/moderation_version'))data=1;if(p.endsWith('/story_studio_version'))data=version;if(p.endsWith('/publication_snapshot'))data={works:[row],chapters:[]};if(p.endsWith('/profiles'))data=[{id:'writer',username:'writer',role:'author'}];if(p.endsWith('/works')){if(['POST','PATCH'].includes(opts.method)){const payload=JSON.parse(opts.body);writes.push(payload);data=[{...row,...payload}];}else data=[row];}return {ok:true,text:async()=>JSON.stringify(data)};};
  const {store,ctx}=harness({remote,storage:new Map([['chernila_session_v2',JSON.stringify({authorId:'writer',token:'fake'})]])});await store.init();assert.equal(store.studioReady,true);assert.equal(store.studioVersion,version);
  const style=ctx.InkStory.clean({font:'caveat',pageLayout:'custom',texture:'grid',divider:'moon',size:33}),work={...store.state.works.find(w=>w.id==='story'),readerStyle:style};
  if(version===2){await store.upsertWork(work);assert.deepEqual(clone(writes[0].reader_style),clone(ctx.InkStory.v2(style)));assert.deepEqual(clone(store.state.works.find(w=>w.id==='story').readerStyle),clone(style));}
  else{await assert.rejects(store.upsertWork(work),/STORY_DESIGN_UPGRADE/);assert.equal(writes.length,0);work.readerStyle={palette:'plum',font:'mono'};await store.upsertWork(work);assert.equal(writes[0].reader_style.palette,'plum');assert.equal(Object.keys(writes[0].reader_style).length,9);}
 }
});

test('studio v3 asset API strips untrusted fields, scopes own library and forwards password-gated reads without persisting bytes',async()=>{
 const requests=[],id='11111111-2222-3333-4444-555555555555',remote=async(url,opts={})=>{const u=new URL(url);requests.push({u,opts});let data=[];if(u.pathname.endsWith('/moderation_version'))data=1;if(u.pathname.endsWith('/story_studio_version'))data=3;if(u.pathname.endsWith('/profiles'))data=[{id:'writer',username:'writer',role:'author'}];if(u.pathname.endsWith('/publication_snapshot'))data={works:[],chapters:[]};return {ok:true,text:async()=>JSON.stringify(data)};};
 const {store,storage}=harness({remote});await store.init();store.state.authors.push({id:'writer',username:'writer',role:'author'});store.setSession({authorId:'writer',token:'fixture-token'});const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=';
 await store.putAuthorAsset({id,kind:'cover',label:'Обложка',mime:'image/png',data,owner_id:'forged',role:'admin'});const put=requests.find(r=>r.u.pathname.endsWith('/put_author_asset'));assert.deepEqual(Object.keys(JSON.parse(put.opts.body).p_asset).sort(),['data','id','kind','label','mime']);assert.equal(put.opts.headers.Authorization,'Bearer fixture-token');await store.listAuthorAssets();assert.equal(requests.find(r=>r.u.pathname.endsWith('/author_assets')).u.searchParams.get('owner_id'),'eq.writer');await store.ownAuthorAsset(id);assert.ok(requests.filter(r=>r.u.pathname.endsWith('/author_assets')).at(-1).u.searchParams.get('select').includes('owner_id'));
 await store.workAuthorAssets(id,false,'fixture-password');assert.deepEqual(JSON.parse(requests.find(r=>r.u.pathname.endsWith('/get_work_author_assets')).opts.body),{p_work_id:id,p_password:'fixture-password',p_cover_only:false});await store.deleteAuthorAsset(id);assert.deepEqual(JSON.parse(requests.find(r=>r.u.pathname.endsWith('/delete_author_asset')).opts.body),{p_id:id});store.save();assert.ok(![...storage.values()].join('').includes(data));store.studioVersion=2;await assert.rejects(store.putAuthorAsset({id,kind:'cover',label:'x',mime:'image/png',data}),/WORKSHOP_FREEDOM/);assert.deepEqual(clone(await store.workAuthorAssets(id)),[]);
});
