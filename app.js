/* ============================================================
   ЧЕРНИЛА · Приложение платформы (SPA, hash-роутер)
   Главная · Каталог · Произведение · Читалка · Авторы ·
   Конкурсы · Лента · Полка · Студия автора · Редактор ·
   Профиль · Админка · Рецензии по 5 критериям (наследие
   системы Cnizroman: сюжет 5 + персонажи/атмосфера/стиль/
   эмоции по 4 = максимум 21 балл)
   ============================================================ */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPE_LABEL={}; (window.CHERNILA_SEED?.types||[]).forEach(t=>TYPE_LABEL[t.id]=t.label);
const STATUS_LABEL={completed:'Завершено',ongoing:'В процессе',frozen:'Заморожено'};
const SHELVES={want:'Хочу прочитать',reading:'Читаю',done:'Прочитано',fav:'Избранное'};
const CRITERIA=[{id:'plot',label:'Сюжет',max:5},{id:'characters',label:'Персонажи',max:4},{id:'atmosphere',label:'Атмосфера',max:4},{id:'style',label:'Язык и стиль',max:4},{id:'emotion',label:'Эмоциональное воздействие',max:4}];
const COVERS=[['#2b2113','#c8a96e'],['#0b2029','#73b9d4'],['#1d1030','#a67bc4'],['#06231d','#6fffd6'],['#1a0505','#a83232'],['#12301a','#79c26a'],['#2e0f22','#d87bab'],['#101d33','#5e84c4'],['#33200d','#e0a75e'],['#1c1c1c','#e8e2d4']];
const SYMBOLS=['✦','☾','✒','❧','◐','⌂','≋','✉','◎','☀','❄','▲','◉','❦'];
let S=null; // Store.state

/* ---------- производные данные ---------- */
const author=id=>S.authors.find(a=>a.id===id)||{displayName:'Неизвестный автор',username:'?',hue:40};
const work=id=>S.works.find(w=>w.id===id);
const chaptersOf=(wid,all)=>S.chapters.filter(c=>c.workId===wid&&(all||c.status==='published')).sort((a,b)=>a.order-b.order);
const likesOf=wid=>S.likes.filter(l=>l.workId===wid).length;
const followersOf=aid=>S.follows.filter(f=>f.authorId===aid).length;
const commentsOf=wid=>S.comments.filter(c=>c.workId===wid);
const reviewsOf=wid=>S.reviews.filter(r=>r.workId===wid);
const reviewTotal=r=>CRITERIA.reduce((s,c)=>s+(+r.scores[c.id]||0),0);
function rating(wid){const rs=reviewsOf(wid); if(!rs.length) return null; const avg=rs.reduce((s,r)=>s+reviewTotal(r),0)/rs.length; return {total:avg, outOf10:(avg/21*10), count:rs.length,
  by:Object.fromEntries(CRITERIA.map(c=>[c.id, rs.reduce((s,r)=>s+(+r.scores[c.id]||0),0)/rs.length]))};}
const words=t=>(t||'').trim().split(/\s+/).filter(Boolean).length;
const workWords=w=>chaptersOf(w.id,true).reduce((s,c)=>s+words(c.body),0);
const fmt=n=>n>=1000?(n/1000).toFixed(1).replace('.0','')+' тыс.':String(n);
const readTime=w=>Math.max(1,Math.round(workWords(w)/180));
const me=()=>Store.currentUser();
const isLiked=wid=>{const u=me();return u&&S.likes.some(l=>l.userId===u.id&&l.workId===wid)};
const myShelf=wid=>{const u=me();const s=u&&S.shelves.find(x=>x.userId===u.id&&x.workId===wid);return s?s.shelf:''};
const isFollowing=aid=>{const u=me();return u&&S.follows.some(f=>f.followerId===u.id&&f.authorId===aid)};

/* ---------- разметка текста (безопасный мини-markdown) ---------- */
function renderText(text,poetry){
  const inline=s=>esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>');
  if(poetry) return esc(text||'').split('\n').map(l=>l.trim()?`<span class="line">${inline(l)}</span>`:'<span class="line">&nbsp;</span>').join('');
  return (text||'').split(/\n\s*\n/).map(p=>{
    p=p.trim(); if(!p) return '';
    if(p==='---') return '<hr>';
    if(p.startsWith('> ')) return `<blockquote>${inline(p.slice(2))}</blockquote>`;
    if(p.startsWith('## ')) return `<h3>${inline(p.slice(3))}</h3>`;
    return `<p>${inline(p).replace(/\n/g,'<br>')}</p>`;
  }).join('');
}
/* ---------- компоненты ---------- */
const ava=(a,cls='')=>`<span class="avatar ${cls}" style="background:linear-gradient(135deg,hsl(${a.hue??38} 45% 62%),hsl(${(a.hue??38)+40} 40% 38%))" aria-hidden="true">${esc((a.displayName||'?').trim()[0]||'?')}</span>`;
function coverHTML(w){const a=author(w.authorId);return `<div class="cover" style="background:linear-gradient(150deg,${esc(w.cover?.from||'#222')},${esc(w.cover?.to||'#c8a96e')})">
  <span class="cov-type">${esc(TYPE_LABEL[w.type]||w.type)} · ${esc(w.genre)}</span><span class="cov-symbol">${esc(w.cover?.symbol||'✦')}</span>
  <span><span class="cov-title">${esc(w.title)}</span><span class="cov-author" style="display:block">${esc(a.displayName)}</span></span></div>`}
function workCard(w){const r=rating(w.id),a=author(w.authorId),prog=Store.progress.get()[w.id];
  return `<article class="work-card reveal"><a href="#/work/${w.id}" aria-label="${esc(w.title)}">${coverHTML(w)}</a>
  <div class="work-body"><div style="display:flex;gap:7px;flex-wrap:wrap"><span class="pill">${esc(TYPE_LABEL[w.type]||'')}</span><span class="pill">${esc(STATUS_LABEL[w.status]||w.status)}</span>${w.legacyUrl?'<span class="pill gold">Первый автор</span>':''}</div>
  <h3><a href="#/work/${w.id}">${esc(w.title)}</a></h3>
  <div class="small muted">✒ <a href="#/author/${a.id}">${esc(a.displayName)}</a> · ${esc(w.genre)} · ${esc(w.ageRating)}</div>
  <p>${esc(w.description)}</p>
  ${prog?`<div class="progress-line" title="Прочитано ${Math.round(prog.pct)}%"><i style="width:${prog.pct}%"></i></div>`:''}
  <div class="work-meta"><span class="rate">${r?('★ '+r.outOf10.toFixed(1)+' · '+r.count+' рец.'):'☆ пока без рецензий'}</span><span>👁 ${fmt(w.views||0)}</span><span>♥ ${likesOf(w.id)}</span><span>${chaptersOf(w.id).length} гл.</span><span>~${readTime(w)} мин</span></div>
  </div></article>`}
function authorCard(a){const ws=S.works.filter(w=>w.authorId===a.id);const likes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  return `<article class="author-card reveal">${ava(a,'lg')}<div style="flex:1"><h3><a href="#/author/${a.id}">${esc(a.displayName)}</a></h3>
  <div class="small muted">@${esc(a.username)}${a.founder?' · <span style="color:var(--gold)">основатель платформы</span>':''}${a.location?' · '+esc(a.location):''}</div>
  ${a.motto?`<div style="font-family:var(--body);font-style:italic;color:var(--gold2);margin-top:5px">«${esc(a.motto)}»</div>`:''}<p>${esc(a.bio||'Автор пока ничего о себе не рассказал.')}</p>
  <div class="work-meta"><span>${ws.length} произведений</span><span>${followersOf(a.id)} подписчиков</span><span>♥ ${likes}</span></div>
  ${(a.badges||[]).map(b=>`<span class="pill gold" style="margin:8px 6px 0 0">${esc(b)}</span>`).join('')}</div></article>`}
