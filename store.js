/* ============================================================
   ЧЕРНИЛА · Слой данных
   Основной режим — Supabase (Auth + PostgREST напрямую, без SDK).
   Если таблицы платформы ещё не созданы (SQL не выполнен),
   платформа автоматически работает в локальном режиме на
   localStorage, чтобы сайт никогда не был сломан/пуст.
   Подключение общей базы: выполните supabase-platform-schema.sql
   ============================================================ */
(function(){
'use strict';
const LS_DB='chernila_db_v2', LS_SESSION='chernila_session_v2', LS_PROGRESS='chernila_progress_v1';
const cfg = window.CHERNILA_SUPABASE_CONFIG || window.NOBODY_SUPABASE_CONFIG || {};
const SB_URL=(cfg.url||'').replace(/\/$/,''), SB_KEY=cfg.publishableKey||cfg.anonKey||'';

const uid=()=> (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const today=()=>new Date().toISOString().slice(0,10);
function tokenExpiry(token){try{const p=String(token||'').split('.')[1];if(!p)return 0;return (JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))).exp||0)*1000;}catch(_){return 0;}}
function clone(o){return JSON.parse(JSON.stringify(o))}
function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0}return 'h'+Math.abs(h)}

function cleanCustomization(c={},allowDataImages=false){
  const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:f;
  const url=v=>{v=String(v||'').trim();if(!v)return '';if(v.length>1000||!/^https:\/\//i.test(v))throw new Error('Ссылки должны начинаться с https:// и быть не длиннее 1000 символов.');return v;};
  const media=v=>{v=String(v||'');if(allowDataImages&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)&&v.length<=1500000)return v;return url(v);};
  return {avatarUrl:media(c.avatarUrl),bannerUrl:media(c.bannerUrl),socialLinks:InkProfileTools.cleanSocialLinks(c.socialLinks||[]),website:url(c.website),telegram:url(c.telegram),accent:color(c.accent,'#c8a96e'),bannerColor:color(c.bannerColor,'#302418'),pronouns:String(c.pronouns||'').slice(0,60),genres:(Array.isArray(c.genres)?c.genres:[]).map(String).slice(0,8).map(x=>x.slice(0,60)),layout:'expanded',showLocation:c.showLocation!==false,showStats:c.showStats!==false};
}
function safeLegacyUrl(id,url){const seed=window.CHERNILA_SEED.works.find(w=>w.id===id);return seed&&seed.legacyUrl===url?url:null;}
function seedState(){
  const s=clone(window.CHERNILA_SEED);
  s.users=[ // локальный аккаунт основателя (вход в локальном режиме: cnizroman / demo1234)
    ...s.authors.map(a=>({id:a.id,email:a.username+'@chernila.local',pass:hash('demo1234'),authorId:a.id}))
  ];
  return s;
}
/* Миграция старого демо-каталога без сброса реальных аккаунтов и работ.
   Удаляем только явно помеченные демо-записи и встроенные демо-аккаунты. */
function migrateLocal(d){
  if(d.catalogVersion===3) return d;
  const fakeAuthors=new Set((d.authors||[]).filter(a=>a.id!=='cnizroman' &&
    (a.demo===true||a.isDemo===true||(d.users||[]).some(u=>u.authorId===a.id &&
      u.email===a.username+'@chernila.local' && u.pass===hash('demo1234')))).map(a=>a.id));
  const fakeWorks=new Set(d.works.filter(w=>fakeAuthors.has(w.authorId)||w.demo===true||w.isDemo===true).map(w=>w.id));
  d.authors=(d.authors||[]).filter(a=>!fakeAuthors.has(a.id));
  d.users=(d.users||[]).filter(u=>!fakeAuthors.has(u.authorId));
  d.works=d.works.filter(w=>!fakeWorks.has(w.id));
  const oldViews={'ne-s-nachala':12480,'doroga-iz-holoda':18930,'spasatelny-krug':14120,'gde-nas-net':16740,'sem-dney':15210,'belaya-golova':9870};
  d.works.forEach(w=>{if(oldViews[w.id]) w.views=Math.max(0,(w.views||0)-oldViews[w.id]);});
  const teasers=new Set(['c-intro-1','c-b1-1','c-b2-1','c-b3-1','c-b4-1','c-bg-1']);
  d.chapters=(d.chapters||[]).filter(c=>!fakeWorks.has(c.workId)&&!teasers.has(c.id));
  for(const key of ['reviews','comments','likes','shelves','contestEntries'])
    d[key]=(d[key]||[]).filter(r=>!fakeWorks.has(r.workId)&&!fakeAuthors.has(r.userId));
  d.follows=(d.follows||[]).filter(f=>!fakeAuthors.has(f.authorId)&&!fakeAuthors.has(f.followerId));
  d.groups=(d.groups||[]).filter(g=>!fakeAuthors.has(g.authorId));
  d.catalogVersion=3;
  return d;
}
function ensureGroups(state){
  if(!Array.isArray(state.groups)) state.groups=[];
  const founder=state.authors.find(a=>a.username==='cnizroman'&&(a.founder||a.id==='cnizroman'));
  if(founder) state.groups.forEach(g=>{if(g.authorId==='cnizroman') g.authorId=founder.id;});
  // После удаления автором не восстанавливаем цикл при каждом открытии.
  if(!state.groupsInitialized){
    for(const g of window.CHERNILA_SEED.groups||[])
      if(!state.groups.some(x=>x.id===g.id)) state.groups.push({...clone(g),authorId:founder?.id||g.authorId});
    state.groupsInitialized=true;
  }
}
function loadLocal(){
  try{const raw=localStorage.getItem(LS_DB); if(raw){const d=JSON.parse(raw); if(d&&Array.isArray(d.works)){migrateLocal(d); injectFounder(d); ensureGroups(d); saveLocal(d); return d;}}}catch(e){}
  const s=seedState(); s.catalogVersion=3; ensureGroups(s); saveLocal(s); return s;
}
function saveLocal(state){try{localStorage.setItem(LS_DB,JSON.stringify(state));return true;}catch(e){return false;}}

/* ---------- Supabase REST ---------- */
let sbToken=null,refreshFlight=null;
let sbLive=false; // true только после успешной проверки таблиц платформы
function sbHeaders(extra){return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+(sbToken||SB_KEY),'Content-Type':'application/json'},extra||{})}
async function sbFetch(path,opts){
  if(!sbLive) return null; // локальный режим: в сеть не ходим вообще
  const expires=Store.session?.expiresAt||tokenExpiry(sbToken),oldToken=sbToken,requestAuth=opts?.headers?.Authorization;
  if(!path.startsWith('/auth/v1/token')&&sbToken&&Store.session?.refreshToken&&expires&&expires<Date.now()+60000&&(!requestAuth||requestAuth==='Bearer '+sbToken)){
    try{if(!refreshFlight)refreshFlight=Store.refreshSession().finally(()=>{refreshFlight=null;});await refreshFlight;}catch(e){if((e.status===400||e.status===401)&&Store.session?.token===oldToken)Store.setSession(null);throw e;}
    if(requestAuth)opts={...opts,headers:{...opts.headers,Authorization:'Bearer '+sbToken}};
  }
  // Prefer is a PostgREST header, not part of the Auth / Edge CORS contract.
  const headers=Object.assign(sbHeaders(),path.startsWith('/rest/v1/')?{'Prefer':'return=representation'}:{},opts?.headers||{});
  const r=await fetch(SB_URL+path,{...opts,headers});
  const txt=await r.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch(e){}
  if(!r.ok){const error=new Error((data&&(data.message||data.msg||data.error_description))||('Supabase '+r.status));error.status=r.status;error.code=data?.error_code||data?.code||null;throw error;}
  return data;
}
async function probeSupabase(){
  if(!SB_URL||!SB_KEY) return false;
  sbLive=true;
  try{ await sbFetch('/rest/v1/works?select=id&limit=1',{headers:sbHeaders({'Authorization':'Bearer '+SB_KEY})}); return true; }catch(e){ sbLive=false; return false; }
}
/* Маппинг строк Supabase -> внутренняя модель */
function mapProfile(r){return {id:r.id,username:r.username,displayName:r.display_name||r.username,bio:r.bio||'',motto:r.motto||'',location:r.location||'',hue:r.avatar_hue??38,role:r.role||'author',founder:!!r.is_founder,joinedAt:(r.created_at||'').slice(0,10),badges:r.badges||[],customization:(()=>{try{return cleanCustomization(r.customization||{})}catch(_){return cleanCustomization()}})()}}
function mapWork(r){return {id:r.id,authorId:r.author_id,readerStyle:window.InkStory?.clean(r.reader_style)||{},passwordProtected:r.password_protected===true,title:r.title,subtitle:r.subtitle||'',type:r.type,genre:r.genre,tags:r.tags||[],description:r.description||'',status:r.status,ageRating:r.age_rating||'12+',legacyUrl:safeLegacyUrl(r.id,r.legacy_url),featured:!!r.featured,moderationStatus:r.moderation_status||'draft',moderationNote:r.moderation_note||'',moderationRevision:Number(r.moderation_revision)||1,submittedAt:r.submitted_at||null,views:r.views||0,cover:r.cover||{from:'#222',to:'#c8a96e',symbol:'✦'},createdAt:(r.created_at||'').slice(0,10),updatedAt:(r.updated_at||'').slice(0,10)}}
function mapChapter(r){return {id:r.id,workId:r.work_id,title:r.title,body:r.body||'',order:r.sort_order||1,status:r.status||'published',createdAt:(r.created_at||'').slice(0,10)}}


