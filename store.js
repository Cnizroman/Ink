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
function clone(o){return JSON.parse(JSON.stringify(o))}
function hash(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0}return 'h'+Math.abs(h)}

function seedState(){
  const s=clone(window.CHERNILA_SEED);
  s.users=[ // локальный аккаунт основателя (вход в локальном режиме: cnizroman / demo1234)
    ...s.authors.map(a=>({id:a.id,email:a.username+'@chernila.local',pass:hash('demo1234'),authorId:a.id}))
  ];
  return s;
}
function loadLocal(){
  try{const raw=localStorage.getItem(LS_DB); if(raw){const d=JSON.parse(raw); if(d&&d.works) return d;}}catch(e){}
  const s=seedState(); saveLocal(s); return s;
}
function saveLocal(state){ try{localStorage.setItem(LS_DB,JSON.stringify(state))}catch(e){} }

/* ---------- Supabase REST ---------- */
let sbToken=null;
let sbLive=false; // true только после успешной проверки таблиц платформы
function sbHeaders(extra){return Object.assign({'apikey':SB_KEY,'Authorization':'Bearer '+(sbToken||SB_KEY),'Content-Type':'application/json','Prefer':'return=representation'},extra||{})}
async function sbFetch(path,opts){
  if(!sbLive) return null; // локальный режим: в сеть не ходим вообще
  const r=await fetch(SB_URL+path,Object.assign({headers:sbHeaders()},opts||{}));
  const txt=await r.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch(e){}
  if(!r.ok) throw new Error((data&&(data.message||data.msg||data.error_description))||('Supabase '+r.status));
  return data;
}
async function probeSupabase(){
  if(!SB_URL||!SB_KEY) return false;
  sbLive=true;
  try{ await sbFetch('/rest/v1/works?select=id&limit=1'); return true; }catch(e){ sbLive=false; return false; }
}
/* Маппинг строк Supabase -> внутренняя модель */
function mapProfile(r){return {id:r.id,username:r.username,displayName:r.display_name||r.username,bio:r.bio||'',motto:r.motto||'',location:r.location||'',hue:r.avatar_hue??38,role:r.role||'author',founder:!!r.is_founder,joinedAt:(r.created_at||'').slice(0,10),badges:r.badges||[]}}
function mapWork(r){return {id:r.id,authorId:r.author_id,title:r.title,subtitle:r.subtitle||'',type:r.type,genre:r.genre,tags:r.tags||[],description:r.description||'',status:r.status,ageRating:r.age_rating||'12+',legacyUrl:r.legacy_url||null,featured:!!r.featured,views:r.views||0,cover:r.cover||{from:'#222',to:'#c8a96e',symbol:'✦'},createdAt:(r.created_at||'').slice(0,10),updatedAt:(r.updated_at||'').slice(0,10)}}
function mapChapter(r){return {id:r.id,workId:r.work_id,title:r.title,body:r.body||'',order:r.sort_order||1,status:r.status||'published',createdAt:(r.created_at||'').slice(0,10)}}


/* Книги основателя встроены в платформу: подмешиваем их к данным Supabase,
   чтобы владельцу не пришлось вносить их в базу вручную. Если основатель
   зарегистрировался по-настоящему (username cnizroman), книги автоматически
   привязываются к его настоящему аккаунту. */
function injectFounder(state){
  const seed=window.CHERNILA_SEED; if(!seed) return;
  const seedFounder=seed.authors.find(a=>a.username==='cnizroman'); if(!seedFounder) return;
  let founder=state.authors.find(a=>a.username==='cnizroman');
  if(!founder){ founder=clone(seedFounder); state.authors.unshift(founder); }
  seed.works.forEach(sw=>{
    if(state.works.some(w=>w.id===sw.id||(sw.legacyUrl&&w.legacyUrl===sw.legacyUrl))) return;
    const w=clone(sw); w.authorId=founder.id; state.works.push(w);
    seed.chapters.filter(c=>c.workId===sw.id).forEach(sc=>{
      if(!state.chapters.some(c=>c.id===sc.id)) state.chapters.push(clone(sc));
    });
  });
}
/* Настоящий аккаунт cnizroman «усыновляет» встроенного основателя */
function adoptFounderIdentity(state, real){
  if(!real||real.username!=='cnizroman'||real.id==='cnizroman') return;
  if(!state.authors.some(a=>a.id==='cnizroman')) return;
  state.works.forEach(w=>{ if(w.authorId==='cnizroman') w.authorId=real.id; });
  state.follows.forEach(f=>{ if(f.authorId==='cnizroman') f.authorId=real.id; if(f.followerId==='cnizroman') f.followerId=real.id; });
  state.likes.forEach(l=>{ if(l.userId==='cnizroman') l.userId=real.id; });
  state.shelves.forEach(s=>{ if(s.userId==='cnizroman') s.userId=real.id; });
  state.authors=state.authors.filter(a=>a.id!=='cnizroman');
}