function toast(msg,err){const t=$('#toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(t._h);t._h=setTimeout(()=>t.className='toast',3400)}
function needAuth(){ if(me()) return true; toast('Войдите или зарегистрируйтесь, чтобы продолжить',true); location.hash='#/auth'; return false; }
function setNav(key){$$('#mainNav a').forEach(a=>a.classList.toggle('on',a.dataset.nav===key)); $('#readProgress').style.width='0'}
function renderUserChip(){const u=me(); $('#userChip').innerHTML = u
  ? `<a href="#/author/${u.id}" style="display:flex;align-items:center;gap:9px">${ava(u)}<span class="uname" style="font-weight:700">${esc(u.displayName)}</span></a><a class="btn sm" href="#/studio/new">+ Писать</a><button class="btn ghost sm" data-action="logout">Выйти</button>`
  : `<a class="btn ghost sm" href="#/auth">Войти</a><a class="btn sm" href="#/auth?mode=signup">Стать автором</a>`;
  $('#modeBanner').hidden = Store.mode==='supabase';
}

/* ================= СТРАНИЦЫ ================= */
function pageHome(){
  setNav('home');
  const featured=S.works.filter(w=>w.featured), fresh=[...S.works].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,8);
  const top=[...S.works].map(w=>({w,r:rating(w.id)})).filter(x=>x.r).sort((a,b)=>b.r.outOf10-a.r.outOf10).slice(0,5);
  const topAuthors=[...S.authors].sort((a,b)=>followersOf(b.id)-followersOf(a.id)).slice(0,6);
  const totalViews=S.works.reduce((s,w)=>s+(w.views||0),0);
  const quotes=[...S.authors.filter(a=>a.motto).map(a=>`«${a.motto}» — ${a.displayName}`),'Никого не вспомнят. Пока он не напишет','Читайте медленно. Пишите честно','Каждая история заслуживает своего читателя'].join(' &nbsp;✦&nbsp; ');
  const cont=Store.progress.get(); const contWorks=Object.keys(cont).map(work).filter(Boolean).slice(0,4);
  $('#app').innerHTML=`
  <div class="wrap">
    <header class="hero reveal"><div class="kicker">Платформа для авторов · рассказы · романы · стихотворения</div>
      <h1>Никого не вспомнят.<br><em>Пока он не напишет.</em></h1>
      <p class="hero-lead">«Чернила» — место, где истории находят читателей, а авторы — друг друга. Публикуйте рассказы, романы, повести, стихи и эссе. Получайте честные рецензии по пяти критериям. Читайте медленно.</p>
      <div class="hero-actions"><a class="btn" href="#/catalog">Начать читать →</a><a class="btn ghost" href="#/studio/new">✒ Опубликовать своё</a><a class="btn ghost" href="#/contests">Конкурсы</a></div>
      <div class="hero-stats">
        <div class="hstat"><b>${S.works.length}</b><span>произведений</span></div>
        <div class="hstat"><b>${S.authors.length}</b><span>авторов</span></div>
        <div class="hstat"><b>${S.chapters.filter(c=>c.status==='published').length}</b><span>глав и текстов</span></div>
        <div class="hstat"><b>${fmt(totalViews)}</b><span>просмотров книг</span></div>
        <div class="hstat"><b>${S.reviews.length}</b><span>рецензий</span></div>
      </div></header>
  </div>
  <div class="marquee" aria-hidden="true"><span class="marquee-track">${quotes} &nbsp;✦&nbsp; ${quotes} &nbsp;✦&nbsp;</span></div>
  <div class="wrap">
    ${contWorks.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Продолжить</div><h2>Вы остановились здесь</h2></div><a class="more" href="#/library">Моя полка →</a></div><div class="grid works">${contWorks.map(workCard).join('')}</div></section>`:''}
    <section class="block"><div class="sec-head"><div><div class="kicker">Выбор платформы</div><h2>Сейчас читают</h2></div><a class="more" href="#/catalog?sort=popular">Весь каталог →</a></div>
      <div class="grid works">${featured.map(workCard).join('')}</div></section>
    <section class="block"><div class="grid two">
      <div><div class="sec-head"><div><div class="kicker">Рейтинг читателей</div><h2>Лучшее по рецензиям</h2></div></div>
        ${top.map((x,i)=>`<a class="rank" href="#/work/${x.w.id}"><span class="n">${i+1}</span>${ava(author(x.w.authorId))}<span style="flex:1"><b style="font-family:var(--serif)">${esc(x.w.title)}</b><br><span class="small muted">${esc(author(x.w.authorId).displayName)} · ${esc(x.w.genre)}</span></span><span class="rate">★ ${x.r.outOf10.toFixed(1)}</span></a>`).join('')||'<div class="empty">Рецензий пока нет</div>'}
        <p class="small muted">Рейтинг считается по фирменной системе «Чернил»: сюжет — до 5 баллов, персонажи, атмосфера, язык и эмоции — до 4. Максимум — 21 балл честной оценки.</p></div>
      <div><div class="sec-head"><div><div class="kicker">Жанры</div><h2>Куда нырнуть?</h2></div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr">${window.CHERNILA_SEED.genres.slice(0,8).map(g=>{const n=S.works.filter(w=>w.genre===g).length;return `<a class="genre-tile" href="#/catalog?genre=${encodeURIComponent(g)}"><h3>${esc(g)}</h3><span class="muted small">${n?n+' произведений':'станьте первым автором здесь ✒'}</span></a>`}).join('')}</div></div>
    </div></section>
    <section class="block"><div class="sec-head"><div><div class="kicker">Обновления</div><h2>Свежее из-под пера</h2></div><a class="more" href="#/feed">Лента обновлений →</a></div>
      <div class="grid works">${fresh.map(workCard).join('')}</div></section>
    <section class="block"><div class="sec-head"><div><div class="kicker">Сообщество</div><h2>Авторы платформы</h2></div><a class="more" href="#/authors">Все авторы →</a></div>
      <div class="grid authors">${topAuthors.map(authorCard).join('')}<a class="author-card" href="${me()?'#/studio/new':'#/auth?mode=signup'}" style="align-items:center;justify-content:center;text-align:center;border-style:dashed"><div><span style="font-family:var(--serif);font-size:2.2rem;color:var(--gold)">✒</span><h3>Следующий автор — вы?</h3><p>Платформа открылась с книгами её основателя. Ваше произведение может стать следующим в каталоге.</p><span class="btn sm" style="margin-top:10px">Опубликовать произведение</span></div></a></div></section>
    <section class="block"><div class="contest-card"><div class="kicker">Первый конкурс платформы</div>
      <h2 style="font-size:clamp(1.8rem,4vw,2.7rem);margin:14px 0">«Первая строка»: рассказ, который начинается со слов «Никто не вспомнит…»</h2>
      <p class="muted" style="max-width:680px">Первая строка задана — всё остальное ваше. Любой жанр, до 15 000 знаков, приём работ открыт. Покажите платформе свой голос.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px"><a class="btn" href="#/contests">Участвовать</a><a class="btn ghost" href="#/studio/new">Сначала написать рассказ</a></div></div></section>
    <section class="block"><div class="panel" style="text-align:center;padding:48px 26px"><div style="font-family:var(--serif);font-size:2.6rem;color:var(--gold)">✒</div>
      <h2 style="font-size:2rem;margin:10px 0">У вас тоже есть история?</h2><p class="muted" style="max-width:560px;margin:0 auto 22px">Регистрация занимает минуту. Редактор, черновики, главы, статистика, подписчики и первые читатели — уже здесь.</p>
      <a class="btn" href="${me()?'#/studio/new':'#/auth?mode=signup'}">Стать автором «Чернил»</a></div></section>
  </div>`;
}

function pageCatalog(params){
  setNav('catalog');
  const q=(params.get('q')||'').toLowerCase(), genre=params.get('genre')||'', type=params.get('type')||'', status=params.get('status')||'', sort=params.get('sort')||'new';
  let list=S.works.filter(w=>{
    const a=author(w.authorId);
    return (!genre||w.genre===genre)&&(!type||w.type===type)&&(!status||w.status===status)&&
      (!q||(w.title+' '+w.description+' '+a.displayName+' '+(w.tags||[]).join(' ')).toLowerCase().includes(q));
  });
  const by={new:(a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''),popular:(a,b)=>(b.views||0)-(a.views||0),rating:(a,b)=>((rating(b.id)?.outOf10||0)-(rating(a.id)?.outOf10||0)),likes:(a,b)=>likesOf(b.id)-likesOf(a.id),az:(a,b)=>a.title.localeCompare(b.title,'ru')};
  list.sort(by[sort]||by.new);
  const chip=(k,v,l)=>`<a class="chipbtn ${(params.get(k)||'')===v?'on':''}" href="#/catalog?${new URLSearchParams({...Object.fromEntries(params),[k]:v}).toString().replace(/=(&|$)/g,'$1')}">${l}</a>`;
  const link=(patch)=>{const p=new URLSearchParams(params);Object.entries(patch).forEach(([k,v])=>v?p.set(k,v):p.delete(k));return '#/catalog?'+p.toString()};
  $('#app').innerHTML=`<div class="wrap"><div class="catalog-layout">
    <aside class="filters panel">
      <form id="catSearch"><label class="field">Поиск<input class="input" name="q" value="${esc(params.get('q')||'')}" placeholder="Название, автор, тег…"></label></form>
      <div><h4>Тип произведения</h4><div class="chiprow"><a class="chipbtn ${!type?'on':''}" href="${link({type:''})}">Все</a>${window.CHERNILA_SEED.types.map(t=>`<a class="chipbtn ${type===t.id?'on':''}" href="${link({type:t.id})}">${t.label}</a>`).join('')}</div></div>
      <div><h4>Жанр</h4><div class="chiprow"><a class="chipbtn ${!genre?'on':''}" href="${link({genre:''})}">Все</a>${window.CHERNILA_SEED.genres.map(g=>`<a class="chipbtn ${genre===g?'on':''}" href="${link({genre:g})}">${g}</a>`).join('')}</div></div>
      <div><h4>Статус</h4><div class="chiprow">${[['','Любой'],['completed','Завершено'],['ongoing','В процессе'],['frozen','Заморожено']].map(([v,l])=>`<a class="chipbtn ${status===v?'on':''}" href="${link({status:v})}">${l}</a>`).join('')}</div></div>
      <label class="field">Сортировка<select id="catSort">${[['new','Сначала обновлённые'],['popular','По просмотрам'],['rating','По рейтингу рецензий'],['likes','По лайкам'],['az','По алфавиту']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <a class="btn ghost sm" href="#/catalog">Сбросить фильтры</a>
    </aside>
    <div><div class="kicker">Каталог</div><h1 style="font-size:2.4rem;margin:12px 0 8px">${genre?esc(genre):type?esc(TYPE_LABEL[type]):'Все произведения'}</h1>
    <p class="muted">Найдено: ${list.length} · всего на платформе: ${S.works.length}</p>
    ${list.length?`<div class="grid works" style="margin-top:22px">${list.map(workCard).join('')}</div>`:`<div class="empty" style="margin-top:22px"><span class="big">✒</span>Здесь пока пусто. Станьте первым, кто опубликует произведение в этом уголке платформы.<br><br><a class="btn" href="#/studio/new">Опубликовать</a></div>`}
    </div></div></div>`;
  $('#catSearch').addEventListener('submit',e=>{e.preventDefault();const v=new FormData(e.target).get('q');location.hash=link({q:v})});
  $('#catSort').addEventListener('change',e=>location.hash=link({sort:e.target.value}));
}

function pageWork(id){
  const w=work(id); if(!w) return page404();
  setNav('catalog'); Store.addView(id);
  const a=author(w.authorId), chs=chaptersOf(id), r=rating(id), revs=reviewsOf(id), u=me(), shelf=myShelf(id);
  const similar=S.works.filter(x=>x.id!==id&&(x.genre===w.genre||x.type===w.type)).slice(0,4);
  const myReview=u&&revs.find(x=>x.userId===u.id);
  $('#app').innerHTML=`<div class="wrap">
    <div class="work-hero reveal"><div>${coverHTML(w)}</div>
    <div><div class="chiprow"><span class="pill gold">${esc(TYPE_LABEL[w.type]||w.type)}</span><span class="pill">${esc(w.genre)}</span><span class="pill">${esc(STATUS_LABEL[w.status]||w.status)}</span><span class="pill">${esc(w.ageRating)}</span>${w.featured?'<span class="pill gold">✦ Выбор платформы</span>':''}</div>
    <h1 style="margin-top:16px">${esc(w.title)}</h1>${w.subtitle?`<p style="font-family:var(--body);font-style:italic;font-size:1.25rem;color:var(--gold2)">${esc(w.subtitle)}</p>`:''}
    <div class="author-line">${ava(a,'md')}<div><a href="#/author/${a.id}" style="font-family:var(--serif);font-size:1.2rem"><b>${esc(a.displayName)}</b></a><div class="small muted">@${esc(a.username)} · ${followersOf(a.id)} подписчиков</div></div>
    ${u&&u.id!==a.id?`<button class="btn ${isFollowing(a.id)?'dark':'ghost'} sm" data-action="follow" data-id="${a.id}" style="margin-left:auto">${isFollowing(a.id)?'✓ Вы подписаны':'+ Подписаться'}</button>`:''}</div>
    <p style="font-family:var(--body);font-size:1.18rem;color:var(--muted)">${esc(w.description)}</p>
    <div class="work-meta" style="font-size:.9rem"><span class="rate" style="font-size:1.05rem">${r?`★ ${r.outOf10.toFixed(1)} / 10 · ${r.total.toFixed(1)} из 21 · ${r.count} рец.`:'☆ Рецензий пока нет'}</span><span>👁 ${fmt(w.views||0)} просмотров</span><span>♥ ${likesOf(id)}</span><span>◈ ${chs.length} глав</span><span>✎ ${fmt(workWords(w))} слов</span><span>⏱ ~${readTime(w)} мин чтения</span><span>обновл. ${esc(w.updatedAt||'')}</span></div>
    <div class="action-row">
      ${chs.length?`<a class="btn" href="#/read/${id}/${chs[0].id}">Читать →</a>`:''}
      ${w.legacyUrl?`<a class="btn ${chs.length?'ghost':''}" href="${esc(w.legacyUrl)}">Читать полный текст в исходной читалке ↗</a>`:''}
      <button class="btn ${isLiked(id)?'':'ghost'}" data-action="like" data-id="${id}">${isLiked(id)?'♥ Нравится':'♡ Нравится'}</button>
      <select id="shelfSel" class="input" style="width:auto;border-radius:99px" aria-label="Добавить на полку"><option value="">📚 На полку…</option>${Object.entries(SHELVES).map(([k,v])=>`<option value="${k}" ${shelf===k?'selected':''}>${v}</option>`).join('')}${shelf?'<option value="__remove">Убрать с полки</option>':''}</select>
      <button class="btn ghost" data-action="share" data-id="${id}">Поделиться</button>
      ${u&&u.id===w.authorId?`<a class="btn dark" href="#/studio/work/${id}">✎ Редактировать в студии</a>`:''}
    </div>
    <div class="chiprow">${(w.tags||[]).map(t=>`<a class="tag" href="#/catalog?q=${encodeURIComponent(t.trim())}">#${esc(t.trim())}</a>`).join('')}</div>
    </div></div>

    <section class="block"><div class="sec-head"><div><div class="kicker">Содержание</div><h2>${w.type==='poetry'?'Тексты':'Главы'} · ${chs.length}</h2></div></div>
    ${chs.length?`<div class="chapter-list">${chs.map((c,i)=>`<a class="chapter-row" href="#/read/${id}/${c.id}"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif);font-size:1.08rem">${esc(c.title)}</b><br><span class="small muted">${fmt(words(c.body))} слов · ~${Math.max(1,Math.round(words(c.body)/180))} мин · ${esc(c.createdAt||'')}</span></span><span style="color:var(--gold)">Читать →</span></a>`).join('')}</div>`
    :`<div class="empty"><span class="big">◈</span>Автор ещё не опубликовал главы.</div>`}</section>

    <section class="block"><div class="sec-head"><div><div class="kicker">Рецензии · система пяти критериев</div><h2>Что говорят читатели</h2></div></div>
    ${r?`<div class="panel" style="margin-bottom:20px"><div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap"><div><span style="font-family:var(--serif);font-size:3.2rem;color:var(--gold2)">${r.outOf10.toFixed(1)}</span><span class="muted"> / 10</span><div class="small muted">${r.total.toFixed(1)} из 21 балла · ${r.count} рецензий</div></div>
      <div class="scorebars" style="flex:1;min-width:260px">${CRITERIA.map(c=>`<div class="scorebar">${c.label} · <b style="color:var(--text)">${r.by[c.id].toFixed(1)}</b>/${c.max}<div class="bar"><i style="width:${r.by[c.id]/c.max*100}%"></i></div></div>`).join('')}</div></div></div>`:''}
    <div>${revs.map(rev=>`<article class="review"><div style="display:flex;gap:12px;align-items:center">${ava(author(rev.userId))}<div style="flex:1"><b>${esc(rev.name)}</b><div class="small muted">${esc(rev.createdAt)}</div></div><span class="rate">★ ${reviewTotal(rev)} / 21</span>${u&&(u.id===rev.userId||u.role==='admin')?`<button class="btn danger sm" data-action="del-review" data-id="${rev.id}">Удалить</button>`:''}</div>
      <p style="font-family:var(--body);font-size:1.08rem">${esc(rev.text)}</p><div class="scorebars">${CRITERIA.map(c=>`<div class="scorebar">${c.label}: <b style="color:var(--text)">${rev.scores[c.id]}</b>/${c.max}<div class="bar"><i style="width:${rev.scores[c.id]/c.max*100}%"></i></div></div>`).join('')}</div></article>`).join('')||'<div class="empty"><span class="big">☆</span>Рецензий пока нет. Прочитали? Станьте первым честным голосом.</div>'}</div>
    ${u? (myReview?'<div class="panel">Вы уже оставили рецензию на это произведение. Спасибо за честный голос ✦</div>':`
    <form class="panel stack" id="reviewForm" style="margin-top:8px"><h3 style="font-size:1.3rem">Написать рецензию</h3>
      ${CRITERIA.map(c=>`<div><span class="small" style="font-weight:800">${c.label} <span class="muted">(0–${c.max})</span></span><div class="stars" data-crit="${c.id}" data-max="${c.max}">${Array.from({length:c.max},(_,i)=>`<button type="button" data-v="${i+1}" aria-label="${c.label}: ${i+1}">★</button>`).join('')}</div></div>`).join('')}
      <div class="small muted" id="revTotal">Итого: 0 / 21</div>
      <label class="field">Текст рецензии<textarea class="input" name="text" rows="4" required maxlength="3000" placeholder="Что зацепило? Что не сработало? Пишите так, как хотели бы прочитать о своём тексте."></textarea></label>
      <button class="btn" type="submit">Опубликовать рецензию</button></form>`)
    :`<div class="panel center"><p>Войдите, чтобы оставить рецензию по пяти критериям.</p><a class="btn" href="#/auth">Войти</a></div>`}
    </section>

    <section class="block"><div class="sec-head"><div><div class="kicker">Обсуждение</div><h2>Комментарии · ${commentsOf(id).length}</h2></div></div>
    <div>${commentsOf(id).map(c=>`<div class="comment">${ava(author(c.userId))}<div style="flex:1"><b>${esc(c.name)}</b> <span class="small muted">${esc(c.createdAt)}</span><p style="margin:5px 0 0;font-family:var(--body);font-size:1.05rem">${esc(c.text)}</p></div>${u&&(u.id===c.userId||u.role==='admin')?`<button class="btn danger sm" data-action="del-comment" data-id="${c.id}">✕</button>`:''}</div>`).join('')||'<p class="muted">Пока тихо. Первое слово — за вами.</p>'}</div>
    ${u?`<form class="stack" id="commentForm" style="margin-top:18px"><label class="field">Ваш комментарий<textarea class="input" name="text" rows="3" required maxlength="1500" placeholder="Делитесь впечатлением — авторы читают всё."></textarea></label><div><button class="btn sm">Отправить</button></div></form>`
    :`<div class="panel center" style="margin-top:14px"><a class="btn sm" href="#/auth">Войти, чтобы комментировать</a></div>`}
    </section>

    ${similar.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Читать дальше</div><h2>Похожие произведения</h2></div></div><div class="grid works">${similar.map(workCard).join('')}</div></section>`:''}
  </div>`;
  const sel=$('#shelfSel'); if(sel) sel.addEventListener('change',()=>{ if(!needAuth())return; Store.setShelf(id, sel.value==='__remove'?null:sel.value||null); toast(sel.value&&sel.value!=='__remove'?'Добавлено на полку: '+SHELVES[sel.value]:'Убрано с полки'); route(); });
  const cf=$('#commentForm'); if(cf) cf.addEventListener('submit',e=>{e.preventDefault();try{Store.addComment(id,new FormData(cf).get('text').trim());toast('Комментарий опубликован');route();}catch(err){toast(err.message,true)}});
  const rf=$('#reviewForm'); if(rf){const scores={plot:0,characters:0,atmosphere:0,style:0,emotion:0};
    $$('.stars',rf).forEach(box=>box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const v=+b.dataset.v;scores[box.dataset.crit]=v;$$('button',box).forEach((x,i)=>x.classList.toggle('on',i<v));$('#revTotal').textContent='Итого: '+Object.values(scores).reduce((s,x)=>s+x,0)+' / 21';}));
    rf.addEventListener('submit',e=>{e.preventDefault();try{Store.addReview(id,new FormData(rf).get('text').trim(),scores);toast('Рецензия опубликована ✦');route();}catch(err){toast(err.message,true)}});}
}