/* Книги основателя встроены в платформу: подмешиваем их к данным Supabase,
   чтобы владельцу не пришлось вносить их в базу вручную. Если основатель
   подтверждён владельцем в базе (is_founder + cnizroman), книги автоматически
   привязываются к его настоящему аккаунту. */
function injectFounder(state){
  const seed=window.CHERNILA_SEED; if(!seed) return;
  const seedFounder=seed.authors.find(a=>a.username==='cnizroman'&&(a.founder||a.id==='cnizroman')); if(!seedFounder) return;
  let founder=state.authors.find(a=>a.username==='cnizroman'&&(a.founder||a.id==='cnizroman'));
  if(!founder){ founder=clone(seedFounder); state.authors.unshift(founder); }
  seed.works.forEach(sw=>{
    const existing=state.works.find(w=>w.id===sw.id);
    if(existing){existing.authorId=founder.id;existing.legacyUrl=sw.legacyUrl;return;}
    const w=clone(sw); w.authorId=founder.id; state.works.push(w);
    seed.chapters.filter(c=>c.workId===sw.id).forEach(sc=>{
      if(!state.chapters.some(c=>c.id===sc.id)) state.chapters.push(clone(sc));
    });
  });
}
/* Настоящий аккаунт cnizroman «усыновляет» встроенного основателя */
function adoptFounderIdentity(state, real){
  if(!real||!real.founder||real.username!=='cnizroman'||real.id==='cnizroman') return;
  if(!state.authors.some(a=>a.id==='cnizroman')) return;
  state.works.forEach(w=>{ if(w.authorId==='cnizroman') w.authorId=real.id; });
  (state.groups||[]).forEach(g=>{ if(g.authorId==='cnizroman') g.authorId=real.id; });
  state.follows.forEach(f=>{ if(f.authorId==='cnizroman') f.authorId=real.id; if(f.followerId==='cnizroman') f.followerId=real.id; });
  state.likes.forEach(l=>{ if(l.userId==='cnizroman') l.userId=real.id; });
  state.shelves.forEach(s=>{ if(s.userId==='cnizroman') s.userId=real.id; });
  state.authors=state.authors.filter(a=>a.id!=='cnizroman');
}