const Store={
  mode:'local', // 'supabase' | 'local'
  state:null, session:null,
  uid, today,

  async init(){
    this.state=loadLocal();
    try{this.session=JSON.parse(localStorage.getItem(LS_SESSION)||'null')}catch(e){this.session=null}
    if(this.session&&this.session.token) sbToken=this.session.token;
    const ok=await probeSupabase();
    if(ok){
      this.mode='supabase';
      try{ await this.pullFromSupabase(); }catch(e){ console.warn('Supabase pull failed, using cache',e); }
    }
    return this;
  },
  async pullFromSupabase(){
    const [profiles,works,chapters,comments,reviews,likes,follows,shelves,contests,entries]=await Promise.all([
      sbFetch('/rest/v1/profiles?select=*&order=created_at.asc').catch(()=>[]),
      sbFetch('/rest/v1/works?select=*&order=updated_at.desc').catch(()=>[]),
      sbFetch('/rest/v1/chapters?select=*&order=sort_order.asc').catch(()=>[]),
      sbFetch('/rest/v1/comments?select=*&order=created_at.desc').catch(()=>[]),
      sbFetch('/rest/v1/work_reviews?select=*&order=created_at.desc').catch(()=>[]),
      sbFetch('/rest/v1/likes?select=*').catch(()=>[]),
      sbFetch('/rest/v1/follows?select=*').catch(()=>[]),
      this.session?sbFetch('/rest/v1/shelves?select=*').catch(()=>[]):Promise.resolve([]),
      sbFetch('/rest/v1/contests?select=*&order=deadline.asc').catch(()=>[]),
      sbFetch('/rest/v1/contest_entries?select=*').catch(()=>[])
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
      saveLocal(this.state);
    }
  },
  save(){ saveLocal(this.state); },
  /* фоновая отправка в Supabase (не ломает UI при ошибке) */
  push(promise){ if(this.mode==='supabase'){ Promise.resolve(promise).catch(e=>console.warn('Supabase write:',e.message)); } else { Promise.resolve(promise).catch(()=>{}); } },

  /* ---------- Сессия / аккаунты ---------- */
  currentUser(){ if(!this.session) return null; return this.state.authors.find(a=>a.id===this.session.authorId)||null; },
  setSession(s){ this.session=s; if(s){localStorage.setItem(LS_SESSION,JSON.stringify(s)); sbToken=s.token||null;} else {localStorage.removeItem(LS_SESSION); sbToken=null;} },

  async signup({username,displayName,email,password}){
    username=(username||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
    if(username.length<3) throw new Error('Логин: минимум 3 символа, только латиница, цифры и подчёркивание.');
    if(this.state.authors.some(a=>a.username===username)) throw new Error('Такой логин уже занят.');
    if(!/.+@.+\..+/.test(email||'')) throw new Error('Укажите корректный email.');
    if((password||'').length<6) throw new Error('Пароль: минимум 6 символов.');
    if(this.mode==='supabase'){
      const data=await sbFetch('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password,data:{username,display_name:displayName||username}})});
      let authId=data.user&&data.user.id, token=data.access_token||null;
      if(!authId) throw new Error('Не удалось создать аккаунт. Попробуйте другой email.');
      if(!token){ // почта подтверждается триггером в базе — просто входим
        try{ const li=await sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})}); token=li.access_token; authId=li.user.id; }
        catch(e){ throw new Error('Аккаунт создан. Если вход не удался, подтвердите email по письму и войдите.'); }
      }
      sbToken=token;
      // профиль уже создал триггер handle_new_user — просто забираем его
      let author=null;
      try{ const rows=await sbFetch('/rest/v1/profiles?id=eq.'+authId+'&select=*'); if(rows&&rows[0]) author=mapProfile(rows[0]); }catch(e){}
      if(!author){
        author={id:authId,username,displayName:displayName||username,bio:'',motto:'',location:'',hue:Math.floor(Math.random()*360),role:username==='cnizroman'?'admin':'author',founder:username==='cnizroman',joinedAt:today(),badges:['Новый автор']};
        try{ await sbFetch('/rest/v1/profiles',{method:'POST',body:JSON.stringify({id:authId,username,display_name:author.displayName,avatar_hue:author.hue,badges:author.badges})}); }catch(e){}
      }
      adoptFounderIdentity(this.state, author);
      if(!this.state.authors.some(a=>a.id===author.id)) this.state.authors.push(author);
      this.save(); this.setSession({authorId:authId,token,email});
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
    if(this.mode==='supabase' && /.+@.+\..+/.test(login)){
      const data=await sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:login,password})});
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
      this.setSession({authorId:me.id,token:data.access_token,email:login});
      return me;
    }
    // локальный вход: логин или email + пароль (демо-аккаунты: username / demo1234)
    const author=this.state.authors.find(a=>a.username===login);
    const acc=this.state.users.find(u=>u.email.toLowerCase()===login||(author&&u.authorId===author.id));
    if(!acc||acc.pass!==hash(password||'')) throw new Error('Неверный логин или пароль. Локальный вход основателя: cnizroman / demo1234');
    this.setSession({authorId:acc.authorId,email:acc.email});
    return this.currentUser();
  },
  logout(){ this.setSession(null); },
  updateProfile(patch){
    const me=this.currentUser(); if(!me) return;
    Object.assign(me,patch); this.save();
    this.push(sbFetch('/rest/v1/profiles?id=eq.'+me.id,{method:'PATCH',body:JSON.stringify({display_name:me.displayName,bio:me.bio,motto:me.motto,location:me.location,avatar_hue:me.hue})}));
  },

  /* ---------- Произведения и главы ---------- */
  upsertWork(w){
    const ex=this.state.works.find(x=>x.id===w.id);
    w.updatedAt=today();
    if(ex) Object.assign(ex,w); else this.state.works.unshift(w);
    this.save();
    const row={id:/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(w.id)?w.id:undefined,author_id:w.authorId,title:w.title,subtitle:w.subtitle,type:w.type,genre:w.genre,tags:w.tags,description:w.description,status:w.status,age_rating:w.ageRating,legacy_url:w.legacyUrl,featured:w.featured,cover:w.cover};
    if(ex) this.push(sbFetch('/rest/v1/works?id=eq.'+w.id,{method:'PATCH',body:JSON.stringify(row)}));
    else this.push(sbFetch('/rest/v1/works',{method:'POST',body:JSON.stringify(row)}));
    return w;
  },
  deleteWork(id){
    this.state.works=this.state.works.filter(w=>w.id!==id);
    this.state.chapters=this.state.chapters.filter(c=>c.workId!==id);
    this.save(); this.push(sbFetch('/rest/v1/works?id=eq.'+id,{method:'DELETE'}));
  },
  upsertChapter(c){
    const ex=this.state.chapters.find(x=>x.id===c.id);
    if(ex) Object.assign(ex,c); else this.state.chapters.push(c);
    const w=this.state.works.find(x=>x.id===c.workId); if(w) w.updatedAt=today();
    this.save();
    const row={id:/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(c.id)?c.id:undefined,work_id:c.workId,title:c.title,body:c.body,sort_order:c.order,status:c.status};
    if(ex) this.push(sbFetch('/rest/v1/chapters?id=eq.'+c.id,{method:'PATCH',body:JSON.stringify(row)}));
    else this.push(sbFetch('/rest/v1/chapters',{method:'POST',body:JSON.stringify(row)}));
    return c;
  },
  deleteChapter(id){ this.state.chapters=this.state.chapters.filter(c=>c.id!==id); this.save(); this.push(sbFetch('/rest/v1/chapters?id=eq.'+id,{method:'DELETE'})); },
  addView(workId){ const w=this.state.works.find(x=>x.id===workId); if(w){w.views=(w.views||0)+1; this.save(); this.push(sbFetch('/rest/v1/rpc/increment_work_views',{method:'POST',body:JSON.stringify({p_work_id:workId})}));} },

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