let readerSettings=JSON.parse(localStorage.getItem('chernila_reader')||'{"theme":"dark","size":20}');
function pageRead(wid,cid){
  const w=work(wid); if(!w) return page404();
  const chs=chaptersOf(wid); const idx=chs.findIndex(c=>c.id===cid); if(idx<0) return page404();
  const c=chs[idx], a=author(w.authorId), prev=chs[idx-1], next=chs[idx+1];
  setNav('catalog');
  $('#app').innerHTML=`
  <div class="reader-top"><div class="wrap"><a class="btn ghost sm" href="#/work/${wid}">← К произведению</a>
    <span style="font-family:var(--serif)"><b>${esc(w.title)}</b> <span class="muted">· ${esc(a.displayName)}</span></span>
    <span style="margin-left:auto;display:flex;gap:7px;flex-wrap:wrap">
      <button class="chipbtn" data-action="font" data-v="-1">A−</button><button class="chipbtn" data-action="font" data-v="1">A+</button>
      ${[['dark','Тьма'],['sepia','Бумага'],['light','Свет']].map(([v,l])=>`<button class="chipbtn ${readerSettings.theme===v?'on':''}" data-action="theme" data-v="${v}">${l}</button>`).join('')}
      <button class="chipbtn ${isLiked(wid)?'on':''}" data-action="like" data-id="${wid}">♥ ${likesOf(wid)}</button>
    </span></div></div>
  ${w.legacyUrl?`<div class="wrap"><div class="panel" style="margin-top:22px;text-align:center">✦ Произведение первого автора платформы. Здесь — начало и аннотация, полный текст открывается в исходной авторской читалке.<br><br><a class="btn" href="${esc(w.legacyUrl)}">Читать «${esc(w.title)}» полностью ↗</a></div></div>`:''}
  <article class="reader ${readerSettings.theme} ${w.type==='poetry'?'poetry':''} reveal">
    <div class="kicker" style="justify-content:center">${String(idx+1).padStart(2,'0')} / ${String(chs.length).padStart(2,'0')}</div>
    <h1>${esc(c.title)}</h1><div class="r-meta">${esc(w.title)} · ${esc(a.displayName)} · ${fmt(words(c.body))} слов</div>
    <div class="reader-text" style="font-size:${readerSettings.size}px">${renderText(c.body,w.type==='poetry')}</div>
    <div style="text-align:center;color:var(--gold);margin-top:44px">✦ ✦ ✦</div>
  </article>
  <div class="wrap" style="max-width:760px"><div class="panel">
    <h3 style="margin-bottom:12px">Содержание</h3><div class="chapter-list">${chs.map((x,i)=>`<a class="chapter-row" href="#/read/${wid}/${x.id}" style="${x.id===cid?'border-color:var(--gold)':''}"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif)">${esc(x.title)}</b></span>${x.id===cid?'<span class="pill gold">сейчас</span>':''}</a>`).join('')}</div>
    <h3 style="margin:26px 0 6px">Комментарии к главе · ${commentsOf(wid).filter(x=>x.chapterId===cid).length}</h3>
    ${commentsOf(wid).filter(x=>x.chapterId===cid).map(x=>`<div class="comment">${ava(author(x.userId))}<div><b>${esc(x.name)}</b> <span class="small muted">${esc(x.createdAt)}</span><p style="margin:4px 0 0">${esc(x.text)}</p></div></div>`).join('')||'<p class="muted small">К этой главе пока нет комментариев.</p>'}
    ${me()?`<form id="chComment" class="stack" style="margin-top:14px"><textarea class="input" name="text" rows="2" required placeholder="Ваша мысль об этой главе…"></textarea><div><button class="btn sm">Отправить</button></div></form>`:''}
  </div></div>
  <nav class="reader-nav">${prev?`<a class="btn ghost" href="#/read/${wid}/${prev.id}">← ${esc(prev.title)}</a>`:'<span></span>'}${next?`<a class="btn" href="#/read/${wid}/${next.id}">${esc(next.title)} →</a>`:`<a class="btn" href="#/work/${wid}">Завершить и оценить ★</a>`}</nav>`;
  Store.progress.set(wid,cid,(idx+1)/chs.length*100);
  const cc=$('#chComment'); if(cc) cc.addEventListener('submit',e=>{e.preventDefault();Store.addComment(wid,new FormData(cc).get('text').trim(),cid);toast('Комментарий к главе опубликован');route();});
  const onScroll=()=>{const d=document.documentElement;const p=d.scrollTop/Math.max(1,d.scrollHeight-d.clientHeight)*100;$('#readProgress').style.width=p+'%'};
  addEventListener('scroll',onScroll,{passive:true}); setTimeout(()=>removeEventListener('scroll',onScroll),60000);
}

function pageAuthor(id){
  const a=S.authors.find(x=>x.id===id||x.username===id); if(!a) return page404();
  id=a.id;
  setNav('authors'); const ws=S.works.filter(w=>w.authorId===id); const u=me();
  const totalViews=ws.reduce((s,w)=>s+(w.views||0),0), totalLikes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  const revs=S.reviews.filter(r=>ws.some(w=>w.id===r.workId));
  $('#app').innerHTML=`<div class="wrap"><header style="padding:48px 0 10px" class="reveal">
    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">${ava(a,'lg')}
    <div style="flex:1;min-width:260px"><div class="kicker">${a.founder?'Основатель и первый автор платформы':'Автор «Чернил»'} · с ${esc((a.joinedAt||'').slice(0,7))}</div>
    <h1 style="font-size:clamp(2rem,5vw,3.2rem);margin:10px 0">${esc(a.displayName)}</h1>
    <div class="muted">@${esc(a.username)}${a.location?' · '+esc(a.location):''}</div>
    ${a.motto?`<p style="font-family:var(--body);font-style:italic;font-size:1.3rem;color:var(--gold2)">«${esc(a.motto)}»</p>`:''}
    <p class="muted" style="max-width:700px;font-family:var(--body);font-size:1.12rem">${esc(a.bio||'Автор пока ничего о себе не рассказал.')}</p>
    <div class="chiprow">${(a.badges||[]).map(b=>`<span class="pill gold">✦ ${esc(b)}</span>`).join('')}</div></div>
    <div style="display:flex;flex-direction:column;gap:9px">${u&&u.id!==a.id?`<button class="btn ${isFollowing(a.id)?'dark':''}" data-action="follow" data-id="${a.id}">${isFollowing(a.id)?'✓ Вы подписаны':'+ Подписаться'}</button>`:''}
    ${u&&u.id===a.id?`<a class="btn ghost" href="#/profile">✎ Редактировать профиль</a><a class="btn" href="#/studio">Студия автора</a>`:''}
    ${a.username==='cnizroman'?`<a class="btn ghost" href="https://www.donationalerts.com/r/cnizroman" target="_blank" rel="noopener">Поддержать автора ↗</a>`:''}</div></div>
    <div class="hero-stats"><div class="hstat"><b>${ws.length}</b><span>произведений</span></div><div class="hstat"><b>${followersOf(a.id)}</b><span>подписчиков</span></div>
    <div class="hstat"><b>${S.follows.filter(f=>f.followerId===a.id).length}</b><span>подписок</span></div><div class="hstat"><b>${fmt(totalViews)}</b><span>просмотров</span></div>
    <div class="hstat"><b>${totalLikes}</b><span>лайков</span></div><div class="hstat"><b>${revs.length}</b><span>рецензий получено</span></div></div></header>
    ${a.username==='cnizroman'?`<section class="block"><div class="panel"><div class="kicker">Наследие платформы</div><h2 style="margin:12px 0">Архив автора «Никто не вспомнит»</h2>
      <p class="muted">«Чернила» выросли из личного литературного проекта Cnizroman. Закулисье тетралогии сохранено полностью:</p>
      <div class="chiprow" style="margin-top:12px">${[['archive-references.html','🔗 Отсылки'],['archive-thoughts.html','💭 Изначальные мысли'],['archive-visual.html','🎨 Визуальный архив'],['archive-cut.html','Вырезанное'],['archive-drafts.html','✍ Черновики']].map(([h,l])=>`<a class="chipbtn" href="${h}">${l} ↗</a>`).join('')}</div></div></section>`:''}
    <section class="block"><div class="sec-head"><div><div class="kicker">Библиография</div><h2>Произведения автора</h2></div></div>
    ${ws.length?`<div class="grid works">${ws.map(workCard).join('')}</div>`:'<div class="empty"><span class="big">✒</span>Произведений пока нет.</div>'}</section>
    ${revs.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Голоса читателей</div><h2>Последние рецензии на автора</h2></div></div>
    ${revs.slice(0,3).map(r=>`<article class="review"><b>${esc(r.name)}</b> <span class="muted small">о произведении «${esc(work(r.workId)?.title||'')}» · ★ ${reviewTotal(r)}/21</span><p style="font-family:var(--body);font-size:1.08rem;margin-bottom:0">${esc(r.text)}</p></article>`).join('')}</section>`:''}
  </div>`;
}

