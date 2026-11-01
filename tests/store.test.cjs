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
  const ctx={console,crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},location:{reload(){}},fetch:remote};
  ctx.window=ctx;
  if(remote) ctx.CHERNILA_SUPABASE_CONFIG={url:'https://example.invalid',anonKey:'public'};
  vm.createContext(ctx);
  for(const file of ['data.js','store.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  return {ctx,store:ctx.Store,storage:values};
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