const Store={
  mode:'local', // 'supabase' | 'local'
  state:null, session:null,moderationReady:false,studioReady:false,sessionEpoch:0,unlockedStories:new Map(),
  uid, today,
  cleanCustomization(c){return cleanCustomization(c,this.mode==='local');},

  async init(){
    this.state=loadLocal();
    try{this.session=JSON.parse(localStorage.getItem(LS_SESSION)||'null')}catch(e){this.session=null}
    if(this.session&&this.session.token) sbToken=this.session.token;
    if(this.session?.refreshToken&&(this.session.expiresAt||tokenExpiry(this.session.token))&&(this.session.expiresAt||tokenExpiry(this.session.token))<Date.now()+60000){sbLive=!!SB_URL;try{await this.refreshSession();}catch(e){if(e.status===400||e.status===401)this.setSession(null);}sbLive=false;}
    const ok=await probeSupabase();
    if(ok){
      this.mode='supabase';
      try{this.moderationReady=(await sbFetch('/rest/v1/rpc/moderation_version',{method:'POST',body:'{}'}))===1;}catch(_){this.moderationReady=false;}
      try{this.studioReady=(await sbFetch('/rest/v1/rpc/story_studio_version',{method:'POST',body:'{}'}))===1;}catch(_){this.studioReady=false;}
      if(this.session&&!this.session.token)this.setSession(null);
      await this.completeSocialReturn();
      try{ await this.pullFromSupabase(); }catch(e){ console.warn('Supabase pull failed, using cache',e); }
    }
    return this;
  },
  async pullFromSupabase({strict=false}={}){
    this.publicationReadError=false;
    const publications=this.moderationReady?sbFetch('/rest/v1/rpc/publication_snapshot',{method:'POST',body:'{}'}).then(data=>{if(!Array.isArray(data?.works)||!Array.isArray(data?.chapters))throw new Error('Не удалось получить согласованную версию произведений и глав.');return data;}):null;
    const readFailure=e=>{this.publicationReadError=true;if(strict)throw e;return [];};
    const [profiles,works,chapters,comments,reviews,likes,follows,shelves,contests,entries,groups,founderSettings]=await Promise.all([
      sbFetch('/rest/v1/profiles?select=*&order=created_at.asc').catch(()=>[]),
      (publications?publications.then(data=>data.works):sbFetch('/rest/v1/works?select=*&order=updated_at.desc')).catch(readFailure),
      (publications?publications.then(data=>data.chapters):sbFetch('/rest/v1/chapters?select=*&order=sort_order.asc')).catch(readFailure),
      sbFetch('/rest/v1/comments?select=*&order=created_at.desc').catch(()=>[]),
      sbFetch('/rest/v1/work_reviews?select=*&order=created_at.desc').catch(()=>[]),
      sbFetch('/rest/v1/likes?select=*').catch(()=>[]),
      sbFetch('/rest/v1/follows?select=*').catch(()=>[]),
      this.session?sbFetch('/rest/v1/shelves?select=*').catch(()=>[]):Promise.resolve([]),
      Promise.resolve([]),
      Promise.resolve([]),
      sbFetch('/rest/v1/work_groups?select=*&order=created_at.asc').catch(()=>null),
      sbFetch('/rest/v1/founder_work_settings?select=*').catch(()=>[])
    ]);
    { // Supabase — источник правды (даже если база пока пустая)
      this.state.authors=profiles.map(mapProfile);
      this.state.works=works.map(mapWork);
      this.state.chapters=chapters.map(mapChapter);
      this.state.comments=comments.map(r=>({id:r.id,workId:r.work_id,chapterId:r.chapter_id,userId:r.user_id,name:r.author_name||'Читатель',text:r.text,createdAt:(r.created_at||'').slice(0,10)}));
      this.state.reviews=reviews.map(r=>({id:r.id,workId:r.work_id,userId:r.user_id,name:r.author_name||'Читатель',text:r.text,createdAt:(r.created_at||'').slice(0,10),scores:{plot:r.plot,characters:r.characters,atmosphere:r.atmosphere,style:r.style,emotion:r.emotion}}));
      this.state.likes=likes.map(r=>({userId:r.user_id,workId:r.work_id}));
      this.state.follows=follows.map(r=>({followerId:r.follower_id,authorId:r.author_id}));
      this.state.shelves=shelves.map(r=>({userId:r.user_id,workId:r.work_id,shelf:r.shelf}));
      if(contests.length) this.state.contests=contests.map(r=>({id:r.id,title:r.title,theme:r.theme,description:r.description||'',prize:r.prize||'',deadline:r.deadline,status:r.status}));
      this.state.contestEntries=entries.map(r=>({id:r.id,contestId:r.contest_id,workId:r.work_id,userId:r.user_id,createdAt:(r.created_at||'').slice(0,10)}));
      injectFounder(this.state);
      founderSettings.forEach(r=>{const w=this.state.works.find(w=>w.id===r.work_id&&w.authorId===r.author_id);if(w){const mapped=mapWork({...r.settings,id:w.id,author_id:w.authorId,legacy_url:w.legacyUrl,views:w.views,created_at:w.createdAt,updated_at:w.updatedAt});Object.assign(w,mapped);}});
      // null означает недоступную таблицу, а [] — действительно пустой список.
      if(groups!==null){
        this.state.groups=groups.filter(r=>!r.deleted).map(r=>({id:r.id,authorId:r.author_id,readerStyle:window.InkStory?.clean(r.reader_style)||{},passwordProtected:r.password_protected===true,title:r.title,kind:r.kind,description:r.description||'',workIds:r.work_ids||[]}));
        const founder=this.state.authors.find(a=>a.username==='cnizroman'&&(a.founder||a.id==='cnizroman'));
        // Встроенный цикл показывается, пока автор не сохранил свою версию.
        for(const g of window.CHERNILA_SEED.groups||[])
          if(!groups.some(x=>x.id===g.id)) this.state.groups.push({...clone(g),authorId:founder.id});
      }
      ensureGroups(this.state);
      this.save();
    }
  },
  save(){if(this.mode==='supabase'){const works=this.state.works.filter(w=>this.isWorkPublic(w));saveLocal({...this.state,works,chapters:this.state.chapters.filter(c=>c.status==='published'&&works.some(w=>w.id===c.workId&&!w.passwordProtected))});}else saveLocal(this.state); },
  /* фоновая отправка в Supabase (не ломает UI при ошибке) */
  push(promise){ if(this.mode==='supabase'){ Promise.resolve(promise).catch(e=>console.warn('Supabase write:',e.message)); } else { Promise.resolve(promise).catch(()=>{}); } },

  /* ---------- Сессия / аккаунты ---------- */
  currentUser(){ if(!this.session||(this.mode==='supabase'&&!this.session.token)) return null; return this.state.authors.find(a=>a.id===this.session.authorId)||null; },
  setSession(s){ if(!s||(s.authorId||null)!==(this.session?.authorId||null))this.sessionEpoch++;if(s?.token&&!s.expiresAt)s={...s,expiresAt:tokenExpiry(s.token)};this.session=s; if(s){localStorage.setItem(LS_SESSION,JSON.stringify(s)); sbToken=s.token||null;} else {localStorage.removeItem(LS_SESSION); sbToken=null;} },

  async refreshSession(){
    const original=this.session;if(!original?.refreshToken)return;
    const data=await sbFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:original.refreshToken})});
    if(this.session!==original)throw new Error('Аккаунт изменился во время продления сессии.');
    if(!data?.access_token||!data.user||data.user.id!==original.authorId){const e=new Error('Не удалось продлить сессию своего аккаунта.');e.status=401;throw e;}
    this.setSession({...original,token:data.access_token,refreshToken:data.refresh_token||original.refreshToken,expiresAt:tokenExpiry(data.access_token)||Date.now()+(data.expires_in||3600)*1000});
  },
  async signup({username,displayName,email,password}){
    username=(username||'').trim().toLowerCase();
    if(!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('Логин: от 3 до 30 символов, только латиница, цифры и подчёркивание.');
    if(this.state.authors.some(a=>a.username===username&&!(this.mode==='supabase'&&a.id==='cnizroman'))) throw new Error('Такой логин уже занят.');
    if(!/.+@.+\..+/.test(email||'')) throw new Error('Укажите корректный email.');
    if((password||'').length<6) throw new Error('Пароль: минимум 6 символов.');
    if(this.mode==='supabase'){
      let data;
      try{data=await sbFetch('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:email.trim(),password,data:{username,display_name:displayName||username}})});}
      catch(e){
        if(e.code==='email_address_not_authorized')throw new Error('Почта сайта пока не настроена для регистрации новых пользователей. Сообщите владельцу сайта: email_address_not_authorized (нужен собственный SMTP).');
        if(e.code==='over_email_send_rate_limit')throw new Error('Достигнут лимит писем подтверждения. Не отправляйте форму повторно: попробуйте позже или сообщите владельцу сайта о лимите почты.');
        if(e.code==='signup_disabled'||e.code==='email_provider_disabled')throw new Error('Регистрация по email отключена на сервере. Сообщите владельцу сайта.');
        throw e;
      }
      // GoTrue returns a bare User when confirmation is required, and {user, ...tokens}
      // when a session is available. Do not treat successful pending signup as a failure.
      const authUser=data?.user||(data?.id?data:null);
      if(!authUser?.id)throw new Error('Сервис регистрации вернул некорректный ответ. Повторите позже.');
      const authId=authUser.id,token=data.access_token||null,refreshToken=data.refresh_token||null;
      if(!token)return {confirmationRequired:true};
      sbToken=token;
      // профиль уже создал триггер handle_new_user — просто забираем его
      let author=null;
      try{ const rows=await sbFetch('/rest/v1/profiles?id=eq.'+authId+'&select=*'); if(rows&&rows[0]) author=mapProfile(rows[0]); }catch(e){}
      if(!author){
        author={id:authId,username,displayName:displayName||username,bio:'',motto:'',location:'',hue:Math.floor(Math.random()*360),role:'author',founder:false,joinedAt:today(),badges:['Новый автор']};
        try{ await sbFetch('/rest/v1/profiles',{method:'POST',body:JSON.stringify({id:authId,username,display_name:author.displayName,avatar_hue:author.hue,badges:author.badges})}); }catch(e){}
      }
      adoptFounderIdentity(this.state, author);
      if(!this.state.authors.some(a=>a.id===author.id)) this.state.authors.push(author);
      this.save(); this.setSession({authorId:authId,token,refreshToken,email});
      return author;
    }
    const author={id:uid('author'),username,displayName:displayName||username,bio:'',motto:'',location:'',hue:Math.floor(Math.random()*360),role:'author',joinedAt:today(),badges:['Новый автор']};
    this.state.authors.push(author);
    this.state.users.push({id:author.id,email,pass:hash(password),authorId:author.id});
    this.save(); this.setSession({authorId:author.id,email});
    return author;
  },
  async login({login,password}){
    login=(login||'').trim().toLowerCase();
    if(this.mode==='supabase'){
      let data;
      if(/.+@.+\..+/.test(login)) data=await sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:login,password})});
      else {
        try{data=await sbFetch('/functions/v1/username-login',{method:'POST',body:JSON.stringify({username:login,password})});}
        catch(e){if(e.status===429)throw new Error('Слишком много попыток входа. Подождите и попробуйте снова.');if(e.status===503)throw new Error('Сервис входа временно недоступен. Попробуйте позже.');if(e.status===401)throw new Error('Неверный логин или пароль.');if(e.status===404)throw new Error('Сервис входа по юзернейму не найден (HTTP 404). Пока можно войти по email.');if(e.status)throw new Error('Сервис входа по юзернейму недоступен (HTTP '+e.status+'). Попробуйте позже или войдите по email.');throw new Error('Браузер не смог связаться с сервисом входа. Проверьте соединение или попробуйте войти по email.');}
      }
      if(!data?.access_token||!data.user)throw new Error('Сервис входа вернул некорректный ответ. Попробуйте позже.');
      this.setSession({authorId:data.user.id,token:data.access_token,refreshToken:data.refresh_token,email:data.user.email||login});
      sbToken=data.access_token;
      await this.pullFromSupabase();
      let me=this.state.authors.find(a=>a.id===data.user.id);
      if(!me){ // профиль мог не создаться — создадим
        const uname=(data.user.user_metadata&&data.user.user_metadata.username)||login.split('@')[0];
        me={id:data.user.id,username:uname,displayName:(data.user.user_metadata&&data.user.user_metadata.display_name)||uname,bio:'',motto:'',location:'',hue:180,role:'author',joinedAt:today(),badges:[]};
        this.push(sbFetch('/rest/v1/profiles',{method:'POST',body:JSON.stringify({id:me.id,username:me.username,display_name:me.displayName})}));
        this.state.authors.push(me); this.save();
      }
      adoptFounderIdentity(this.state, me); this.save();
      this.setSession({authorId:me.id,token:data.access_token,refreshToken:data.refresh_token,email:data.user.email||login});
      return me;
    }
    // локальный вход: логин или email + пароль (демо-аккаунты: username / demo1234)
    const author=this.state.authors.find(a=>a.username===login);
    const acc=this.state.users.find(u=>u.email.toLowerCase()===login||(author&&u.authorId===author.id));
    if(!acc||acc.pass!==hash(password||'')) throw new Error('Неверный логин или пароль. Локальный вход основателя: cnizroman / demo1234');
    this.setSession({authorId:acc.authorId,email:acc.email});
    return this.currentUser();
  },
  logout(){ this.unlockedStories.clear();this.setSession(null);if(this.mode==='supabase'){this.state.works=this.state.works.filter(w=>this.isWorkPublic(w));this.state.chapters=this.state.chapters.filter(c=>c.status==='published'&&this.state.works.some(w=>w.id===c.workId&&!w.passwordProtected));this.save();} },
  async uploadProfileImage(blob,slot){
    const me=this.currentUser();if(!me)throw new Error('Войдите в аккаунт.');
    if(!['avatarUrl','bannerUrl'].includes(slot)||!blob||!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>1024*1024)throw new Error('Недопустимое изображение.');
    if(this.mode==='local')return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Не удалось прочитать файл.'));r.readAsDataURL(blob);});
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[blob.type],path=me.id+'/'+slot+'-'+uid()+'.'+ext;
    try{await sbFetch('/storage/v1/object/profile-media/'+path,{method:'POST',headers:sbHeaders({'Content-Type':blob.type,'x-upsert':'false'}),body:blob});}
    catch(e){throw new Error('Файл не загружен. Проверьте bucket profile-media и политики Storage из обновлённого SQL. '+e.message);}
    return SB_URL+'/storage/v1/object/public/profile-media/'+path;
  },
  async removeProfileImage(url){
    const me=this.currentUser(),prefix=SB_URL+'/storage/v1/object/public/profile-media/';
    if(this.mode!=='supabase'||!me||!url?.startsWith(prefix))return;
    const path=url.slice(prefix.length);if(!path.startsWith(me.id+'/')||path.includes('..')||path.includes('?')||path.includes('#'))return;
    await sbFetch('/storage/v1/object/profile-media',{method:'DELETE',body:JSON.stringify({prefixes:[path]})});
  },
  async socialIdentities(){
    if(this.mode!=='supabase')return [];
    if(!this.currentUser())throw new Error('Войдите в аккаунт.');
    const user=await sbFetch('/auth/v1/user');
    if(user.id!==this.currentUser().id)throw new Error('Сессия принадлежит другому аккаунту.');
    return user.identities||[];
  },
  async socialProviders(){
    if(this.mode!=='supabase')return [];
    const settings=await sbFetch('/auth/v1/settings');
    if(!settings?.external||typeof settings.external!=='object')throw new Error('Не удалось проверить доступность соцсетей.');
    return Object.keys(settings.external).filter(p=>settings.external[p]===true);
  },
  async beginSocialLink(network){
    if(this.mode!=='supabase')throw new Error('Настоящее подключение доступно только с общей базой Supabase. Локально можно сохранить публичную ссылку.');
    const me=this.currentUser(),n=InkProfileTools.networks.find(n=>n.id===network);
    if(!me||!n?.provider)throw new Error('Эта сеть доступна только как публичная ссылка, не как OAuth-подключение.');
    // /settings lists built-in providers only, not custom OIDC providers. Never
    // fabricate a 'configured' result: the authenticated authorize endpoint is
    // authoritative for the explicitly supported custom provider.
    const custom=n.provider==='custom:telegram',available=custom?[]:await this.socialProviders();
    const provider=custom?n.provider:InkProfileTools.providers(n).find(p=>available.includes(p));
    if(!provider)throw new Error(n.label+': авторизация ещё не настроена владельцем сайта.');
    const user=await sbFetch('/auth/v1/user');if(user.id!==me.id)throw new Error('Войдите в свой аккаунт заново.');
    if(!user.email_confirmed_at)throw new Error('Сначала подтвердите email аккаунта.');
    const nonce=uid(),redirect=new URL(location.pathname,location.origin);redirect.searchParams.set('ink_social',nonce);
    const pending={nonce,authorId:me.id,network,provider,expires:Date.now()+15*60*1000};
    sessionStorage.setItem('chernila_social_pending',JSON.stringify(pending));
    try{
      // Like auth-js linkIdentity: fetch JSON first, navigate only after a validated URL.
      const query=new URLSearchParams({provider,redirect_to:redirect.href,skip_http_redirect:'true'});
      if(n.scopes)query.set('scopes',n.scopes); // No Telegram phone number or bot messaging permission.
      const data=await sbFetch('/auth/v1/user/identities/authorize?'+query,{redirect:'error'});
      const target=InkProfileTools.socialAuthTarget(data?.url,network,SB_URL+'/auth/v1/callback');
      if(this.session?.authorId!==me.id)throw new Error('Аккаунт изменился. Откройте профиль заново.');
      location.assign(target.href);
    }catch(e){
      sessionStorage.removeItem('chernila_social_pending');
      if(e.code==='manual_linking_disabled')throw new Error('Supabase запретил привязку: включите Allow manual linking.');
      if(custom&&((e.status===400&&e.code==='validation_failed')||e.code==='provider_disabled'||e.code==='custom_provider_not_found'))throw new Error('Telegram: проверьте, что в Auth → Providers создан и включён OIDC-провайдер custom:telegram. Если Custom Providers отсутствует, нужна проверка доступности этой возможности в проекте.');
      if(e.code==='provider_disabled')throw new Error(n.label+': провайдер отключён в Supabase.');
      if(e.status===401)throw new Error('Сессия истекла. Войдите заново и повторите подключение.');
      if(e.status){const code=typeof e.code==='string'&&/^[a-z_]{1,60}$/i.test(e.code)?', '+e.code:'';throw new Error('Не удалось запустить авторизацию '+n.label+' (HTTP '+e.status+code+'). Повторите позже.');}
      if(e.name==='TypeError')throw new Error('Браузер не получил ответ сервиса OAuth. Обновите страницу и повторите подключение.');
      throw e;
    }
  },
  async unlinkSocial(identityId){
    const identities=await this.socialIdentities();if(identities.length<2)throw new Error('Нельзя отключить последний способ входа.');
    const identity=identities.find(x=>(x.identity_id||x.id)===identityId);if(!identity||identity.provider==='email')throw new Error('Нельзя отключить эту идентификацию.');
    await sbFetch('/auth/v1/user/identities/'+encodeURIComponent(identityId),{method:'DELETE'});
  },
  async completeSocialReturn(){
    if(typeof location.href!=='string')return;
    const url=new URL(location.href),hash=new URLSearchParams(url.hash.slice(1));
    if(!url.searchParams.has('ink_social')&&!hash.has('access_token')&&!hash.has('error'))return;
    let pending=null;try{pending=JSON.parse(sessionStorage.getItem('chernila_social_pending')||'null');}catch(_){}
    // Remove credentials from the browser address immediately, before requests or rendering.
    const nonce=url.searchParams.get('ink_social'),providerError=url.searchParams.has('error')||hash.has('error');for(const key of ['ink_social','error','error_code','error_description','access_token','refresh_token','id_token','code'])url.searchParams.delete(key);
    const socialReturn=!!nonce||!!pending;history.replaceState(null,'',url.pathname+url.search+(socialReturn?'#/profile':'#/auth'));
    if(!socialReturn)return; // A regular email-confirmation return is not a social-link failure.
    try{
      if(!pending||pending.nonce!==nonce||!Number.isFinite(pending.expires)||pending.expires<Date.now()||pending.authorId!==this.session?.authorId)throw new Error('Подключение не подтверждено: начните его заново из своего профиля.');
      if(providerError)throw new Error('Соцсеть отказала в доступе или подключение отменено.');
      const token=hash.get('access_token')||this.session?.token;if(!token)throw new Error('Не получена сессия авторизации.');
      const user=await sbFetch('/auth/v1/user',{headers:sbHeaders({'Authorization':'Bearer '+token})});
      if(user.id!==pending.authorId)throw new Error('Соцаккаунт принадлежит другому пользователю. Аккаунты не объединены.');
      if(!(user.identities||[]).some(i=>i.provider===pending.provider))throw new Error('Сеть не подтвердила подключение.');
      this.setSession({...this.session,token,refreshToken:hash.get('refresh_token')||this.session.refreshToken,expiresAt:Number(hash.get('expires_at'))*1000||tokenExpiry(token)});
      sessionStorage.setItem('chernila_social_result',JSON.stringify({ok:true,network:pending.network,message:'Соцаккаунт подключён и подтверждён провайдером.'}));
    }catch(e){sessionStorage.setItem('chernila_social_result',JSON.stringify({ok:false,message:e.message}));}
    finally{sessionStorage.removeItem('chernila_social_pending');}
  },
  async updateProfile(patch){
    const me=this.currentUser();if(!me)throw new Error('Войдите в аккаунт.');
    const next={displayName:String(patch.displayName??me.displayName).trim(),bio:String(patch.bio??me.bio??'').trim(),motto:String(patch.motto??me.motto??'').trim(),location:String(patch.location??me.location??'').trim(),hue:Math.min(360,Math.max(0,Number(patch.hue??me.hue)||0)),customization:cleanCustomization(patch.customization??me.customization??{},this.mode==='local')};
    if(!next.displayName||next.displayName.length>80||next.bio.length>1200||next.motto.length>160||next.location.length>80)throw new Error('Проверьте имя и длину полей профиля.');
    if(this.mode==='supabase')await sbFetch('/rest/v1/profiles?id=eq.'+me.id,{method:'PATCH',body:JSON.stringify({display_name:next.displayName,bio:next.bio,motto:next.motto,location:next.location,avatar_hue:next.hue,customization:next.customization})});
    if(this.mode==='local'){const state={...this.state,authors:this.state.authors.map(a=>a.id===me.id?{...a,...next}:a)};if(!saveLocal(state))throw new Error('Недостаточно места в браузере. Уменьшите изображения или удалите ненужные локальные данные.');}
    Object.assign(me,next);if(this.mode!=='local')this.save();return me;
  },
  async setFeatured(id,featured){
    if(this.currentUser()?.role!=='admin')throw new Error('Только администратор.');
    const w=this.state.works.find(w=>w.id===id);if(!w)throw new Error('Произведение не найдено.');
    if(this.mode==='supabase'){
      if(w.legacyUrl)await sbFetch('/rest/v1/founder_work_settings?on_conflict=work_id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify({work_id:id,author_id:w.authorId,settings:{title:w.title,subtitle:w.subtitle,type:w.type,genre:w.genre,tags:w.tags,description:w.description,status:w.status,age_rating:w.ageRating,cover:w.cover,featured}})});
      else await sbFetch('/rest/v1/works?id=eq.'+id,{method:'PATCH',body:JSON.stringify({featured})});
    }
    w.featured=!!featured;this.save();
  },
  async setBadges(authorId,badges){
    if(this.currentUser()?.role!=='admin')throw new Error('Только администратор может выдавать достижения.');
    const target=this.state.authors.find(a=>a.id===authorId);if(!target)throw new Error('Автор не найден.');
    badges=[...new Set(badges.map(b=>String(b).trim()).filter(Boolean))];
    if(badges.length>30||badges.some(b=>b.length>80))throw new Error('Не более 30 значков, название — до 80 символов.');
    if(this.mode==='supabase')await sbFetch('/rest/v1/profiles?id=eq.'+encodeURIComponent(authorId),{method:'PATCH',body:JSON.stringify({badges})});
    target.badges=badges;this.save();return target;
  },
  assertOwnWork(id){
    const user=this.currentUser(),w=this.state.works.find(w=>w.id===id);
    if(!user||!w||w.authorId!==user.id)throw new Error('Это произведение принадлежит другому автору.');return w;
  },
  isWorkPublic(w){return !!w&&(!!w.legacyUrl||w.moderationStatus==='approved');},
  canReadWork(w){const u=this.currentUser();return !!w&&(this.isWorkPublic(w)||!!u&&(u.id===w.authorId||u.role==='admin'));},
  requireModeration(){if(this.mode==='supabase'&&!this.moderationReady)throw new Error('Премодерация ещё не включена в базе. Владелец должен применить SQL-миграцию ручной проверки. Публикация заблокирована.');},
  async submitForReview(id){
    const w=this.assertOwnWork(id);this.requireModeration();
    if(!this.state.chapters.some(c=>c.workId===id&&c.status==='published'&&c.body.trim()))throw new Error('Подготовьте хотя бы одну главу к публикации.');
    if(this.mode==='supabase'){const data=await sbFetch('/rest/v1/rpc/submit_work_for_review',{method:'POST',body:JSON.stringify({p_work_id:id,p_revision:w.moderationRevision})});Object.assign(w,mapWork(Array.isArray(data)?data[0]:data));}
    else{w.moderationStatus=this.currentUser().role==='admin'?'approved':'pending';w.moderationNote='';w.moderationRevision=(w.moderationRevision||1)+1;w.submittedAt=new Date().toISOString();}
    this.save();return w;
  },
  async reviewPublication(id,revision,decision,note=''){
    if(this.currentUser()?.role!=='admin')throw new Error('Только администратор может проверять публикации.');this.requireModeration();
    const w=this.state.works.find(w=>w.id===id);note=String(note).trim();
    if(!w||w.moderationStatus!=='pending')throw new Error('Заявка больше не ожидает проверки.');
    if(w.moderationRevision!==revision)throw new Error('Текст изменился. Обновите заявку.');
    if(!['approved','rejected'].includes(decision)||note.length>2000||decision==='rejected'&&!note)throw new Error('Укажите причину возврата (до 2000 символов).');
    if(decision==='approved'&&!this.state.chapters.some(c=>c.workId===id&&c.status==='published'&&c.body.trim()))throw new Error('Нет глав для публикации.');
    if(this.mode==='supabase'){const data=await sbFetch('/rest/v1/rpc/review_publication',{method:'POST',body:JSON.stringify({p_work_id:id,p_revision:revision,p_decision:decision,p_note:note})});Object.assign(w,mapWork(Array.isArray(data)?data[0]:data));}
    else{w.moderationStatus=decision;w.moderationNote=note;w.moderationRevision++;}
    this.save();return w;
  },
  /* ---------- Произведения и главы ---------- */
  async upsertWork(w){
    const epoch=this.sessionEpoch;const ex=this.state.works.find(x=>x.id===w.id);
    const user=this.currentUser();
    if(!user||w.authorId!==user.id||(ex&&ex.authorId!==user.id))throw new Error('Можно редактировать только свои произведения.');
    if(!String(w.title||'').trim())throw new Error('Укажите название.');
    if(!w.legacyUrl)this.requireModeration();
    w={...w,moderationStatus:user.role==='admin'?'approved':'draft',moderationNote:'',moderationRevision:(ex?.moderationRevision||0)+1,legacyUrl:safeLegacyUrl(w.id,w.legacyUrl),featured:user.role==='admin'?!!w.featured:!!ex?.featured,updatedAt:today()};
    const row={id:/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(w.id)?w.id:undefined,author_id:w.authorId,title:w.title,subtitle:w.subtitle,type:w.type,genre:w.genre,tags:w.tags,description:w.description,status:w.status,age_rating:w.ageRating,legacy_url:w.legacyUrl,featured:w.featured,cover:w.cover};
    if(this.mode==='supabase'){
      if(this.studioReady&&!w.legacyUrl)row.reader_style=window.InkStory.clean(w.readerStyle||ex?.readerStyle);
      else if(w.readerStyle&&JSON.stringify(w.readerStyle)!==JSON.stringify(ex?.readerStyle)&&JSON.stringify(w.readerStyle)!=='{}')throw new Error('Для сохранения авторского стиля примените SQL настройки мастерской.');
      let saved;
      if(w.legacyUrl) await sbFetch('/rest/v1/founder_work_settings?on_conflict=work_id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify({work_id:w.id,author_id:user.id,settings:row})});
      else{saved=ex?await sbFetch('/rest/v1/works?id=eq.'+w.id,{method:'PATCH',body:JSON.stringify(row)}):await sbFetch('/rest/v1/works',{method:'POST',body:JSON.stringify(row)});if(!saved?.[0])throw new Error('Сервер не подтвердил сохранение произведения.');if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Обновите страницу.');w=mapWork(saved[0]);}
    }
    if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Обновите страницу.');if(ex)Object.assign(ex,w);else this.state.works.unshift(w);this.save();return w;
  },
  canReadStory(w){return !w.passwordProtected||this.currentUser()?.id===w.authorId||this.currentUser()?.role==='admin'||(this.unlockedStories.get(w.id)?.revision===w.moderationRevision&&this.unlockedStories.get(w.id)?.until>Date.now());},
  async unlockStory(id,password){
    if(!this.studioReady)throw new Error('Защита историй ещё не подключена к базе.');
    const epoch=this.sessionEpoch;const data=await sbFetch('/rest/v1/rpc/read_locked_story',{method:'POST',body:JSON.stringify({p_work_id:id,p_password:password})});
    if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Откройте историю заново.');
    if(data?.error)throw new Error(({incorrect_password:'Неверный пароль.',rate_limit:'Слишком много попыток. Попробуйте через 5 минут.',not_found:'История недоступна или ожидает проверки.',not_locked:'Настройки доступа изменились. Обновите страницу.'})[data.error]||'Не удалось открыть историю.');
    if(!data?.work||data.work.id!==id||!Array.isArray(data.chapters))throw new Error('Сервер не подтвердил доступ.');
    const w=this.state.works.find(w=>w.id===id);Object.assign(w,mapWork(data.work));this.state.chapters=this.state.chapters.filter(c=>c.workId!==id).concat(data.chapters.map(mapChapter));this.unlockedStories.set(id,{revision:w.moderationRevision,until:Date.now()+15*60*1000});return w;
  },
  async setStoryPassword(id,password){
    const w=this.assertOwnWork(id);if(w.legacyUrl)throw new Error('Пароль исходного HTML-файла меняется отдельно.');
    if(this.mode!=='supabase'||!this.studioReady)throw new Error('Нужна серверная настройка мастерской. В локальном режиме безопасной парольной защиты нет.');
    if(password!==null&&([...password].length<8||new TextEncoder().encode(password).length>72))throw new Error('Пароль: минимум 8 символов, не более 72 байт UTF-8.');
    const epoch=this.sessionEpoch;const data=await sbFetch('/rest/v1/rpc/set_story_password',{method:'POST',body:JSON.stringify({p_work_id:id,p_password:password})});
    if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Обновите страницу.');if(!data?.id)throw new Error('Сервер не подтвердил изменение пароля.');Object.assign(w,mapWork(data));this.unlockedStories.delete(id);this.save();return w;
  },
  async deleteWork(id){
    const w=this.state.works.find(w=>w.id===id),u=this.currentUser();
    if(!u||!w||(u.id!==w.authorId&&u.role!=='admin'))throw new Error('Нет доступа к удалению.');
    if(w.legacyUrl)throw new Error('Встроенные тексты удаляются из исходников проекта, не из мастерской.');
    if(this.mode==='supabase')await sbFetch('/rest/v1/works?id=eq.'+id,{method:'DELETE'});
    this.state.groups.forEach(g=>{g.workIds=g.workIds.filter(wid=>wid!==id);});
    this.state.works=this.state.works.filter(w=>w.id!==id);
    this.state.chapters=this.state.chapters.filter(c=>c.workId!==id);
    this.save();
  },
  async upsertChapter(c){
    const epoch=this.sessionEpoch;const owner=this.assertOwnWork(c.workId);this.requireModeration();
    if(owner.legacyUrl)throw new Error('Это исходный авторский текст. Его главы редактируются в HTML-файле проекта.');
    const ex=this.state.chapters.find(x=>x.id===c.id);
    if(ex&&ex.workId!==c.workId)throw new Error('Нельзя перенести чужую главу.');
    if(!String(c.title||'').trim()||c.title.length>160||!String(c.body||'').trim()||c.body.length>400000||!['draft','published'].includes(c.status))throw new Error('Проверьте заголовок, текст и статус главы.');
    const w=this.state.works.find(x=>x.id===c.workId);
    const row={id:/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(c.id)?c.id:undefined,work_id:c.workId,title:c.title,body:c.body,sort_order:c.order,status:c.status};
    if(this.mode==='supabase'){const saved=ex?await sbFetch('/rest/v1/chapters?id=eq.'+c.id,{method:'PATCH',body:JSON.stringify(row)}):await sbFetch('/rest/v1/chapters',{method:'POST',body:JSON.stringify(row)});if(!saved?.[0])throw new Error('Сервер не подтвердил сохранение главы.');if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Обновите страницу.');c=mapChapter(saved[0]);const parents=await sbFetch('/rest/v1/works?id=eq.'+c.workId+'&select=*');if(!parents?.[0])throw new Error('Глава сохранена, но статус проверки не получен. Обновите страницу.');if(this.sessionEpoch!==epoch)throw new Error('Аккаунт изменился. Обновите страницу.');Object.assign(w,mapWork(parents[0]));}
    else if(w){w.moderationRevision=(w.moderationRevision||1)+1;if(this.currentUser().role==='admin'){w.moderationStatus='approved';}else if(c.status==='published'||ex?.status==='published'){w.moderationStatus=c.status==='published'?'pending':'draft';w.moderationNote='';w.submittedAt=c.status==='published'?new Date().toISOString():null;}}
    if(w)w.updatedAt=today();if(ex)Object.assign(ex,c);else this.state.chapters.push(c);this.save();return c;
  },
  async deleteChapter(id){ this.requireModeration();const c=this.state.chapters.find(x=>x.id===id);if(!c)throw new Error('Глава не найдена.');this.assertOwnWork(c.workId);if(this.mode==='supabase')await sbFetch('/rest/v1/chapters?id=eq.'+id,{method:'DELETE'});this.state.chapters=this.state.chapters.filter(c=>c.id!==id);const w=this.state.works.find(w=>w.id===c.workId);if(this.mode==='supabase'){const rows=await sbFetch('/rest/v1/works?id=eq.'+c.workId+'&select=*');if(rows?.[0])Object.assign(w,mapWork(rows[0]));}else if(w){w.moderationRevision=(w.moderationRevision||1)+1;if(c.status==='published'&&this.currentUser().role!=='admin')w.moderationStatus='draft';}this.save(); },
  addView(workId){ const w=this.state.works.find(x=>x.id===workId); if(w&&this.isWorkPublic(w)){w.views=(w.views||0)+1; this.save(); this.push(sbFetch('/rest/v1/rpc/increment_work_views',{method:'POST',body:JSON.stringify({p_work_id:workId})}));} },

  /* ---------- Циклы / группы (порядок хранится в workIds) ---------- */
  async upsertGroup(g){
    const user=this.currentUser(), ex=this.state.groups.find(x=>x.id===g.id);
    if(!user || (ex && ex.authorId!==user.id)) throw new Error('Можно изменять только свои группы.');
    const title=(g.title||'').trim(), ids=g.workIds||[];
    if(!title || title.length>140) throw new Error('Название группы: от 1 до 140 символов.');
    if(!['cycle','dilogy','trilogy','tetralogy','series'].includes(g.kind)) throw new Error('Выберите тип группы.');
    if((g.description||'').length>2000) throw new Error('Описание: не более 2000 символов.');
    if(!ids.length || ids.length>100 || new Set(ids).size!==ids.length) throw new Error('Выберите от 1 до 100 произведений без повторов.');
    if(ids.some(id=>!this.state.works.some(w=>w.id===id&&w.authorId===user.id))) throw new Error('В группу можно добавить только свои существующие произведения.');
    const group={id:ex?ex.id:uid(),authorId:user.id,title,kind:g.kind,description:(g.description||'').trim(),workIds:[...ids]};
    if(this.mode==='supabase'){
      const row={id:group.id,author_id:group.authorId,title,kind:group.kind,description:group.description,work_ids:group.workIds,deleted:false};
      try{await sbFetch('/rest/v1/work_groups?on_conflict=id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(row)});}
      catch(e){throw new Error('Группа не сохранена в общей базе. Выполните обновлённый supabase-platform-schema.sql. '+e.message);}
    }
    if(ex) Object.assign(ex,group); else this.state.groups.push(group);
    this.save(); return group;
  },
  async deleteGroup(id){
    const g=this.state.groups.find(x=>x.id===id), user=this.currentUser();
    if(!g||!user||g.authorId!==user.id) throw new Error('Можно удалить только свою группу.');
    if(this.mode==='supabase') await sbFetch('/rest/v1/work_groups?on_conflict=id',{method:'POST',headers:sbHeaders({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify({id:g.id,author_id:g.authorId,title:g.title,kind:g.kind,description:g.description,work_ids:[],deleted:true})});
    this.state.groups=this.state.groups.filter(x=>x.id!==id); this.save();
  },

  /* ---------- Социальное ---------- */
  toggleLike(workId){ const me=this.currentUser(); if(!me) return false;
    const i=this.state.likes.findIndex(l=>l.userId===me.id&&l.workId===workId);
    if(i>=0){this.state.likes.splice(i,1); this.push(sbFetch('/rest/v1/likes?user_id=eq.'+me.id+'&work_id=eq.'+workId,{method:'DELETE'}));}
    else{this.state.likes.push({userId:me.id,workId}); this.push(sbFetch('/rest/v1/likes',{method:'POST',body:JSON.stringify({user_id:me.id,work_id:workId})}));}
    this.save(); return true; },
  setShelf(workId,shelf){ const me=this.currentUser(); if(!me) return;
    this.state.shelves=this.state.shelves.filter(s=>!(s.userId===me.id&&s.workId===workId));
    if(shelf) this.state.shelves.push({userId:me.id,workId,shelf});
    this.save();
    this.push(sbFetch('/rest/v1/shelves?user_id=eq.'+me.id+'&work_id=eq.'+workId,{method:'DELETE'}));
    if(shelf) this.push(sbFetch('/rest/v1/shelves',{method:'POST',body:JSON.stringify({user_id:me.id,work_id:workId,shelf})}));
  },
  toggleFollow(authorId){ const me=this.currentUser(); if(!me||me.id===authorId) return;
    const i=this.state.follows.findIndex(f=>f.followerId===me.id&&f.authorId===authorId);
    if(i>=0){this.state.follows.splice(i,1); this.push(sbFetch('/rest/v1/follows?follower_id=eq.'+me.id+'&author_id=eq.'+authorId,{method:'DELETE'}));}
    else{this.state.follows.push({followerId:me.id,authorId}); this.push(sbFetch('/rest/v1/follows',{method:'POST',body:JSON.stringify({follower_id:me.id,author_id:authorId})}));}
    this.save(); },
  addComment(workId,text,chapterId){ const me=this.currentUser(); if(!me) throw new Error('Войдите, чтобы комментировать.');
    const c={id:uid('com'),workId,chapterId:chapterId||null,userId:me.id,name:me.displayName,text,createdAt:today()};
    this.state.comments.unshift(c); this.save();
    this.push(sbFetch('/rest/v1/comments',{method:'POST',body:JSON.stringify({id:c.id,work_id:workId,chapter_id:/^[0-9a-f]{8}-/.test(chapterId||'')?chapterId:null,user_id:me.id,author_name:me.displayName,text})}));
    return c; },
  deleteComment(id){ this.state.comments=this.state.comments.filter(c=>c.id!==id); this.save(); this.push(sbFetch('/rest/v1/comments?id=eq.'+id,{method:'DELETE'})); },
  addReview(workId,text,scores){ const me=this.currentUser(); if(!me) throw new Error('Войдите, чтобы оставить рецензию.');
    if(this.state.reviews.some(r=>r.workId===workId&&r.userId===me.id)) throw new Error('Вы уже оставили рецензию на это произведение.');
    const r={id:uid('rev'),workId,userId:me.id,name:me.displayName,text,scores,createdAt:today()};
    this.state.reviews.unshift(r); this.save();
    this.push(sbFetch('/rest/v1/work_reviews',{method:'POST',body:JSON.stringify({id:r.id,work_id:workId,user_id:me.id,author_name:me.displayName,text,plot:scores.plot,characters:scores.characters,atmosphere:scores.atmosphere,style:scores.style,emotion:scores.emotion})}));
    return r; },
  deleteReview(id){ this.state.reviews=this.state.reviews.filter(r=>r.id!==id); this.save(); this.push(sbFetch('/rest/v1/work_reviews?id=eq.'+id,{method:'DELETE'})); },
  enterContest(contestId,workId){ const me=this.currentUser(); if(!me) throw new Error('Войдите, чтобы участвовать.');
    if(this.state.contestEntries.some(e=>e.contestId===contestId&&e.workId===workId)) throw new Error('Эта работа уже заявлена в конкурс.');
    const e={id:uid('ce'),contestId,workId,userId:me.id,createdAt:today()};
    this.state.contestEntries.push(e); this.save();
    this.push(sbFetch('/rest/v1/contest_entries',{method:'POST',body:JSON.stringify({id:e.id,contest_id:contestId,work_id:workId,user_id:me.id})}));
    return e; },

  /* ---------- Прогресс чтения ---------- */
  progress:{ get(){try{return JSON.parse(localStorage.getItem(LS_PROGRESS)||'{}')}catch(e){return{}}},
    set(workId,chapterId,pct){const p=this.get();p[workId]={chapterId,pct,at:Date.now()};try{localStorage.setItem(LS_PROGRESS,JSON.stringify(p))}catch(e){}} },

  resetDemo(){ localStorage.removeItem(LS_DB); localStorage.removeItem(LS_SESSION); location.hash='#/'; location.reload(); }
};
window.Store=Store;
})();