function pageAuthors(){
  setNav('authors'); const list=[...S.authors].sort((a,b)=>followersOf(b.id)-followersOf(a.id));
  $('#app').innerHTML=`<div class="wrap" style="padding:48px 0 0"><div class="kicker">Сообщество</div>
  <h1 style="font-size:2.6rem;margin:12px 0">Авторы «Чернил»</h1><p class="muted">${S.authors.length} авторов · ${S.works.length} произведений · подписывайтесь, чтобы видеть новые главы в своей ленте.</p>
  <div class="grid authors" style="margin-top:28px">${list.map(authorCard).join('')}</div>
  <div class="panel center" style="margin-top:30px"><h2>Здесь не хватает одного автора</h2><p class="muted">Вас.</p><a class="btn" href="${me()?'#/studio/new':'#/auth?mode=signup'}">Присоединиться</a></div></div>`;
}

function pageFeed(){
  setNav('feed'); const u=me();
  const items=S.chapters.filter(c=>c.status==='published').map(c=>({c,w:work(c.workId)})).filter(x=>x.w)
    .sort((a,b)=>(b.c.createdAt||'').localeCompare(a.c.createdAt||''));
  const mine=u?items.filter(x=>isFollowing(x.w.authorId)):[]; const show=mine.length?mine:items;
  $('#app').innerHTML=`<div class="wrap" style="padding:48px 0 0;max-width:860px"><div class="kicker">Лента</div>
  <h1 style="font-size:2.6rem;margin:12px 0">${mine.length?'Новые главы ваших авторов':'Лента обновлений платформы'}</h1>
  <p class="muted">${u?(mine.length?'Вы подписаны — вот свежее от ваших авторов.':'Подписывайтесь на авторов, и здесь будет только ваше. Пока — обновления всей платформы.'):'Войдите и подписывайтесь на авторов, чтобы собрать личную ленту.'}</p>
  <div style="margin-top:26px">${show.slice(0,30).map(({c,w})=>{const a=author(w.authorId);return `<a class="feed-item" href="#/read/${w.id}/${c.id}">${ava(a,'md')}<span style="flex:1"><b style="font-family:var(--serif);font-size:1.12rem">${esc(c.title)}</b> <span class="pill">${esc(TYPE_LABEL[w.type]||'')}</span><br>
    <span class="muted small">«${esc(w.title)}» · ${esc(a.displayName)} · ${esc(c.createdAt||'')} · ${fmt(words(c.body))} слов</span><br><span class="muted" style="font-family:var(--body)">${esc(c.body.replace(/\*\*/g,'').slice(0,150))}…</span></span><span style="color:var(--gold)">→</span></a>`}).join('')||'<div class="empty">Лента пуста</div>'}</div></div>`;
}

