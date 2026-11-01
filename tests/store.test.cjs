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

test('deleting a work removes membership, not other works',async()=>{
  const {store}=harness();await store.init();await founder(store);
  store.deleteWork('sem-dney');
  assert.equal(store.state.works.length,5);
  assert.ok(!store.state.groups[0].workIds.includes('sem-dney'));
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
    const data=resource==='profiles'?[{id:'real-founder',username:'cnizroman'}]:resource==='work_groups'?rows:[];
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
    return {ok:true,text:async()=>JSON.stringify(name==='profiles'?[{id:'real-founder',username:'cnizroman'}]:[])};
  };
  const {store}=harness({remote});await store.init();
  assert.equal(store.state.groups[0].authorId,'real-founder');
  assert.ok(store.state.groups[0].workIds.every(id=>store.state.works.some(w=>w.id===id&&w.authorId==='real-founder')));
  store.setSession({authorId:'real-founder',token:'test'});
  await assert.rejects(store.upsertGroup(input(['sem-dney'],{id:'nikto-ne-vspomnit'})),/Группа не сохранена/);
  assert.equal(store.state.groups[0].title,'Никто не вспомнит');
});