function pageLibrary(){
  setNav('library'); const u=me();
  if(!u){$('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">📚</span><h2>Ваша полка ждёт вас</h2><p>Закладки, «хочу прочитать», прочитанное и избранное появятся здесь после входа.</p><a class="btn" href="#/auth">Войти</a></div></div>`;return}
  const groups=Object.entries(SHELVES).map(([k,label])=>({k,label,ws:S.shelves.filter(s=>s.userId===u.id&&s.shelf===k).map(s=>work(s.workId)).filter(Boolean)}));
  const prog=Store.progress.get(); const cont=Object.entries(prog).map(([wid,p])=>({w:work(wid),p})).filter(x=>x.w&&x.p.pct<100);
  const liked=S.likes.filter(l=>l.userId===u.id).map(l=>work(l.workId)).filter(Boolean);
  const section=(title,ws)=>ws.length?`<section class="block"><div class="sec-head"><div><h2>${title} · ${ws.length}</h2></div></div><div class="grid works">${ws.map(workCard).join('')}</div></section>`:'';
  $('#app').innerHTML=`<div class="wrap" style="padding-top:48px"><div class="kicker">Личная библиотека · ${esc(u.displayName)}</div><h1 style="font-size:2.6rem;margin:12px 0">Моя полка</h1>
  ${cont.length?`<section class="block"><div class="sec-head"><div><h2>Продолжить чтение</h2></div></div>${cont.map(({w,p})=>`<a class="rank" href="#/read/${w.id}/${p.chapterId}">${ava(author(w.authorId))}<span style="flex:1"><b style="font-family:var(--serif)">${esc(w.title)}</b><br><span class="small muted">прочитано ${Math.round(p.pct)}%</span><span class="progress-line" style="display:block;margin-top:7px"><i style="width:${p.pct}%"></i></span></span><span class="btn sm">Продолжить →</span></a>`).join('')}</section>`:''}
  ${groups.map(g=>section(g.label,g.ws)).join('')}
  ${section('Понравилось',liked)}
  ${!groups.some(g=>g.ws.length)&&!liked.length&&!cont.length?'<div class="empty" style="margin-top:26px"><span class="big">📚</span>Полка пуста. Загляните в каталог и добавьте первое произведение.<br><br><a class="btn" href="#/catalog">В каталог</a></div>':''}
  </div>`;
}

function pageContests(){
  setNav('contests'); const u=me(); const myWorks=u?S.works.filter(w=>w.authorId===u.id):[];
  $('#app').innerHTML=`<div class="wrap" style="padding:48px 0 0"><div class="kicker">Соревнование голосов</div>
  <h1 style="font-size:2.6rem;margin:12px 0">Конкурсы «Чернил»</h1><p class="muted" style="max-width:700px">Конкурс — лучший способ, чтобы нового автора заметили. Победителей определяем по рецензиям читателей и выбору редакции.</p>
  <div style="margin-top:30px">${S.contests.map(c=>{const entries=S.contestEntries.filter(e=>e.contestId===c.id);return `<article class="contest-card reveal">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="pill gold">${c.status==='open'?'● Приём работ открыт':'Скоро'}</span><span class="pill">Дедлайн: ${esc(c.deadline)}</span><span class="pill">Заявлено работ: ${entries.length}</span></div>
    <h2 style="font-size:2rem;margin:14px 0">${esc(c.title)}</h2><p style="font-family:var(--body);font-size:1.2rem;color:var(--gold2)">${esc(c.theme)}</p><p class="muted">${esc(c.description)}</p>
    <p><b>Приз:</b> <span class="muted">${esc(c.prize)}</span></p>
    ${entries.length?`<h3 style="margin:18px 0 10px">Участники</h3><div class="grid works">${entries.map(e=>work(e.workId)).filter(Boolean).map(workCard).join('')}</div>`:''}
    ${c.status==='open'?`<form class="stack contest-form" data-contest="${c.id}" style="margin-top:18px">${u?(myWorks.length?`<div style="display:flex;gap:10px;flex-wrap:wrap"><select name="workId" class="input" style="flex:1;min-width:220px">${myWorks.map(w=>`<option value="${w.id}">${esc(w.title)}</option>`).join('')}</select><button class="btn">Заявить работу</button></div>`:'<p class="muted">У вас пока нет произведений. <a href="#/studio/new" style="color:var(--gold);text-decoration:underline">Написать первое →</a></p>'):`<a class="btn" href="#/auth?mode=signup">Стать автором и участвовать</a>`}</form>`:''}
  </article>`}).join('')}</div></div>`;
  $$('.contest-form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const wid=new FormData(f).get('workId');if(!wid)return;try{Store.enterContest(f.dataset.contest,wid);toast('Работа заявлена в конкурс. Удачи! ✦');route();}catch(err){toast(err.message,true)}}));
}

/* ---------- Студия автора ---------- */
function studioSide(on){return `<aside class="studio-side">
  <a href="#/studio" class="${on==='dash'?'on':''}">◈ Обзор и статистика</a>
  <a href="#/studio/works" class="${on==='works'?'on':''}">✎ Мои произведения</a>
  <a href="#/studio/new" class="${on==='new'?'on':''}">+ Новое произведение</a>
  <a href="#/profile" class="${on==='profile'?'on':''}">◍ Профиль автора</a>
  <a href="#/library">📚 Моя полка</a><a href="#/feed">✦ Моя лента</a>
  ${me()?.role==='admin'?'<a href="#/admin">⚖ Модерация платформы</a>':''}</aside>`}
function guardStudio(){ if(me()) return true; $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">✒</span><h2>Студия автора</h2><p>Редактор, черновики, главы, статистика и подписчики — войдите или зарегистрируйтесь как автор.</p><a class="btn" href="#/auth?mode=signup">Стать автором</a> <a class="btn ghost" href="#/auth">Войти</a></div></div>`; setNav('studio'); return false; }
function drawChart(cv,works){
  if(!cv||!cv.getContext) return; const ctx=cv.getContext('2d'); if(!ctx) return; const W=cv.width=cv.offsetWidth*2,H=cv.height=300; ctx.scale(1,1);
  const days=14, data=Array.from({length:days},(_,i)=>works.reduce((s,w)=>s+Math.round((w.views||0)/40*Math.abs(Math.sin(i*1.7+(w.title.length)))+((w.title.charCodeAt(0)%9)*3)),0));
  const max=Math.max(...data,10); ctx.strokeStyle='#3a3224'; ctx.beginPath(); data.forEach((v,i)=>{const x=30+i*(W-60)/(days-1),y=H-34-(v/max)*(H-70); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.strokeStyle='#c8a96e'; ctx.lineWidth=3; ctx.stroke();
  ctx.lineTo(W-30,H-34); ctx.lineTo(30,H-34); ctx.closePath(); ctx.fillStyle='rgba(200,169,110,.14)'; ctx.fill();
  ctx.fillStyle='#a89c88'; ctx.font='20px Manrope'; data.forEach((v,i)=>{if(i%3===0)ctx.fillText(v,22+i*(W-60)/(days-1),H-8)});
}
function pageStudio(){
  if(!guardStudio()) return; setNav('studio'); const u=me(); const ws=S.works.filter(w=>w.authorId===u.id);
  const views=ws.reduce((s,w)=>s+(w.views||0),0), likes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  const revs=S.reviews.filter(r=>ws.some(w=>w.id===r.workId)); const comms=S.comments.filter(c=>ws.some(w=>w.id===c.workId));
  const drafts=S.chapters.filter(c=>c.status==='draft'&&ws.some(w=>w.id===c.workId));
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('dash')}<div>
    <div class="kicker">Студия автора</div><h1 style="font-size:2.3rem;margin:10px 0">Здравствуйте, ${esc(u.displayName)} ✒</h1>
    <div class="statgrid"><div class="statbox"><b>${ws.length}</b>произведений</div><div class="statbox"><b>${fmt(views)}</b>просмотров</div><div class="statbox"><b>${likes}</b>лайков</div>
    <div class="statbox"><b>${followersOf(u.id)}</b>подписчиков</div><div class="statbox"><b>${revs.length}</b>рецензий</div><div class="statbox"><b>${drafts.length}</b>черновиков глав</div></div>
    <div class="panel"><h3 style="margin-bottom:6px">Читательская активность · 14 дней</h3><p class="small muted">Просмотры ваших произведений по дням.</p><canvas id="chart" style="width:100%;height:150px"></canvas></div>
    <div class="grid two" style="margin-top:20px"><div class="panel"><h3 style="margin-bottom:12px">Последние рецензии вам</h3>
      ${revs.slice(0,4).map(r=>`<div class="comment">${ava(author(r.userId))}<div><b>${esc(r.name)}</b> <span class="rate">★ ${reviewTotal(r)}/21</span><p style="margin:4px 0 0">${esc(r.text)}</p><a class="small" style="color:var(--gold)" href="#/work/${r.workId}">«${esc(work(r.workId)?.title||'')}» →</a></div></div>`).join('')||'<p class="muted">Рецензий пока нет. Поделитесь ссылкой на произведение — первые читатели ближе, чем кажется.</p>'}</div>
    <div class="panel"><h3 style="margin-bottom:12px">Последние комментарии вам</h3>
      ${comms.slice(0,5).map(c=>`<div class="comment">${ava(author(c.userId))}<div><b>${esc(c.name)}</b> <span class="small muted">${esc(c.createdAt)}</span><p style="margin:4px 0 0">${esc(c.text)}</p></div></div>`).join('')||'<p class="muted">Комментариев пока нет.</p>'}</div></div>
    <div class="panel" style="margin-top:20px"><h3>Быстрый старт</h3><p class="muted">Новая глава к существующему произведению поднимает его в ленте и уведомляет подписчиков.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/studio/new">+ Новое произведение</a><a class="btn ghost" href="#/studio/works">Мои произведения</a><a class="btn ghost" href="#/contests">Заявиться в конкурс</a></div></div>
  </div></div></div>`;
  drawChart($('#chart'),ws);
}
function pageStudioWorks(){
  if(!guardStudio()) return; setNav('studio'); const u=me(); const ws=S.works.filter(w=>w.authorId===u.id);
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('works')}<div>
    <div class="kicker">Студия автора</div><h1 style="font-size:2.3rem;margin:10px 0 20px">Мои произведения · ${ws.length}</h1>
    ${ws.length?`<div style="overflow:auto"><table class="tbl"><thead><tr><th>Произведение</th><th>Тип / жанр</th><th>Статус</th><th>Глав</th><th>👁 / ♥ / ★</th><th>Обновлено</th><th></th></tr></thead><tbody>
    ${ws.map(w=>{const r=rating(w.id);return `<tr><td><a href="#/work/${w.id}"><b style="font-family:var(--serif);font-size:1.05rem">${esc(w.title)}</b></a><br><span class="small muted">${fmt(workWords(w))} слов</span></td>
      <td>${esc(TYPE_LABEL[w.type]||'')} · ${esc(w.genre)}</td><td><span class="pill">${esc(STATUS_LABEL[w.status]||w.status)}</span></td><td>${chaptersOf(w.id,true).length}</td>
      <td>${fmt(w.views||0)} / ${likesOf(w.id)} / ${r?r.outOf10.toFixed(1):'—'}</td><td>${esc(w.updatedAt||'')}</td>
      <td style="white-space:nowrap"><a class="btn dark sm" href="#/studio/work/${w.id}">✎ Главы и настройки</a> <button class="btn danger sm" data-action="del-work" data-id="${w.id}">Удалить</button></td></tr>`}).join('')}</tbody></table></div>`
    :'<div class="empty"><span class="big">✒</span>У вас пока нет произведений. Самое время исправить.<br><br><a class="btn" href="#/studio/new">Создать первое</a></div>'}
  </div></div></div>`;
}
function workFormHTML(w){
  w=w||{title:'',subtitle:'',type:'story',genre:'Драма',tags:[],description:'',status:'ongoing',ageRating:'12+',cover:{from:COVERS[0][0],to:COVERS[0][1],symbol:'✦'}};
  return `<form class="stack" id="workForm">
    <label class="field">Название *<input class="input" name="title" required maxlength="140" value="${esc(w.title)}" placeholder="Как называется ваша история?"></label>
    <label class="field">Подзаголовок<input class="input" name="subtitle" maxlength="160" value="${esc(w.subtitle||'')}" placeholder="Цикл, часть, уточнение…"></label>
    <div class="grid two"><label class="field">Тип *<select name="type">${window.CHERNILA_SEED.types.map(t=>`<option value="${t.id}" ${w.type===t.id?'selected':''}>${t.label}</option>`).join('')}</select></label>
    <label class="field">Жанр *<select name="genre">${window.CHERNILA_SEED.genres.map(g=>`<option ${w.genre===g?'selected':''}>${g}</option>`).join('')}</select></label></div>
    <div class="grid two"><label class="field">Статус<select name="status">${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${w.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="field">Возрастной рейтинг<select name="ageRating">${['0+','6+','12+','16+','18+'].map(r=>`<option ${w.ageRating===r?'selected':''}>${r}</option>`).join('')}</select></label></div>
    <label class="field">Теги (через запятую)<input class="input" name="tags" value="${esc((w.tags||[]).join(', '))}" placeholder="память, город, первая любовь"></label>
    <label class="field">Аннотация *<textarea class="input" name="description" rows="5" required maxlength="2000" placeholder="Пара предложений, после которых невозможно не открыть первую главу.">${esc(w.description)}</textarea></label>
    <div><span class="small" style="font-weight:800;color:var(--muted)">Обложка: градиент и символ</span>
      <div class="cover-picker" id="coverPick" style="margin:10px 0">${COVERS.map(([f,t])=>`<button type="button" class="swatch ${w.cover?.from===f?'on':''}" data-from="${f}" data-to="${t}" style="background:linear-gradient(140deg,${f},${t})" aria-label="Градиент обложки"></button>`).join('')}</div>
      <div class="chiprow" id="symbolPick">${SYMBOLS.map(s=>`<button type="button" class="chipbtn ${w.cover?.symbol===s?'on':''}" data-s="${s}" style="font-size:1.1rem">${s}</button>`).join('')}</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">${w.id?'Сохранить произведение':'Создать и перейти к главам →'}</button><a class="btn ghost" href="#/studio/works">Отмена</a></div>
  </form>`;
}
function bindWorkForm(w){
  let cover={...(w?w.cover:{from:COVERS[0][0],to:COVERS[0][1],symbol:'✦'})};
  $('#coverPick').addEventListener('click',e=>{const b=e.target.closest('.swatch');if(!b)return;cover.from=b.dataset.from;cover.to=b.dataset.to;$$('.swatch').forEach(x=>x.classList.toggle('on',x===b))});
  $('#symbolPick').addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(!b)return;cover.symbol=b.dataset.s;$$('#symbolPick .chipbtn').forEach(x=>x.classList.toggle('on',x===b))});
  $('#workForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const u=me();
    const data={id:w?w.id:Store.uid('work'),authorId:u.id,title:f.get('title').trim(),subtitle:f.get('subtitle').trim(),type:f.get('type'),genre:f.get('genre'),status:f.get('status'),ageRating:f.get('ageRating'),
      tags:f.get('tags').split(',').map(t=>t.trim()).filter(Boolean),description:f.get('description').trim(),cover,legacyUrl:w?w.legacyUrl:null,featured:w?!!w.featured:false,views:w?w.views||0:0,createdAt:w?w.createdAt:Store.today()};
    Store.upsertWork(data); toast(w?'Произведение сохранено':'Произведение создано! Теперь добавьте первую главу ✒'); location.hash='#/studio/work/'+data.id;});
}
function pageStudioNew(){ if(!guardStudio()) return; setNav('studio');
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('new')}<div><div class="kicker">Студия автора</div><h1 style="font-size:2.3rem;margin:10px 0 8px">Новое произведение</h1>
  <p class="muted">Рассказ, роман, цикл стихов, эссе — всё начинается с этой карточки. Главы добавите следующим шагом.</p><div class="panel" style="margin-top:20px">${workFormHTML(null)}</div></div></div></div>`; bindWorkForm(null); }
function pageStudioWork(id){
  if(!guardStudio()) return; const w=work(id); if(!w||w.authorId!==me().id){toast('Можно редактировать только свои произведения',true);location.hash='#/studio/works';return}
  setNav('studio'); const chs=chaptersOf(id,true);
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('works')}<div>
    <div class="kicker">Редактирование</div><h1 style="font-size:2.2rem;margin:10px 0">«${esc(w.title)}»</h1>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:20px"><a class="btn ghost sm" href="#/work/${id}">Страница для читателей →</a><a class="btn sm" href="#/studio/chapter/${id}/new">+ Новая глава</a></div>
    <div class="panel"><h2 style="margin-bottom:14px">Главы и черновики · ${chs.length}</h2>
    ${chs.length?chs.map((c,i)=>`<div class="chapter-row"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif)">${esc(c.title)}</b> ${c.status==='draft'?'<span class="pill gold">черновик</span>':'<span class="pill">опубликовано</span>'}<br><span class="small muted">${fmt(words(c.body))} слов · ${esc(c.createdAt||'')}</span></span>
      <button class="btn dark sm" data-action="ch-up" data-id="${c.id}" ${i===0?'disabled':''}>↑</button><button class="btn dark sm" data-action="ch-down" data-id="${c.id}" ${i===chs.length-1?'disabled':''}>↓</button>
      <a class="btn dark sm" href="#/studio/chapter/${id}/${c.id}">✎ Редактировать</a><button class="btn danger sm" data-action="del-chapter" data-id="${c.id}">✕</button></div>`).join(''):'<p class="muted">Глав пока нет. Напишите первую — читатели уже заждались.</p>'}
    </div>
    <div class="panel" style="margin-top:20px"><h2 style="margin-bottom:14px">Карточка произведения</h2>${workFormHTML(w)}</div>
  </div></div></div>`; bindWorkForm(w); }
function pageStudioChapter(wid,cid){
  if(!guardStudio()) return; const w=work(wid); if(!w||w.authorId!==me().id) return page404();
  const c=cid==='new'?null:S.chapters.find(x=>x.id===cid&&x.workId===wid); if(cid!=='new'&&!c) return page404();
  setNav('studio');
  $('#app').innerHTML=`<div class="wrap" style="max-width:920px;padding:44px 0 20px"><div class="kicker">Редактор · «${esc(w.title)}»</div>
  <h1 style="font-size:2.2rem;margin:12px 0 20px">${c?'Редактировать главу':'Новая глава'}</h1>
  <form class="stack" id="chapterForm">
    <label class="field">Заголовок главы *<input class="input" name="title" required maxlength="160" value="${esc(c?c.title:'')}" placeholder="${w.type==='poetry'?'Название стихотворения':'Глава 1. …'}"></label>
    <div><div class="editor-tools" role="toolbar" aria-label="Форматирование">
      <button type="button" data-fmt="bold"><b>Ж</b></button><button type="button" data-fmt="italic"><i>К</i></button><button type="button" data-fmt="h">Заголовок</button><button type="button" data-fmt="q">Цитата</button><button type="button" data-fmt="hr">✦ Разделитель</button>
      <span class="small muted" style="align-self:center;margin-left:auto" id="wordCount">0 слов · ~0 мин чтения · автосохранение черновика включено</span></div>
    <textarea class="input editor" name="body" id="bodyEd" placeholder="Пишите честно. Пустая строка — новый абзац.${w.type==='poetry'?' Для стихов каждая строка сохраняется как строка.':''}">${esc(c?c.body:(localStorage.getItem('chernila_draft_'+wid)||''))}</textarea></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" name="st" value="published" type="submit">Опубликовать главу</button><button class="btn ghost" name="st" value="draft" type="submit">Сохранить как черновик</button><a class="btn ghost" href="#/studio/work/${wid}">← К произведению</a></div>
    <p class="small muted">Публикация поднимет произведение в ленте и покажет главу вашим подписчикам.</p></form></div>`;
  const ta=$('#bodyEd'), wc=$('#wordCount'), key='chernila_draft_'+wid+'_'+(cid);
  const upd=()=>{const n=words(ta.value);wc.textContent=`${n} слов · ~${Math.max(1,Math.round(n/180))} мин чтения · черновик сохранён локально`; if(!c) localStorage.setItem('chernila_draft_'+wid,ta.value); else localStorage.setItem(key,ta.value)};
  ta.addEventListener('input',upd); upd();
  $$('[data-fmt]').forEach(b=>b.addEventListener('click',()=>{const s=ta.selectionStart,e=ta.selectionEnd,sel=ta.value.slice(s,e)||'текст';let rep=sel;
    if(b.dataset.fmt==='bold')rep='**'+sel+'**'; if(b.dataset.fmt==='italic')rep='*'+sel+'*'; if(b.dataset.fmt==='h')rep='\n\n## '+sel+'\n\n'; if(b.dataset.fmt==='q')rep='\n\n> '+sel+'\n\n'; if(b.dataset.fmt==='hr')rep='\n\n---\n\n';
    ta.setRangeText(rep,s,e,'end');ta.focus();upd();}));
  $('#chapterForm').addEventListener('submit',e=>{e.preventDefault();const st=e.submitter?.value||'published';const f=new FormData(e.target);
    const data={id:c?c.id:Store.uid('ch'),workId:wid,title:f.get('title').trim(),body:ta.value,status:st,order:c?c.order:(chaptersOf(wid,true).length+1),createdAt:c?c.createdAt:Store.today()};
    if(words(data.body)<3){toast('Глава почти пустая — напишите хотя бы пару предложений',true);return}
    Store.upsertChapter(data); localStorage.removeItem('chernila_draft_'+wid); toast(st==='published'?'Глава опубликована! Подписчики увидят её в ленте ✦':'Черновик сохранён'); location.hash='#/studio/work/'+wid;});
}
function pageProfile(){
  if(!guardStudio()) return; setNav('studio'); const u=me();
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('profile')}<div>
   <div class="kicker">Профиль автора</div><h1 style="font-size:2.3rem;margin:10px 0 20px">Как вас видят читатели</h1>
   <div class="panel"><div style="display:flex;gap:18px;align-items:center;margin-bottom:20px" id="avaPrev">${ava(u,'lg')}<div><b style="font-family:var(--serif);font-size:1.4rem">${esc(u.displayName)}</b><div class="muted">@${esc(u.username)} · <a href="#/author/${u.id}" style="color:var(--gold)">публичная страница →</a></div></div></div>
   <form class="stack" id="profileForm">
    <label class="field">Имя или псевдоним<input class="input" name="displayName" value="${esc(u.displayName)}" maxlength="80"></label>
    <label class="field">Девиз / любимая фраза<input class="input" name="motto" value="${esc(u.motto||'')}" maxlength="160" placeholder="Одна фраза, которая скажет о вас всё"></label>
    <label class="field">Город<input class="input" name="location" value="${esc(u.location||'')}" maxlength="80"></label>
    <label class="field">О себе<textarea class="input" name="bio" rows="5" maxlength="1200" placeholder="Что пишете, зачем и для кого.">${esc(u.bio||'')}</textarea></label>
    <label class="field">Цвет аватара<input type="range" name="hue" min="0" max="360" value="${u.hue??38}" oninput="document.querySelector('#avaPrev .avatar').style.background='linear-gradient(135deg,hsl('+this.value+' 45% 62%),hsl('+(+this.value+40)+' 40% 38%))'"></label>
    <div><button class="btn">Сохранить профиль</button></div></form></div>
   <div class="panel" style="margin-top:20px"><h3>Ваши знаки отличия</h3><p class="muted">Значки выдаются за активность и достижения на платформе.</p><div class="chiprow">${(u.badges||[]).map(b=>`<span class="pill gold">✦ ${esc(b)}</span>`).join('')||'<span class="muted">Пока нет — первая публикация уже достижение.</span>'}</div>
   <h3 style="margin-top:24px">Опасная зона (локальный режим)</h3><p class="muted small">Сбросить локальную копию платформы к стартовым данным. В режиме Supabase данные хранятся в общей базе и этот сброс их не тронет.</p><button class="btn danger sm" data-action="reset">Сбросить локальные данные</button></div>
  </div></div></div>`;
  $('#profileForm').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);
    Store.updateProfile({displayName:f.get('displayName').trim(),motto:f.get('motto').trim(),location:f.get('location').trim(),bio:f.get('bio').trim(),hue:+f.get('hue')});
    toast('Профиль обновлён'); renderUserChip(); route();});
}
function pageAdmin(){
  const u=me(); if(!u||u.role!=='admin'){toast('Доступ только для администратора платформы',true);location.hash='#/';return}
  setNav('studio');
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('dash')}<div>
   <div class="kicker">Модерация платформы</div><h1 style="font-size:2.3rem;margin:10px 0">Панель администратора</h1>
   <div class="statgrid"><div class="statbox"><b>${S.authors.length}</b>авторов</div><div class="statbox"><b>${S.works.length}</b>произведений</div><div class="statbox"><b>${S.reviews.length}</b>рецензий</div><div class="statbox"><b>${S.comments.length}</b>комментариев</div><div class="statbox"><b>${Store.mode}</b>режим данных</div></div>
   <div class="panel"><h3 style="margin-bottom:12px">Рецензии</h3>${S.reviews.map(r=>`<div class="comment"><div style="flex:1"><b>${esc(r.name)}</b> · «${esc(work(r.workId)?.title||'удалено')}» · ★ ${reviewTotal(r)}/21 <span class="small muted">${esc(r.createdAt)}</span><p style="margin:4px 0 0">${esc(r.text)}</p></div><button class="btn danger sm" data-action="del-review" data-id="${r.id}">Удалить</button></div>`).join('')||'<p class="muted">Нет рецензий</p>'}</div>
   <div class="panel" style="margin-top:18px"><h3 style="margin-bottom:12px">Комментарии</h3>${S.comments.map(c=>`<div class="comment"><div style="flex:1"><b>${esc(c.name)}</b> · «${esc(work(c.workId)?.title||'удалено')}» <span class="small muted">${esc(c.createdAt)}</span><p style="margin:4px 0 0">${esc(c.text)}</p></div><button class="btn danger sm" data-action="del-comment" data-id="${c.id}">Удалить</button></div>`).join('')||'<p class="muted">Нет комментариев</p>'}</div>
   <div class="panel" style="margin-top:18px"><h3>Произведения платформы</h3><p class="small muted">Значок «Выбор платформы» ставит произведение на главную.</p>
   ${S.works.map(w=>`<div class="comment"><div style="flex:1"><b>${esc(w.title)}</b> <span class="small muted">${esc(author(w.authorId).displayName)} · 👁 ${fmt(w.views||0)}</span></div><button class="btn dark sm" data-action="feature" data-id="${w.id}">${w.featured?'✦ На главной':'На главную'}</button><button class="btn danger sm" data-action="del-work" data-id="${w.id}">Удалить</button></div>`).join('')}</div>
   <p class="small muted" style="margin-top:14px">Старая панель модерации рецензий книг Cnizroman сохранена: <a href="reviews-admin.html" style="color:var(--gold)">reviews-admin.html ↗</a></p>
  </div></div></div>`;
}

/* ---------- Авторизация ---------- */
function pageAuth(params){
  setNav(''); const mode=params.get('mode')==='signup'?'signup':'login'; if(me()){location.hash='#/studio';return}
  $('#app').innerHTML=`<div class="wrap"><div class="auth-box reveal"><div class="panel" style="padding:36px">
   <div style="text-align:center;font-family:var(--serif);font-size:2.6rem;color:var(--gold)">✒</div>
   <h1 style="text-align:center;font-size:2rem;margin:8px 0 6px">${mode==='signup'?'Стать автором «Чернил»':'С возвращением'}</h1>
   <p class="muted center">${mode==='signup'?'Минута — и у вас студия, редактор, подписчики и первые читатели.':'Ваши черновики и полка скучали.'}</p>
   <div class="tabs" style="justify-content:center;margin-top:18px"><a href="#/auth" class="${mode==='login'?'on':''}">Вход</a><a href="#/auth?mode=signup" class="${mode==='signup'?'on':''}">Регистрация</a></div>
   <form class="stack" id="authForm">
   ${mode==='signup'?`<label class="field">Логин (латиница) *<input class="input" name="username" required placeholder="ваш_логин" autocomplete="username"></label>
   <label class="field">Имя или псевдоним *<input class="input" name="displayName" required placeholder="Как вас будут знать читатели"></label>
   <label class="field">Email *<input class="input" name="email" type="email" required autocomplete="email"></label>`
   :`<label class="field">Логин или email<input class="input" name="login" required autocomplete="username" placeholder="cnizroman или you@mail.ru"></label>`}
   <label class="field">Пароль *<input class="input" name="password" type="password" required minlength="6" autocomplete="${mode==='signup'?'new-password':'current-password'}"></label>
   <button class="btn" type="submit" style="justify-content:center">${mode==='signup'?'Создать аккаунт автора':'Войти'}</button>
   <p class="small muted center">${Store.mode==='supabase'?'Аккаунты хранятся в Supabase Auth — общей базе платформы.':'Локальный режим: аккаунт создаётся в вашем браузере. Вход основателя: <b>cnizroman</b> / <b>demo1234</b>'}</p>
   </form></div></div></div>`;
  $('#authForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
    try{ if(mode==='signup') await Store.signup(f); else await Store.login(f); renderUserChip(); toast('Добро пожаловать в «Чернила», '+me().displayName+' ✒'); location.hash='#/studio'; }
    catch(err){ toast(err.message,true); btn.disabled=false; }});
}


/* ---------- Запуск общей платформы: одно действие владельца ---------- */
function pageSetup(){
  setNav('');
  const cfg=window.CHERNILA_SUPABASE_CONFIG||{}; const ref=((cfg.url||'').match(/https:\/\/([^.]+)\./)||[])[1]||'';
  const sqlUrl='https://supabase.com/dashboard/project/'+ref+'/sql/new';
  const done=Store.mode==='supabase';
  $('#app').innerHTML=`<div class="wrap" style="max-width:860px;padding:52px 0 0"><div class="kicker">Запуск платформы</div>
  <h1 style="font-size:clamp(2rem,5vw,3rem);margin:14px 0">${done?'Общая база подключена ✦':'Осталось одно действие'}</h1>
  ${done?`<div class="panel"><p style="font-family:var(--body);font-size:1.2rem">«Чернила» работают на общей базе Supabase: аккаунты, произведения, рецензии и подписки теперь едины для всех посетителей.</p>
    <p class="muted">Если вы основатель — просто зарегистрируйтесь на сайте с логином <b style="color:var(--gold2)">cnizroman</b>: профиль основателя, админка и ваши книги подключатся автоматически. Подтверждение почты не потребуется.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/auth?mode=signup">Зарегистрироваться</a><a class="btn ghost" href="#/catalog">В каталог</a></div></div>`
  :`<p class="muted" style="font-family:var(--body);font-size:1.18rem">Сейчас платформа работает в локальном режиме: всё функционирует, но данные хранятся в браузере каждого посетителя по отдельности. Чтобы у всех авторов и читателей была <b style="color:var(--text)">одна общая платформа</b>, владельцу нужно выполнить один готовый SQL-файл в Supabase. Это единственное ручное действие — всё остальное автоматизировано.</p>
  <div class="panel stack" style="margin-top:22px">
    <div><span class="pill gold">Шаг 1</span> <b style="font-family:var(--serif);font-size:1.15rem;margin-left:8px">Скопируйте готовый SQL платформы</b>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn" id="copySql" type="button">⧉ Скопировать SQL</button><a class="btn ghost" href="supabase-platform-schema.sql" target="_blank" rel="noopener">Посмотреть файл</a></div></div>
    <div><span class="pill gold">Шаг 2</span> <b style="font-family:var(--serif);font-size:1.15rem;margin-left:8px">Откройте SQL Editor вашего Supabase, вставьте и нажмите Run</b>
      <div style="margin-top:12px"><a class="btn" href="${sqlUrl}" target="_blank" rel="noopener">Открыть SQL Editor проекта ↗</a></div></div>
    <div><span class="pill gold">Шаг 3</span> <b style="font-family:var(--serif);font-size:1.15rem;margin-left:8px">Вернитесь сюда и проверьте</b>
      <div style="margin-top:12px"><button class="btn ghost" type="button" onclick="location.reload()">↻ Проверить подключение</button></div></div>
  </div>
  <div class="panel" style="margin-top:18px"><h3 style="margin-bottom:10px">Что произойдёт само — без ваших действий</h3>
    <ul class="muted" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:7px">
      <li>Сайт сам определит, что общая база готова, и переключится на неё при следующей загрузке.</li>
      <li>Профиль каждого автора будет создаваться автоматически при регистрации, подтверждение почты не потребуется.</li>
      <li>Аккаунт с логином <b style="color:var(--gold2)">cnizroman</b> автоматически станет основателем и администратором — зарегистрируйтесь с ним первым.</li>
      <li>Книги первого автора уже встроены в платформу: вносить их в базу вручную не нужно.</li>
      <li>Конкурсы уже заведены в том же SQL-файле.</li>
    </ul></div>`}
  </div>`;
  const b=$('#copySql');
  if(b) b.addEventListener('click',async()=>{ b.disabled=true; b.textContent='Загружаю SQL…';
    try{ const sql=await (await fetch('supabase-platform-schema.sql')).text(); await navigator.clipboard.writeText(sql); b.textContent='✓ SQL скопирован — теперь шаг 2'; toast('SQL платформы скопирован в буфер обмена'); }
    catch(e){ b.disabled=false; b.textContent='⧉ Скопировать SQL'; toast('Не получилось скопировать автоматически — откройте файл и скопируйте вручную',true); window.open('supabase-platform-schema.sql','_blank'); }});
}

function pageAbout(){
  setNav('');
  $('#app').innerHTML=`<div class="wrap" style="max-width:840px;padding:52px 0 0"><div class="kicker">Манифест</div>
  <h1 style="font-size:clamp(2.2rem,5vw,3.4rem);margin:14px 0">Как устроены «Чернила»</h1>
  <div style="font-family:var(--body);font-size:1.2rem;color:var(--muted)">
  <p>«Чернила» начались как личный сайт одного автора — Cnizroman и его тетралогии «Никто не вспомнит». Сайт вырос в платформу для всех: прозаиков, поэтов, эссеистов и тех, кто пока пишет «в стол».</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Для читателей</h2><p>Каталог по типам и жанрам, удобная читалка с темами «Тьма», «Бумага» и «Свет», личная полка, подписки на авторов и лента новых глав. Рецензии — по фирменной системе пяти критериев: сюжет (до 5), персонажи, атмосфера, язык и эмоции (до 4). Максимум — 21 балл, и он что-то значит.</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Для авторов</h2><p>Студия автора: произведения и главы, черновики с автосохранением, редактор с форматированием, генератор обложек, статистика просмотров, подписчики и конкурсы. Публикация бесплатна и мгновенна, права на тексты остаются у автора.</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Правила дома</h2><p>Пишите честно. Рецензируйте так, как хотели бы, чтобы рецензировали вас: с аргументами и без злобы. Плагиат и спам удаляются модерацией. Всё остальное — литература.</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Техника</h2><p>Платформа — статичный сайт на GitHub Pages, данные и аккаунты — Supabase (Auth, Postgres, Row Level Security). Сейчас режим данных: <b style="color:var(--gold2)">${Store.mode==='supabase'?'Supabase — общая база всех читателей':'локальный (браузер)'}</b>.</p>
  </div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">${Store.mode==='supabase'?'':'<a class="btn" href="#/setup">Запуск общей базы: одно действие владельца →</a>'}<a class="btn" href="#/catalog">В каталог</a><a class="btn ghost" href="#/auth?mode=signup">Стать автором</a></div></div>`;
}
function page404(){ setNav(''); $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:70px"><span class="big">✒</span><h2 style="font-size:2rem">Эта страница ещё не написана</h2><p>Возможно, автор её только придумывает. Вернитесь в каталог — там уже много готового.</p><a class="btn" href="#/catalog">В каталог</a> <a class="btn ghost" href="#/">На главную</a></div></div>`; }

/* ================= ДЕЙСТВИЯ ================= */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]'); if(!el) return; const act=el.dataset.action,id=el.dataset.id;
  if(act==='logout'){Store.logout();renderUserChip();toast('Вы вышли. Возвращайтесь — чернила не высохнут.');location.hash='#/';route();}
  if(act==='like'){ if(!needAuth())return; Store.toggleLike(id); route(); }
  if(act==='follow'){ if(!needAuth())return; Store.toggleFollow(id); toast(isFollowing(id)?'Подписка оформлена — новые главы появятся в вашей ленте':'Подписка отменена'); route(); }
  if(act==='share'){ const url=location.origin+location.pathname+'#/work/'+id; try{await navigator.clipboard.writeText(url);toast('Ссылка на произведение скопирована')}catch(_){toast(url)} }
  if(act==='del-comment'){ if(confirm('Удалить комментарий?')){Store.deleteComment(id);toast('Комментарий удалён');route();} }
  if(act==='del-review'){ if(confirm('Удалить рецензию?')){Store.deleteReview(id);toast('Рецензия удалена');route();} }
  if(act==='del-work'){ const w=work(id); if(confirm('Удалить произведение «'+(w?w.title:'')+'» и все его главы безвозвратно?')){Store.deleteWork(id);toast('Произведение удалено'); location.hash='#/studio/works'; route();} }
  if(act==='del-chapter'){ if(confirm('Удалить главу?')){Store.deleteChapter(id);toast('Глава удалена');route();} }
  if(act==='feature'){ const w=work(id); w.featured=!w.featured; Store.upsertWork(w); toast(w.featured?'Произведение — на главной':'Убрано с главной'); route(); }
  if(act==='reset'){ if(confirm('Сбросить все локальные данные платформы к стартовым?')) Store.resetDemo(); }
  if(act==='font'){ readerSettings.size=Math.min(28,Math.max(15,readerSettings.size+ +el.dataset.v)); localStorage.setItem('chernila_reader',JSON.stringify(readerSettings)); route(); }
  if(act==='theme'){ readerSettings.theme=el.dataset.v; localStorage.setItem('chernila_reader',JSON.stringify(readerSettings)); route(); }
  if(act==='ch-up'||act==='ch-down'){ const c=S.chapters.find(x=>x.id===id); const sibs=chaptersOf(c.workId,true); const i=sibs.indexOf(c); const j=act==='ch-up'?i-1:i+1; if(sibs[j]){const t=c.order;c.order=sibs[j].order;sibs[j].order=t;Store.upsertChapter(c);Store.upsertChapter(sibs[j]);route();} }
});
$('#burger')?.addEventListener?.('click',()=>{});
document.addEventListener('DOMContentLoaded',()=>{});

/* ================= РОУТЕР ================= */
function route(){
  const hash=location.hash.replace(/^#\/?/,''); const [pathQ]=[hash]; const [path,qs]=pathQ.split('?'); const params=new URLSearchParams(qs||'');
  const seg=path.split('/').filter(Boolean); window.scrollTo({top:0}); $('#mainNav')?.classList.remove('open');
  try{
    if(!seg.length) pageHome();
    else if(seg[0]==='catalog') pageCatalog(params);
    else if(seg[0]==='work'&&seg[1]) pageWork(decodeURIComponent(seg[1]));
    else if(seg[0]==='read'&&seg[1]&&seg[2]) pageRead(seg[1],seg[2]);
    else if(seg[0]==='author'&&seg[1]) pageAuthor(decodeURIComponent(seg[1]));
    else if(seg[0]==='authors') pageAuthors();
    else if(seg[0]==='feed') pageFeed();
    else if(seg[0]==='library') pageLibrary();
    else if(seg[0]==='contests') pageContests();
    else if(seg[0]==='auth') pageAuth(params);
    else if(seg[0]==='about') pageAbout();
    else if(seg[0]==='setup') pageSetup();
    else if(seg[0]==='profile') pageProfile();
    else if(seg[0]==='admin') pageAdmin();
    else if(seg[0]==='studio'&&!seg[1]) pageStudio();
    else if(seg[0]==='studio'&&seg[1]==='works') pageStudioWorks();
    else if(seg[0]==='studio'&&seg[1]==='new') pageStudioNew();
    else if(seg[0]==='studio'&&seg[1]==='work'&&seg[2]) pageStudioWork(seg[2]);
    else if(seg[0]==='studio'&&seg[1]==='chapter'&&seg[2]&&seg[3]) pageStudioChapter(seg[2],seg[3]);
    else page404();
  }catch(err){ console.error(err); $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">✒</span>Чернила пролились: ${esc(err.message)}<br><br><a class="btn" href="#/">На главную</a></div></div>`; }
  $('#app').focus?.({preventScroll:true});
}
async function boot(){
  await Store.init(); S=Store.state; renderUserChip(); route();
  addEventListener('hashchange',route);
  $('#burger').addEventListener('click',()=>$('#mainNav').classList.toggle('open'));
  $('#topSearch').addEventListener('submit',e=>{e.preventDefault();const v=$('#topSearchInput').value.trim();location.hash='#/catalog'+(v?'?q='+encodeURIComponent(v):'');});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
