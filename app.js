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
const REVIEW_LABEL={draft:'Черновик',pending:'На проверке',approved:'Опубликовано',rejected:'На доработку'};
const STATUS_LABEL={completed:'Завершено',ongoing:'В процессе',frozen:'Заморожено'};
const GROUP_KINDS={cycle:'Цикл',dilogy:'Дилогия',trilogy:'Трилогия',tetralogy:'Тетралогия',series:'Серия'};
const SHELVES={want:'Хочу прочитать',reading:'Читаю',done:'Прочитано',fav:'Избранное'};
const CRITERIA=[{id:'plot',label:'Сюжет',max:5},{id:'characters',label:'Персонажи',max:4},{id:'atmosphere',label:'Атмосфера',max:4},{id:'style',label:'Язык и стиль',max:4},{id:'emotion',label:'Эмоциональное воздействие',max:4}];
const COVERS=[['#2b2113','#c8a96e'],['#0b2029','#73b9d4'],['#1d1030','#a67bc4'],['#06231d','#6fffd6'],['#1a0505','#a83232'],['#12301a','#79c26a'],['#2e0f22','#d87bab'],['#101d33','#5e84c4'],['#33200d','#e0a75e'],['#1c1c1c','#e8e2d4']];
const SYMBOLS=['✦','☾','✒','❧','◐','⌂','≋','✉','◎','☀','❄','▲','◉','❦'];
let disposePage=null;
let S=null; // Store.state

/* ---------- производные данные ---------- */
const author=id=>S.authors.find(a=>a.id===id)||{displayName:'Неизвестный автор',username:'?',hue:40};
const publicWorks=()=>S.works.filter(w=>Store.isWorkPublic(w));
const work=id=>S.works.find(w=>w.id===id&&Store.canReadWork(w));
const chaptersOf=(wid,all)=>{const w=work(wid);return S.chapters.filter(c=>c.workId===wid&&w&&(all||c.status==='published'&&Store.canReadStory(w))).sort((a,b)=>a.order-b.order);};
const likesOf=wid=>S.likes.filter(l=>l.workId===wid).length;
const followersOf=aid=>S.follows.filter(f=>f.authorId===aid).length;
const commentsOf=wid=>S.comments.filter(c=>c.workId===wid);
const reviewsOf=wid=>S.reviews.filter(r=>r.workId===wid);
const reviewTotal=r=>CRITERIA.reduce((s,c)=>s+(+r.scores[c.id]||0),0);
function rating(wid){const rs=reviewsOf(wid); if(!rs.length) return null; const avg=rs.reduce((s,r)=>s+reviewTotal(r),0)/rs.length; return {total:avg, outOf10:(avg/21*10), count:rs.length,
  by:Object.fromEntries(CRITERIA.map(c=>[c.id, rs.reduce((s,r)=>s+(+r.scores[c.id]||0),0)/rs.length]))};}
const words=t=>(t||'').trim().split(/\s+/).filter(Boolean).length;
const workWords=w=>chaptersOf(w.id).reduce((s,c)=>s+words(c.body),0);
const fmt=n=>n>=1000?(n/1000).toFixed(1).replace('.0','')+' тыс.':String(n);
const readTime=w=>Math.max(1,Math.round(workWords(w)/180));
const me=()=>Store.currentUser();
const isLiked=wid=>{const u=me();return u&&S.likes.some(l=>l.userId===u.id&&l.workId===wid)};
const myShelf=wid=>{const u=me();const s=u&&S.shelves.find(x=>x.userId===u.id&&x.workId===wid);return s?s.shelf:''};
const isFollowing=aid=>{const u=me();return u&&S.follows.some(f=>f.followerId===u.id&&f.authorId===aid)};

/* ---------- разметка текста (безопасный мини-markdown) ---------- */
function renderText(text,poetry){return InkText.render(text,poetry);}
/* ---------- компоненты ---------- */
const profileStyle=a=>{const c=Store.cleanCustomization(a.customization||{});return `--profile-accent:${c.accent};--profile-banner:${c.bannerColor}`;};
const ava=(a,cls='')=>a.customization?.avatarUrl?`<span class="avatar ${cls}"><img src="${esc(a.customization.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`:`<span class="avatar ${cls}" style="background:linear-gradient(135deg,hsl(${a.hue??38} 45% 62%),hsl(${(a.hue??38)+40} 40% 38%))" aria-hidden="true">${esc((a.displayName||'?').trim()[0]||'?')}</span>`;
function coverHTML(w){InkFreedom.scheduleCovers();const a=author(w.authorId),c=InkFreedom.cleanCover(w.cover),image=c.imageAsset;return `<div class="cover ${image?'has-author-cover':''} ${image&&!c.overlay?'cover-art-only':''}" style="--cover-ratio:${c.ratio||5/6};background:linear-gradient(150deg,${c.from},${c.to})">${image?`<img data-author-asset="${image}" data-cover-work="${esc(w.id)}" alt="Обложка: ${esc(w.title)}" loading="lazy" style="object-fit:${c.fit}" ${InkFreedom.url(image)?`src="${InkFreedom.url(image)}"`:''}>`:''}
  <span class="cov-type">${w.legacyUrl?'':esc(TYPE_LABEL[w.type]||w.type)+' · '}${esc(w.genre)}</span><span class="cov-symbol">${esc(w.cover?.symbol||'✦')}</span>
  <span><span class="cov-title">${esc(w.title)}</span><span class="cov-author" style="display:block">${esc(a.displayName)}</span></span></div>`}
const groupWorks=(g,all=false)=>(g.workIds||[]).map(work).filter(w=>w&&w.authorId===g.authorId&&(all||Store.isWorkPublic(w)));
const groupsOf=wid=>(S.groups||[]).filter(g=>g.workIds.includes(wid)&&groupWorks(g,true).some(w=>w.id===wid));
function groupCard(g,matches=[]){const ws=groupWorks(g);return `<article class="panel group-card"><span class="pill gold">${esc(GROUP_KINDS[g.kind]||'Цикл')}</span>
  <h3><a href="#/group/${encodeURIComponent(g.id)}">${esc(g.title)}</a></h3><p class="muted">${esc(g.description)}</p>
  <div class="small muted">${esc(author(g.authorId).displayName)} · Произведений: ${groupWorks(g).length}</div>
  <ol class="group-book-list">${ws.map(w=>`<li class="${matches.some(x=>x.id===w.id)?'matched':''}">${esc(w.title)}</li>`).join('')}</ol>
  <a class="btn ghost sm" href="#/group/${encodeURIComponent(g.id)}">Открыть цикл →</a></article>`;}
function shelfEntries(list){
  const entries=[],seen=new Set();
  list.forEach(w=>{
    const g=groupsOf(w.id)[0];
    if(g){if(!seen.has(g.id)){seen.add(g.id);entries.push({group:g,matches:list.filter(x=>g.workIds.includes(x.id))});}}
    else entries.push({work:w});
  });return entries;
}
function workTiles(list){return shelfEntries(list).map(e=>e.group?groupCard(e.group,e.matches):workCard(e.work)).join('');}
function pageGroup(id){
  const g=S.groups.find(x=>x.id===id); if(!g) return page404(); setNav('catalog');
  const ws=groupWorks(g);if(!ws.length&&me()?.id!==g.authorId&&me()?.role!=='admin')return page404();
  $('#app').innerHTML=`<div class="wrap group-page"><a class="more" href="#/catalog">← Каталог</a>
    <div class="kicker">${esc(GROUP_KINDS[g.kind])} · Произведений: ${ws.length}</div><h1>${esc(g.title)}</h1>
    <p class="muted">${esc(g.description)}</p><p>Автор: <a class="more" href="#/author/${g.authorId}">${esc(author(g.authorId).displayName)}</a></p>
    ${me()?.id===g.authorId?`<a class="btn ghost sm" href="#/studio/groups/${encodeURIComponent(g.id)}">Редактировать группу</a>`:''}
    <section class="block"><h2>Порядок чтения</h2><div class="chapter-list">${ws.map((w,i)=>`<a class="chapter-row" href="#/work/${w.id}"><span class="num">${i+1}</span><span style="flex:1"><b>${esc(w.title)}</b><br><span class="small muted">${esc(w.subtitle||w.genre)}</span></span><span>Открыть →</span></a>`).join('')||'<p class="muted">В группе пока нет доступных произведений.</p>'}</div></section></div>`;
}
function workCard(w){const r=rating(w.id),a=author(w.authorId),prog=Store.progress.get()[w.id];
  return `<article class="work-card reveal"><a href="#/work/${w.id}" aria-label="${esc(w.title)}">${coverHTML(w)}</a>
  <div class="work-body"><div style="display:flex;gap:7px;flex-wrap:wrap">${w.passwordProtected&&!Store.canReadStory(w)?'<span>▣ Текст по паролю</span>':w.legacyUrl?'':`<span class="pill">${esc(TYPE_LABEL[w.type]||'')}</span>`}<span class="pill">${esc(STATUS_LABEL[w.status]||w.status)}</span></div>
  <h3><a href="#/work/${w.id}">${esc(w.title)}</a></h3>
  <div class="small muted">✒ <a href="#/author/${a.id}">${esc(a.displayName)}</a> · ${esc(w.genre)} · ${esc(w.ageRating)}</div>
  ${groupsOf(w.id).map(g=>`<a class="small group-link" href="#/group/${encodeURIComponent(g.id)}">${esc(GROUP_KINDS[g.kind])}: ${esc(g.title)}</a>`).join('')}
  <p>${esc(w.description)}</p>
  ${prog?`<div class="progress-line" title="Прочитано ${Math.round(prog.pct)}%"><i style="width:${prog.pct}%"></i></div>`:''}
  <div class="work-meta"><span class="rate">${r?('★ '+r.outOf10.toFixed(1)+' · '+r.count+' рец.'):'☆ пока без рецензий'}</span><span>👁 ${fmt(w.views||0)}</span><span>♥ ${likesOf(w.id)}</span>${w.passwordProtected&&!Store.canReadStory(w)?'<span>Главы скрыты</span>':w.legacyUrl?'<span>Полный текст ↗</span>':`<span>${chaptersOf(w.id).length} гл.</span><span>~${readTime(w)} мин</span>`}</div>
  </div></article>`}
function authorCard(a){const ws=publicWorks().filter(w=>w.authorId===a.id);const likes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  return `<article class="author-card reveal">${ava(a,'lg')}<div style="flex:1"><h3><a href="#/author/${a.id}">${esc(a.displayName)}</a></h3>
  <div class="small muted">@${esc(a.username)}${a.founder?' · <span style="color:var(--gold)">основатель платформы</span>':''}${a.location&&a.customization?.showLocation!==false?' · '+esc(a.location):''}</div>
  <p>${esc(a.bio||'Автор пока ничего о себе не рассказал.')}</p>
  <div class="work-meta"><span>${ws.length} произведений</span><span>${followersOf(a.id)} подписчиков</span><span>♥ ${likes}</span></div>
  ${(a.badges||[]).map(b=>`<span class="pill gold" style="margin:8px 6px 0 0">${esc(b)}</span>`).join('')}</div></article>`}
function toast(msg,err){const t=$('#toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(t._h);t._h=setTimeout(()=>t.className='toast',3400)}
function needAuth(){ if(me()) return true; toast('Войдите или зарегистрируйтесь, чтобы продолжить',true); location.hash='#/auth'; return false; }
function setNav(key){$$('#mainNav a').forEach(a=>a.classList.toggle('on',a.dataset.nav===key)); $('#readProgress').style.width='0'}
function renderUserChip(){const u=me();InkTheme.activate(u?.id); $('#userChip').innerHTML = u
  ? `<a href="#/author/${u.id}" style="display:flex;align-items:center;gap:9px">${ava(u)}<span class="uname" style="font-weight:700">${esc(u.displayName)}</span></a><a class="btn sm" href="#/studio/new">+ Писать</a><button class="btn ghost sm" data-action="logout">Выйти</button>`
  : `<a class="btn ghost sm" href="#/auth">Войти</a><a class="btn sm" href="#/auth?mode=signup">Стать автором</a>`;
  $('#modeBanner').hidden = Store.mode==='supabase';
}

/* ================= СТРАНИЦЫ ================= */
function pageHome(){
  setNav('home');
  const featured=publicWorks().filter(w=>w.featured), fresh=[...publicWorks()].sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,8);
  const top=[...publicWorks()].map(w=>({w,r:rating(w.id)})).filter(x=>x.r).sort((a,b)=>b.r.outOf10-a.r.outOf10).slice(0,5);
  const topAuthors=[...S.authors].sort((a,b)=>followersOf(b.id)-followersOf(a.id)).slice(0,6);
  const totalViews=publicWorks().reduce((s,w)=>s+(w.views||0),0);
  const quotes=['Никого не вспомнят. Пока он не напишет','Читайте медленно. Пишите честно','Каждая история заслуживает своего читателя'].join(' &nbsp;✦&nbsp; ');
  const cont=Store.progress.get(); const contWorks=Object.keys(cont).map(work).filter(w=>Store.isWorkPublic(w)).slice(0,4);
  $('#app').innerHTML=`
  <div class="wrap">
    <header class="hero reveal"><div class="kicker">Платформа для авторов · рассказы · романы · стихотворения</div>
      <h1>Никого не вспомнят.<br><em>Пока он не напишет.</em></h1>
      <p class="hero-lead">«Чернила» — место, где истории находят читателей, а авторы — друг друга. Публикуйте рассказы, романы, повести, стихи и эссе. Получайте честные рецензии по пяти критериям. Читайте медленно.</p>
      <div class="hero-actions"><a class="btn" href="#/catalog">Начать читать →</a><a class="btn ghost" href="#/studio/new">✒ Опубликовать своё</a></div>
      <div class="hero-stats">
        <div class="hstat"><b>${publicWorks().length}</b><span>произведений</span></div>
        <div class="hstat"><b>${S.authors.length}</b><span>авторов</span></div>
        <div class="hstat"><b>${S.chapters.filter(c=>c.status==='published'&&Store.isWorkPublic(work(c.workId))&&Store.canReadStory(work(c.workId))).length}</b><span>глав и текстов</span></div>
        <div class="hstat"><b>${fmt(totalViews)}</b><span>просмотров книг</span></div>
        <div class="hstat"><b>${S.reviews.length}</b><span>рецензий</span></div>
      </div></header>
  </div>
  <div class="marquee" aria-hidden="true"><span class="marquee-track">${quotes} &nbsp;✦&nbsp; ${quotes} &nbsp;✦&nbsp;</span></div>
  <div class="wrap">
    ${contWorks.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Продолжить</div><h2>Вы остановились здесь</h2></div><a class="more" href="#/library">Моя полка →</a></div><div class="grid works">${workTiles(contWorks)}</div></section>`:''}
    <section class="block"><div class="sec-head"><div><div class="kicker">Выбор платформы</div><h2>Сейчас читают</h2></div><a class="more" href="#/catalog?sort=popular">Весь каталог →</a></div>
      <div class="grid works">${workTiles(featured)}</div></section>
    <section class="block"><div class="grid two">
      <div><div class="sec-head"><div><div class="kicker">Рейтинг читателей</div><h2>Лучшее по рецензиям</h2></div></div>
        ${top.map((x,i)=>`<a class="rank" href="#/work/${x.w.id}"><span class="n">${i+1}</span>${ava(author(x.w.authorId))}<span style="flex:1"><b style="font-family:var(--serif)">${esc(x.w.title)}</b><br><span class="small muted">${esc(author(x.w.authorId).displayName)} · ${esc(x.w.genre)}</span></span><span class="rate">★ ${x.r.outOf10.toFixed(1)}</span></a>`).join('')||'<div class="empty">Рецензий пока нет</div>'}
        <p class="small muted">Рейтинг считается по фирменной системе «Чернил»: сюжет — до 5 баллов, персонажи, атмосфера, язык и эмоции — до 4. Максимум — 21 балл честной оценки.</p></div>
      <div><div class="sec-head"><div><div class="kicker">Жанры</div><h2>Куда нырнуть?</h2></div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr">${window.CHERNILA_SEED.genres.slice(0,8).map(g=>{const n=publicWorks().filter(w=>w.genre===g).length;return `<a class="genre-tile" href="#/catalog?genre=${encodeURIComponent(g)}"><h3>${esc(g)}</h3><span class="muted small">${n?n+' произведений':'станьте первым автором здесь ✒'}</span></a>`}).join('')}</div></div>
    </div></section>
    <section class="block"><div class="sec-head"><div><div class="kicker">Обновления</div><h2>Свежее из-под пера</h2></div><a class="more" href="#/feed">Лента обновлений →</a></div>
      <div class="grid works">${workTiles(fresh)}</div></section>
    <section class="block"><div class="sec-head"><div><div class="kicker">Сообщество</div><h2>Авторы платформы</h2></div><a class="more" href="#/authors">Все авторы →</a></div>
      <div class="grid authors">${topAuthors.map(authorCard).join('')}<a class="author-card" href="${me()?'#/studio/new':'#/auth?mode=signup'}" style="align-items:center;justify-content:center;text-align:center;border-style:dashed"><div><span style="font-family:var(--serif);font-size:2.2rem;color:var(--gold)">✒</span><h3>Следующий автор — вы?</h3><p>Платформа открылась с книгами её основателя. Ваше произведение может стать следующим в каталоге.</p><span class="btn sm" style="margin-top:10px">Опубликовать произведение</span></div></a></div></section>
    <section class="block"><div class="panel" style="text-align:center;padding:48px 26px"><div style="font-family:var(--serif);font-size:2.6rem;color:var(--gold)">✒</div>
      <h2 style="font-size:2rem;margin:10px 0">У вас тоже есть история?</h2><p class="muted" style="max-width:560px;margin:0 auto 22px">Регистрация занимает минуту. Редактор, черновики, главы, статистика, подписчики и первые читатели — уже здесь.</p>
      <a class="btn" href="${me()?'#/studio/new':'#/auth?mode=signup'}">Стать автором «Чернил»</a></div></section>
  </div>`;
}

function pageCatalog(params){
  setNav('catalog');
  const norm=t=>String(t||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  const link=patch=>{const p=new URLSearchParams(params);Object.entries(patch).forEach(([k,v])=>v?p.set(k,v):p.delete(k));return '#/catalog?'+p;};
  $('#app').innerHTML=`<div class="wrap"><div class="catalog-layout"><aside class="filters panel">
    <form id="catSearch" class="stack" role="search"><label class="field">Поиск по названию<input type="search" class="input" name="q" value="${esc(params.get('q')||'')}" placeholder="Начните вводить название…" autocomplete="off" aria-controls="catalogResults"></label><label class="field">Где искать<select name="scope"><option value="title">Только в названии</option><option value="all">Название, автор, теги, аннотация</option></select></label><span class="small muted">Результаты обновляются, пока вы печатаете.</span></form>
    <label class="field">Категория / жанр<select id="catGenre"><option value="">Все жанры</option>${[...new Set([...window.CHERNILA_SEED.genres,...publicWorks().map(w=>w.genre)])].map(g=>`<option value="${esc(g)}">${esc(g)} (${publicWorks().filter(w=>w.genre===g).length})</option>`).join('')}</select></label>
    <label class="field">Тип<select id="catType"><option value="">Любой</option>${window.CHERNILA_SEED.types.map(t=>`<option value="${t.id}">${t.label}</option>`).join('')}</select></label>
    <label class="field">Статус<select id="catStatus"><option value="">Любой</option>${Object.entries(STATUS_LABEL).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="field">Сортировка<select id="catSort">${[['new','Сначала обновлённые'],['popular','По просмотрам'],['rating','По рейтингу'],['likes','По лайкам'],['az','По алфавиту']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><a class="btn ghost sm" href="#/catalog">Сбросить фильтры</a></aside>
    <div><div class="kicker">Библиотека</div><h1>Каталог произведений</h1><p class="muted" id="catalogCount" role="status" aria-live="polite"></p><div class="grid works" id="catalogResults"></div></div></div></div>`;
  const controls={genre:$('#catGenre'),type:$('#catType'),status:$('#catStatus'),sort:$('#catSort'),scope:$('#catSearch [name=scope]'),q:$('#catSearch [name=q]')};
  Object.entries(controls).forEach(([k,el])=>{el.value=params.get(k)||(k==='sort'?'new':k==='scope'?'title':'');});
  const update=()=>{
    const values=Object.fromEntries(Object.entries(controls).map(([k,el])=>[k,el.value])),q=norm(values.q);
    const list=publicWorks().filter(w=>(!values.genre||w.genre===values.genre)&&(!values.type||w.type===values.type)&&(!values.status||w.status===values.status)&&(!q||norm(values.scope==='all'?w.title+' '+w.description+' '+author(w.authorId).displayName+' '+(w.tags||[]).join(' '):w.title).includes(q)||groupsOf(w.id).some(g=>norm(g.title).includes(q))));
    const sorts={new:(a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''),popular:(a,b)=>(b.views||0)-(a.views||0),rating:(a,b)=>(rating(b.id)?.outOf10||0)-(rating(a.id)?.outOf10||0),likes:(a,b)=>likesOf(b.id)-likesOf(a.id),az:(a,b)=>a.title.localeCompare(b.title,'ru')};list.sort(sorts[values.sort]||sorts.new);
    const n=shelfEntries(list).length;$('#catalogCount').textContent=`Найдено: ${n} ${n===1?'карточка':'карточек'} · произведений: ${list.length}. Книги одного цикла собраны вместе.`;
    $('#catalogResults').innerHTML=list.length?workTiles(list):'<div class="empty">Ничего не найдено. Измените название или фильтры.</div>';
    history.replaceState(null,'',link(values));
  };
  Object.values(controls).forEach(el=>el.addEventListener(el.type==='search'?'input':'change',update));
  $('#catSearch').addEventListener('submit',e=>{e.preventDefault();update();});update();
}

function pageStoryGate(w){
  setNav('catalog');$('#app').innerHTML=`<div class="wrap"><section class="panel story-lock"><span class="lock-emblem" aria-hidden="true">▣</span><div class="kicker">Доступ по паролю</div><h1>${esc(w.title)}</h1><p class="muted">${esc(w.description)}</p><p>Текст этой истории закрыт автором. Введите пароль, которым он с вами поделился.</p><form id="unlockStory" class="stack"><label class="field">Пароль истории<input class="input" name="storyPassword" type="password" required maxlength="72" autocomplete="off" placeholder="Пароль от автора"></label><button class="btn" type="submit">Открыть историю</button><p class="small muted" id="unlockStatus" role="status"></p></form><p class="small muted">Сайт не сохраняет этот пароль. После перезагрузки страницы его потребуется ввести снова.</p><a class="more" href="#/catalog">← В каталог</a></section></div>`;
  const form=$('#unlockStory'),feedback=$('#unlockStatus'),original=location.hash;form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;feedback.textContent='Проверяем пароль…';try{await Store.unlockStory(w.id,new FormData(form).get('storyPassword'));form.reset();if(form.isConnected&&location.hash===original)route();}catch(err){if(form.isConnected&&location.hash===original)feedback.textContent=err.message;}finally{b.disabled=false;}});
}
function storyAccessSettings(w){if(w.legacyUrl)return '';const ready=Store.mode==='supabase'&&Store.studioReady;return `<details class="panel story-access"><summary>Доступ к истории · ${w.passwordProtected?'закрыта паролем':'без пароля'}</summary><p class="small muted">Пароль доступен каждому автору. Название, обложка и аннотация остаются публичными; закрывается текст глав. Премодерация сохраняется.</p>${!ready?'<p class="small muted">'+(Store.mode==='local'?'В локальном режиме настоящая парольная защита недоступна. Нужна общая база Supabase.':'Сначала владелец должен применить SQL настройки мастерской. До этого защита не включается.')+'</p>':''}<form class="stack" id="storyPasswordForm"><label class="field">${w.passwordProtected?'Новый пароль':'Пароль истории'}<input class="input" name="storyPassword" type="password" minlength="8" maxlength="72" required autocomplete="off" placeholder="Не пароль от аккаунта — придумайте отдельный" ${ready?'':'disabled'}></label><label class="field">Повторите пароль<input class="input" name="confirmStoryPassword" type="password" minlength="8" maxlength="72" required autocomplete="off" placeholder="Введите пароль истории ещё раз" ${ready?'':'disabled'}></label><p class="small muted">Минимум 8 символов, не более 72 байт UTF-8 (кириллица занимает больше одного байта). Восстановить старый пароль нельзя, но вы можете назначить новый. Уже скачанные читателями копии отозвать нельзя.</p><div class="action-row"><button class="btn sm" type="submit" ${ready?'':'disabled'}>${w.passwordProtected?'Изменить пароль':'Включить защиту'}</button>${w.passwordProtected?'<button class="btn ghost sm" type="button" id="removeStoryPassword" '+(ready?'':'disabled')+'>Убрать пароль</button>':''}</div><p id="storyAccessStatus" class="small muted" role="status"></p></form></details>`;}
function bindStoryAccess(w){const form=$('#storyPasswordForm');if(!form)return;const feedback=$('#storyAccessStatus');const save=async password=>{const buttons=$$('button',form);buttons.forEach(b=>b.disabled=true);feedback.textContent='Обновляем доступ…';try{await Store.setStoryPassword(w.id,password);form.reset();toast(password===null?'Пароль снят':'Пароль истории сохранён');if(form.isConnected)route();}catch(err){feedback.textContent=err.message;buttons.forEach(b=>b.disabled=false);}};form.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(form);if(f.get('storyPassword')!==f.get('confirmStoryPassword')){feedback.textContent='Пароли не совпадают.';return;}save(f.get('storyPassword'));});$('#removeStoryPassword')?.addEventListener('click',()=>{if(confirm('Снять пароль? После одобрения история будет доступна всем.'))save(null);});}
function pageWork(id){
  const w=work(id); if(!w) return page404();
  if(!Store.canReadStory(w))return pageStoryGate(w);
  setNav('catalog'); Store.addView(id);
  const a=author(w.authorId), chs=chaptersOf(id), r=rating(id), revs=reviewsOf(id), u=me(), shelf=myShelf(id);
  const similar=publicWorks().filter(x=>x.id!==id&&(x.genre===w.genre||x.type===w.type)).slice(0,4);
  const myReview=u&&revs.find(x=>x.userId===u.id);
  $('#app').innerHTML=`<div class="wrap">
    ${!Store.isWorkPublic(w)?'<p class="moderation-warning">Предпросмотр: произведение не опубликовано. Его видят только автор и администратор.</p>':''}<div class="work-hero reveal"><div>${coverHTML(w)}</div>
    <div><div class="chiprow">${w.legacyUrl?'':`<span class="pill gold">${esc(TYPE_LABEL[w.type]||w.type)}</span>`}<span class="pill">${esc(w.genre)}</span><span class="pill">${esc(STATUS_LABEL[w.status]||w.status)}</span><span class="pill">${esc(w.ageRating)}</span>${w.featured?'<span class="pill gold">✦ Выбор платформы</span>':''}</div>
    <h1 style="margin-top:16px">${esc(w.title)}</h1>${w.subtitle?`<p style="font-family:var(--body);font-style:italic;font-size:1.25rem;color:var(--gold2)">${esc(w.subtitle)}</p>`:''}
    <div class="author-line">${ava(a,'md')}<div><a href="#/author/${a.id}" style="font-family:var(--serif);font-size:1.2rem"><b>${esc(a.displayName)}</b></a><div class="small muted">@${esc(a.username)} · ${followersOf(a.id)} подписчиков</div></div>
    ${u&&u.id!==a.id?`<button class="btn ${isFollowing(a.id)?'dark':'ghost'} sm" data-action="follow" data-id="${a.id}" style="margin-left:auto">${isFollowing(a.id)?'✓ Вы подписаны':'+ Подписаться'}</button>`:''}</div>
    <p style="font-family:var(--body);font-size:1.18rem;color:var(--muted)">${esc(w.description)}</p>
    <div class="work-meta" style="font-size:.9rem"><span class="rate" style="font-size:1.05rem">${r?`★ ${r.outOf10.toFixed(1)} / 10 · ${r.total.toFixed(1)} из 21 · ${r.count} рец.`:'☆ Рецензий пока нет'}</span><span>👁 ${fmt(w.views||0)} просмотров</span><span>♥ ${likesOf(id)}</span>${w.legacyUrl?'<span>Полный авторский текст</span>':`<span>◈ ${chs.length} глав</span><span>✎ ${fmt(workWords(w))} слов</span><span>⏱ ~${readTime(w)} мин чтения</span>`}${w.passwordProtected?'<span>▣ По паролю</span>':''}<span>обновл. ${esc(w.updatedAt||'')}</span></div>
    <div class="action-row">
      ${chs.length?`<a class="btn" href="#/read/${id}/${chs[0].id}">Читать →</a>`:''}
      ${w.legacyUrl?`<a class="btn ${chs.length?'ghost':''}" href="${esc(w.legacyUrl)}">Читать полный текст в исходной читалке ↗</a>`:''}
      <button class="btn ${isLiked(id)?'':'ghost'}" data-action="like" data-id="${id}">${isLiked(id)?'♥ Нравится':'♡ Нравится'}</button>
      <select id="shelfSel" class="input" style="width:auto;border-radius:99px" aria-label="Добавить на полку"><option value="">📚 На полку…</option>${Object.entries(SHELVES).map(([k,v])=>`<option value="${k}" ${shelf===k?'selected':''}>${v}</option>`).join('')}${shelf?'<option value="__remove">Убрать с полки</option>':''}</select>
      <button class="btn ghost" data-action="share" data-id="${id}">Поделиться</button>
      ${u&&u.id===w.authorId?`<a class="btn dark" href="#/studio/work/${id}">✎ Редактировать в студии</a>`:''}
    </div>
    <div class="chiprow">${(w.tags||[]).map(t=>`<a class="tag" href="#/catalog?scope=all&q=${encodeURIComponent(t.trim())}">#${esc(t.trim())}</a>`).join('')}</div>
    </div></div>

    ${groupsOf(id).map(g=>{const ws=groupWorks(g),i=ws.findIndex(x=>x.id===id);return `<section class="panel group-navigation"><div class="kicker">${esc(GROUP_KINDS[g.kind])}</div><h2><a href="#/group/${encodeURIComponent(g.id)}">${esc(g.title)}</a></h2><p class="small muted">Порядок чтения · ${i+1} из ${ws.length}</p><div class="chiprow">${ws.map((x,j)=>`<a class="chipbtn ${x.id===id?'on':''}" href="#/work/${x.id}" ${x.id===id?'aria-current="page"':''}>${j+1}. ${esc(x.title)}</a>`).join('')}</div><div class="action-row">${ws[i-1]?`<a class="btn ghost sm" href="#/work/${ws[i-1].id}">← Предыдущее</a>`:''}${ws[i+1]?`<a class="btn ghost sm" href="#/work/${ws[i+1].id}">Следующее →</a>`:''}</div></section>`;}).join('')}
    ${w.legacyUrl?'':`<section class="block"><div class="sec-head"><div><div class="kicker">Содержание</div><h2>${w.type==='poetry'?'Тексты':'Главы'} · ${chs.length}</h2></div></div>
    ${chs.length?`<div class="chapter-list">${chs.map((c,i)=>`<a class="chapter-row" href="#/read/${id}/${c.id}"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif);font-size:1.08rem">${esc(c.title)}</b><br><span class="small muted">${fmt(words(c.body))} слов · ~${Math.max(1,Math.round(words(c.body)/180))} мин · ${esc(c.createdAt||'')}</span></span><span style="color:var(--gold)">Читать →</span></a>`).join('')}</div>`
    :`<div class="empty"><span class="big">◈</span>Автор ещё не опубликовал главы.</div>`}</section>`}

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

    ${similar.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Читать дальше</div><h2>Похожие произведения</h2></div></div><div class="grid works">${workTiles(similar)}</div></section>`:''}
  </div>`;
  const sel=$('#shelfSel'); if(sel) sel.addEventListener('change',()=>{ if(!needAuth())return; Store.setShelf(id, sel.value==='__remove'?null:sel.value||null); toast(sel.value&&sel.value!=='__remove'?'Добавлено на полку: '+SHELVES[sel.value]:'Убрано с полки'); route(); });
  const cf=$('#commentForm'); if(cf) cf.addEventListener('submit',e=>{e.preventDefault();try{Store.addComment(id,new FormData(cf).get('text').trim());toast('Комментарий опубликован');route();}catch(err){toast(err.message,true)}});
  const rf=$('#reviewForm'); if(rf){const scores={plot:0,characters:0,atmosphere:0,style:0,emotion:0};
    $$('.stars',rf).forEach(box=>box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const v=+b.dataset.v;scores[box.dataset.crit]=v;$$('button',box).forEach((x,i)=>x.classList.toggle('on',i<v));$('#revTotal').textContent='Итого: '+Object.values(scores).reduce((s,x)=>s+x,0)+' / 21';}));
    rf.addEventListener('submit',e=>{e.preventDefault();try{Store.addReview(id,new FormData(rf).get('text').trim(),scores);toast('Рецензия опубликована ✦');route();}catch(err){toast(err.message,true)}});}
}

let readerSettings={theme:'author',size:null};try{const p=JSON.parse(localStorage.getItem('chernila_reader')||'null');if(p){if(['author','dark','sepia','light'].includes(p.theme))readerSettings.theme=p.theme;if(Number.isFinite(p.size))readerSettings.size=Math.max(15,Math.min(28,p.size));}}catch(_){}
function pageRead(wid,cid){
  const w=work(wid); if(!w) return page404();
  if(!Store.canReadStory(w))return pageStoryGate(w);
  if(w.legacyUrl){location.replace(w.legacyUrl);return;}
  const chs=chaptersOf(wid); const idx=chs.findIndex(c=>c.id===cid); if(idx<0) return page404();
  const c=chs[idx], a=author(w.authorId), prev=chs[idx-1], next=chs[idx+1];
  setNav('catalog');
  $('#app').innerHTML=`
  ${!Store.isWorkPublic(w)?'<div class="wrap moderation-warning">Предпросмотр неопубликованного текста — доступен только автору и администратору.</div>':''}<div class="reader-top"><div class="wrap"><a class="btn ghost sm" href="#/work/${wid}">← К произведению</a>
    <span style="font-family:var(--serif)"><b>${esc(w.title)}</b> <span class="muted">· ${esc(a.displayName)}</span></span>
    <span style="margin-left:auto;display:flex;gap:7px;flex-wrap:wrap">
      <button class="chipbtn" data-action="font" data-v="-1">A−</button><button class="chipbtn" data-action="font" data-v="1">A+</button>
      ${[['author','Авторская'],['dark','Тьма'],['sepia','Бумага'],['light','Свет']].map(([v,l])=>`<button class="chipbtn ${readerSettings.theme===v?'on':''}" data-action="theme" data-v="${v}">${l}</button>`).join('')}
      <button class="chipbtn ${isLiked(wid)?'on':''}" data-action="like" data-id="${wid}">♥ ${likesOf(wid)}</button>
    </span></div></div>
  ${w.legacyUrl?`<div class="wrap"><div class="panel" style="margin-top:22px;text-align:center">✦ Произведение первого автора платформы. Здесь — начало и аннотация, полный текст открывается в исходной авторской читалке.<br><br><a class="btn" href="${esc(w.legacyUrl)}">Читать «${esc(w.title)}» полностью ↗</a></div></div>`:''}
  <article class="reader ${readerSettings.theme} ${w.type==='poetry'?'poetry':''} reveal">
    <div class="kicker" style="justify-content:center">${String(idx+1).padStart(2,'0')} / ${String(chs.length).padStart(2,'0')}</div>
    <h1>${esc(c.title)}</h1><div class="r-meta">${esc(w.title)} · ${esc(a.displayName)} · ${fmt(words(c.body))} слов</div>
    <div class="reader-text" style="font-size:${readerSettings.size||InkStory.clean(w.readerStyle).size}px">${renderText(c.body,w.type==='poetry')}</div>
    <hr aria-label="Конец главы">
  </article>
  <div class="wrap" style="max-width:760px"><div class="panel">
    <h3 style="margin-bottom:12px">Содержание</h3><div class="chapter-list">${chs.map((x,i)=>`<a class="chapter-row" href="#/read/${wid}/${x.id}" style="${x.id===cid?'border-color:var(--gold)':''}"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif)">${esc(x.title)}</b></span>${x.id===cid?'<span class="pill gold">сейчас</span>':''}</a>`).join('')}</div>
    <h3 style="margin:26px 0 6px">Комментарии к главе · ${commentsOf(wid).filter(x=>x.chapterId===cid).length}</h3>
    ${commentsOf(wid).filter(x=>x.chapterId===cid).map(x=>`<div class="comment">${ava(author(x.userId))}<div><b>${esc(x.name)}</b> <span class="small muted">${esc(x.createdAt)}</span><p style="margin:4px 0 0">${esc(x.text)}</p></div></div>`).join('')||'<p class="muted small">К этой главе пока нет комментариев.</p>'}
    ${me()?`<form id="chComment" class="stack" style="margin-top:14px"><textarea class="input" name="text" rows="2" required placeholder="Ваша мысль об этой главе…"></textarea><div><button class="btn sm">Отправить</button></div></form>`:''}
  </div></div>
  <nav class="reader-nav">${prev?`<a class="btn ghost" href="#/read/${wid}/${prev.id}">← ${esc(prev.title)}</a>`:'<span></span>'}${next?`<a class="btn" href="#/read/${wid}/${next.id}">${esc(next.title)} →</a>`:`<a class="btn" href="#/work/${wid}">Завершить и оценить ★</a>`}</nav>`;
  InkStory.apply($('.reader'),w.readerStyle,readerSettings.theme);
  Store.progress.set(wid,cid,(idx+1)/chs.length*100);
  const cc=$('#chComment'); if(cc) cc.addEventListener('submit',e=>{e.preventDefault();Store.addComment(wid,new FormData(cc).get('text').trim(),cid);toast('Комментарий к главе опубликован');route();});
  const onScroll=()=>{const d=document.documentElement;const p=d.scrollTop/Math.max(1,d.scrollHeight-d.clientHeight)*100;$('#readProgress').style.width=p+'%'};
  addEventListener('scroll',onScroll,{passive:true}); setTimeout(()=>removeEventListener('scroll',onScroll),60000);
}

function pageAuthor(id){
  const a=S.authors.find(x=>x.id===id||x.username===id); if(!a) return page404();
  id=a.id;
  const custom=Store.cleanCustomization(a.customization||{});
  setNav('authors'); const ws=publicWorks().filter(w=>w.authorId===id); const u=me();
  const totalViews=ws.reduce((s,w)=>s+(w.views||0),0), totalLikes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  const revs=S.reviews.filter(r=>ws.some(w=>w.id===r.workId));
  $('#app').innerHTML=`<div class="wrap public-profile" style="${profileStyle(a)}">${profilePreview(a)}<header style="padding:24px 0 10px" class="reveal">
    <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
    <div style="flex:1;min-width:260px"><div class="kicker">${a.founder?'Основатель и первый автор платформы':'Автор «Чернил»'} · с ${esc((a.joinedAt||'').slice(0,7))}</div>
    <h1 class="sr-only">${esc(a.displayName)}</h1>


    <p class="muted" style="max-width:700px;font-family:var(--body);font-size:1.12rem">${esc(a.bio||'Автор пока ничего о себе не рассказал.')}</p>
    <div class="chiprow">${(a.badges||[]).map(b=>`<span class="pill gold">✦ ${esc(b)}</span>`).join('')}</div></div>
    <div style="display:flex;flex-direction:column;gap:9px">${u&&u.id!==a.id?`<button class="btn ${isFollowing(a.id)?'dark':''}" data-action="follow" data-id="${a.id}">${isFollowing(a.id)?'✓ Вы подписаны':'+ Подписаться'}</button>`:''}
    ${u&&u.id===a.id?`<a class="btn ghost" href="#/profile">✎ Редактировать профиль</a><a class="btn" href="#/studio">Студия автора</a>`:''}
    ${a.username==='cnizroman'?`<a class="btn ghost" href="https://www.donationalerts.com/r/cnizroman" target="_blank" rel="noopener">Поддержать автора ↗</a>`:''}</div></div>
    ${custom.showStats?`<div class="hero-stats"><div class="hstat"><b>${ws.length}</b><span>произведений</span></div><div class="hstat"><b>${followersOf(a.id)}</b><span>подписчиков</span></div>
    <div class="hstat"><b>${S.follows.filter(f=>f.followerId===a.id).length}</b><span>подписок</span></div><div class="hstat"><b>${fmt(totalViews)}</b><span>просмотров</span></div>
    <div class="hstat"><b>${totalLikes}</b><span>лайков</span></div><div class="hstat"><b>${revs.length}</b><span>рецензий получено</span></div></div>`:''}</header>
    ${a.username==='cnizroman'?`<section class="block"><div class="panel"><div class="kicker">Наследие платформы</div><h2 style="margin:12px 0">Архив автора «Никто не вспомнит»</h2>
      <p class="muted">«Чернила» выросли из личного литературного проекта Cnizroman. Закулисье тетралогии сохранено полностью:</p>
      <div class="chiprow" style="margin-top:12px">${[['archive-references.html','🔗 Отсылки'],['archive-thoughts.html','💭 Изначальные мысли'],['archive-visual.html','🎨 Визуальный архив'],['archive-cut.html','Вырезанное'],['archive-drafts.html','✍ Черновики']].map(([h,l])=>`<a class="chipbtn" href="${h}">${l} ↗</a>`).join('')}</div></div></section>`:''}
    <section class="block"><div class="sec-head"><div><div class="kicker">Библиография</div><h2>Произведения автора</h2></div></div>
    ${ws.length?`<div class="grid works">${workTiles(ws)}</div>`:'<div class="empty"><span class="big">✒</span>Произведений пока нет.</div>'}</section>
    ${revs.length?`<section class="block"><div class="sec-head"><div><div class="kicker">Голоса читателей</div><h2>Последние рецензии на автора</h2></div></div>
    ${revs.slice(0,3).map(r=>`<article class="review"><b>${esc(r.name)}</b> <span class="muted small">о произведении «${esc(work(r.workId)?.title||'')}» · ★ ${reviewTotal(r)}/21</span><p style="font-family:var(--body);font-size:1.08rem;margin-bottom:0">${esc(r.text)}</p></article>`).join('')}</section>`:''}
  </div>`;
}

function pageAuthors(){
  setNav('authors'); const list=[...S.authors].sort((a,b)=>followersOf(b.id)-followersOf(a.id));
  $('#app').innerHTML=`<div class="wrap" style="padding:48px 0 0"><div class="kicker">Сообщество</div>
  <h1 style="font-size:2.6rem;margin:12px 0">Авторы «Чернил»</h1><p class="muted">${S.authors.length} авторов · ${publicWorks().length} произведений · подписывайтесь, чтобы видеть новые главы в своей ленте.</p>
  <div class="grid authors" style="margin-top:28px">${list.map(authorCard).join('')}</div>
  <div class="panel center" style="margin-top:30px"><h2>Здесь не хватает одного автора</h2><p class="muted">Вас.</p><a class="btn" href="${me()?'#/studio/new':'#/auth?mode=signup'}">Присоединиться</a></div></div>`;
}

function pageFeed(){
  setNav('feed'); const u=me();
  const items=S.chapters.filter(c=>c.status==='published'&&Store.isWorkPublic(work(c.workId))&&Store.canReadStory(work(c.workId))).map(c=>({c,w:work(c.workId)})).filter(x=>x.w)
    .sort((a,b)=>(b.c.createdAt||'').localeCompare(a.c.createdAt||''));
  const mine=u?items.filter(x=>isFollowing(x.w.authorId)):[]; const show=mine.length?mine:items;
  $('#app').innerHTML=`<div class="wrap" style="padding:48px 0 0;max-width:860px"><div class="kicker">Лента</div>
  <h1 style="font-size:2.6rem;margin:12px 0">${mine.length?'Новые главы ваших авторов':'Лента обновлений платформы'}</h1>
  <p class="muted">${u?(mine.length?'Вы подписаны — вот свежее от ваших авторов.':'Подписывайтесь на авторов, и здесь будет только ваше. Пока — обновления всей платформы.'):'Войдите и подписывайтесь на авторов, чтобы собрать личную ленту.'}</p>
  <div style="margin-top:26px">${show.slice(0,30).map(({c,w})=>{const a=author(w.authorId);return `<a class="feed-item" href="#/read/${w.id}/${c.id}">${ava(a,'md')}<span style="flex:1"><b style="font-family:var(--serif);font-size:1.12rem">${esc(c.title)}</b> ${w.legacyUrl?'':`<span class="pill">${esc(TYPE_LABEL[w.type]||'')}</span>`}<br>
    <span class="muted small">«${esc(w.title)}» · ${esc(a.displayName)} · ${esc(c.createdAt||'')} · ${fmt(words(c.body))} слов</span><br><span class="muted" style="font-family:var(--body)">${esc(c.body.replace(/\*\*/g,'').slice(0,150))}…</span></span><span style="color:var(--gold)">→</span></a>`}).join('')||'<div class="empty">Лента пуста</div>'}</div></div>`;
}

function pageLibrary(){
  setNav('library'); const u=me();
  if(!u){$('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">📚</span><h2>Ваша полка ждёт вас</h2><p>Закладки, «хочу прочитать», прочитанное и избранное появятся здесь после входа.</p><a class="btn" href="#/auth">Войти</a></div></div>`;return}
  const groups=Object.entries(SHELVES).map(([k,label])=>({k,label,ws:S.shelves.filter(s=>s.userId===u.id&&s.shelf===k).map(s=>work(s.workId)).filter(w=>Store.isWorkPublic(w))}));
  const prog=Store.progress.get(); const cont=Object.entries(prog).map(([wid,p])=>({w:work(wid),p})).filter(x=>Store.isWorkPublic(x.w)&&x.p.pct<100);
  const liked=S.likes.filter(l=>l.userId===u.id).map(l=>work(l.workId)).filter(Boolean);
  const section=(title,ws)=>ws.length?`<section class="block"><div class="sec-head"><div><h2>${title} · ${ws.length}</h2></div></div><div class="grid works">${workTiles(ws)}</div></section>`:'';
  $('#app').innerHTML=`<div class="wrap" style="padding-top:48px"><div class="kicker">Личная библиотека · ${esc(u.displayName)}</div><h1 style="font-size:2.6rem;margin:12px 0">Моя полка</h1>
  ${cont.length?`<section class="block"><div class="sec-head"><div><h2>Продолжить чтение</h2></div></div>${cont.map(({w,p})=>`<a class="rank" href="#/read/${w.id}/${p.chapterId}">${ava(author(w.authorId))}<span style="flex:1"><b style="font-family:var(--serif)">${esc(w.title)}</b><br><span class="small muted">прочитано ${Math.round(p.pct)}%</span><span class="progress-line" style="display:block;margin-top:7px"><i style="width:${p.pct}%"></i></span></span><span class="btn sm">Продолжить →</span></a>`).join('')}</section>`:''}
  ${groups.map(g=>section(g.label,g.ws)).join('')}
  ${section('Понравилось',liked)}
  ${!groups.some(g=>g.ws.length)&&!liked.length&&!cont.length?'<div class="empty" style="margin-top:26px"><span class="big">📚</span>Полка пуста. Загляните в каталог и добавьте первое произведение.<br><br><a class="btn" href="#/catalog">В каталог</a></div>':''}
  </div>`;
}

function studioSide(on){return `<aside class="studio-side">
  <a href="#/studio" class="${on==='dash'?'on':''}">◈ Обзор и статистика</a>
  <a href="#/studio/works" class="${on==='works'?'on':''}">✎ Мои произведения</a>
  <a href="#/studio/groups" class="${on==='groups'?'on':''}">◈ Циклы и группы</a>
  <a href="#/studio/new" class="${on==='new'?'on':''}">+ Новое произведение</a>
  <a href="#/profile" class="${on==='profile'?'on':''}">◍ Профиль автора</a>
  <a href="#/library">📚 Моя полка</a><a href="#/feed">✦ Моя лента</a>
  ${me()?.role==='admin'?'<a href="#/admin">♛ Админ-панель</a>':''}</aside>`}
function guardStudio(){ if(me()) return true; $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">✒</span><h2>Студия автора</h2><p>Редактор, черновики, главы, статистика и подписчики — войдите или зарегистрируйтесь как автор.</p><a class="btn" href="#/auth?mode=signup">Стать автором</a> <a class="btn ghost" href="#/auth">Войти</a></div></div>`; setNav('studio'); return false; }
function pageStudio(){
  if(!guardStudio()) return; setNav('studio'); const u=me(); const ws=S.works.filter(w=>w.authorId===u.id);
  const views=ws.reduce((s,w)=>s+(w.views||0),0), likes=ws.reduce((s,w)=>s+likesOf(w.id),0);
  const revs=S.reviews.filter(r=>ws.some(w=>w.id===r.workId)); const comms=S.comments.filter(c=>ws.some(w=>w.id===c.workId));
  const drafts=S.chapters.filter(c=>c.status==='draft'&&ws.some(w=>w.id===c.workId));
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('dash')}<div>
    <div class="kicker">Студия автора</div><h1 style="font-size:2.3rem;margin:10px 0">Здравствуйте, ${esc(u.displayName)} ✒</h1>
    <div class="statgrid"><div class="statbox"><b>${ws.length}</b>произведений</div><div class="statbox"><b>${fmt(views)}</b>просмотров</div><div class="statbox"><b>${likes}</b>лайков</div>
    <div class="statbox"><b>${followersOf(u.id)}</b>подписчиков</div><div class="statbox"><b>${revs.length}</b>рецензий</div><div class="statbox"><b>${drafts.length}</b>черновиков глав</div></div>
    <div class="panel"><h3>Статистика ваших произведений</h3><p class="small muted">Здесь показаны накопленные просмотры и реакции. История по дням пока не собирается — искусственный график не строится.</p></div>
    <div class="grid two" style="margin-top:20px"><div class="panel"><h3 style="margin-bottom:12px">Последние рецензии вам</h3>
      ${revs.slice(0,4).map(r=>`<div class="comment">${ava(author(r.userId))}<div><b>${esc(r.name)}</b> <span class="rate">★ ${reviewTotal(r)}/21</span><p style="margin:4px 0 0">${esc(r.text)}</p><a class="small" style="color:var(--gold)" href="#/work/${r.workId}">«${esc(work(r.workId)?.title||'')}» →</a></div></div>`).join('')||'<p class="muted">Рецензий пока нет. Поделитесь ссылкой на произведение — первые читатели ближе, чем кажется.</p>'}</div>
    <div class="panel"><h3 style="margin-bottom:12px">Последние комментарии вам</h3>
      ${comms.slice(0,5).map(c=>`<div class="comment">${ava(author(c.userId))}<div><b>${esc(c.name)}</b> <span class="small muted">${esc(c.createdAt)}</span><p style="margin:4px 0 0">${esc(c.text)}</p></div></div>`).join('')||'<p class="muted">Комментариев пока нет.</p>'}</div></div>
    <div class="panel" style="margin-top:20px"><h3>Быстрый старт</h3><p class="muted">Чужие публикации проходят ручную проверку. Глава появится в ленте только после одобрения; автоматическая отправка уведомлений пока не настроена.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="#/studio/new">+ Новое произведение</a><a class="btn ghost" href="#/studio/works">Мои произведения</a></div></div>
  </div></div></div>`;

}
function pageStudioWorks(){
  if(!guardStudio())return;setNav('studio');const u=me(),ws=S.works.filter(w=>w.authorId===u.id);
  const row=w=>`<div class="studio-work-row"><div><a href="#/work/${w.id}"><b>${esc(w.title)}</b></a><p class="small muted">${esc(w.genre)} · ${esc(STATUS_LABEL[w.status])} · ${esc(REVIEW_LABEL[w.moderationStatus]||(w.legacyUrl?'Опубликовано':'Черновик'))}${w.legacyUrl?' · Исходный авторский текст':` · ${chaptersOf(w.id,true).length} глав`}</p></div><a class="btn dark sm" href="#/studio/work/${w.id}">Открыть мастерскую</a></div>`;
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('works')}<div><div class="kicker">Личная мастерская · @${esc(u.username)}</div><h1>Мои произведения</h1><p class="muted">Только произведения, принадлежащие вашему аккаунту. ${ws.length} текстов · ${shelfEntries(ws).length} карточек.</p><div class="action-row"><a class="btn" href="#/studio/new">+ Произведение</a><a class="btn ghost" href="#/studio/groups">Управлять циклами</a></div><div class="stack" style="margin-top:24px">${shelfEntries(ws).map(e=>e.group?`<details class="panel studio-cycle"><summary><span class="pill gold">${esc(GROUP_KINDS[e.group.kind])}</span> <b>${esc(e.group.title)}</b> · ${groupWorks(e.group,true).length} текстов</summary><p class="muted">${esc(e.group.description)}</p>${groupWorks(e.group,true).filter(w=>w.authorId===u.id).map(row).join('')}<a class="more" href="#/studio/groups/${encodeURIComponent(e.group.id)}">Состав и порядок →</a></details>`:row(e.work)).join('')||'<div class="empty">У вас пока нет своих произведений. Создайте первое — чужие работы сюда не добавляются.</div>'}</div></div></div></div>`;
}
function pageStudioGroups(id){
  if(!guardStudio()) return; setNav('studio');
  const mine=S.groups.filter(g=>g.authorId===me().id), g=id&&id!=='new'?mine.find(g=>g.id===id):null;
  if(id&&id!=='new'&&!g) return page404();
  const ws=S.works.filter(w=>w.authorId===me().id);
  const ordered=g?[...groupWorks(g,true),...ws.filter(w=>!g.workIds.includes(w.id))]:ws;
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('groups')}<div>
    <div class="kicker">Студия автора</div><h1>Циклы и группы</h1>
    <p class="muted">Объединяйте свои произведения в дилогии, трилогии, тетралогии и серии. Тип группы — авторское обозначение: пролог можно включить отдельно, а незавершённый цикл — дополнять.</p>
    ${!id?`<a class="btn" href="#/studio/groups/new">+ Создать группу</a><div class="stack" style="margin-top:24px">${mine.map(x=>`<article class="panel"><span class="pill gold">${esc(GROUP_KINDS[x.kind])}</span><h2>${esc(x.title)}</h2><p class="muted">Произведений: ${groupWorks(x,true).length}</p><div class="action-row"><a class="btn ghost sm" href="#/group/${encodeURIComponent(x.id)}">Открыть</a><a class="btn sm" href="#/studio/groups/${encodeURIComponent(x.id)}">Изменить состав и порядок</a><button class="btn danger sm" data-delete-group="${esc(x.id)}">Удалить группу</button></div></article>`).join('')||'<div class="empty">Групп пока нет. Создайте первую из своих произведений.</div>'}</div>`:
    `<form id="groupForm" class="panel stack" style="margin-top:24px"><h2>${g?'Редактировать группу':'Новая группа'}</h2>
      <label class="field">Название группы *<input class="input" name="title" required maxlength="140" value="${esc(g?.title||'')}" placeholder="Название вашего цикла"></label>
      <label class="field">Тип группы<select name="kind">${Object.entries(GROUP_KINDS).map(([k,v])=>`<option value="${k}" ${g?.kind===k?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="field">Описание<textarea class="input" name="description" maxlength="2000" rows="3" placeholder="О чём цикл? С чего начать чтение?">${esc(g?.description||'')}</textarea></label>
      <fieldset class="group-members"><legend>Состав и порядок чтения</legend><p class="small muted">Отметьте существующие произведения и задайте порядок числами. При одинаковых номерах сохранение не выполнится. Для пролога можно указать 0.</p>
      ${ordered.map((w,i)=>`<div class="group-member"><label><input type="checkbox" name="workId" value="${esc(w.id)}" ${g?.workIds.includes(w.id)?'checked':''}> <span>${esc(w.title)}</span></label><label class="field">Порядок<input class="input" type="number" min="0" max="999" step="1" data-order="${esc(w.id)}" aria-label="Порядок: ${esc(w.title)}" value="${i+1}"></label></div>`).join('')||'<p class="muted">Сначала <a class="more" href="#/studio/new">добавьте произведение</a>.</p>'}</fieldset>
      <div class="action-row"><button class="btn" type="submit" ${ws.length?'':'disabled'}>Сохранить группу</button><a class="btn ghost" href="#/studio/groups">Отмена</a></div>
    </form>`}</div></div></div>`;
  $$('[data-delete-group]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Удалить только группу? Сами произведения и главы сохранятся.')) return;
    b.disabled=true;try{await Store.deleteGroup(b.dataset.deleteGroup);toast('Группа удалена, произведения сохранены');route();}catch(e){toast(e.message,true);b.disabled=false;}
  }));
  const form=$('#groupForm'); if(!form) return;
  form.addEventListener('submit',async e=>{
    e.preventDefault();const f=new FormData(form), btn=form.querySelector('[type=submit]');
    const selected=f.getAll('workId').map(id=>({id,order:$$('[data-order]',form).find(x=>x.dataset.order===id).value.trim()===''?NaN:Number($$('[data-order]',form).find(x=>x.dataset.order===id).value)}));
    if(selected.some(x=>!Number.isInteger(x.order)||x.order<0||x.order>999)||new Set(selected.map(x=>x.order)).size!==selected.length){toast('Укажите разные целые номера порядка от 0 до 999.',true);return;}
    btn.disabled=true;
    try{await Store.upsertGroup({id:g?.id,title:f.get('title'),kind:f.get('kind'),description:f.get('description'),workIds:selected.sort((a,b)=>a.order-b.order).map(x=>x.id)});toast('Группа сохранена');location.hash='#/studio/groups';}
    catch(err){toast(err.message,true);btn.disabled=false;}
  });
}

function workFormHTML(w){
  w=w||{title:'',subtitle:'',type:'story',genre:'Драма',tags:[],description:'',status:'ongoing',ageRating:'12+',cover:{from:COVERS[0][0],to:COVERS[0][1],symbol:'✦'}};
  return `<form class="stack" id="workForm">
    <label class="field">Название *<input class="input" name="title" required maxlength="140" value="${esc(w.title)}" placeholder="Как называется ваша история?"></label>
    <label class="field">Подзаголовок<input class="input" name="subtitle" maxlength="160" value="${esc(w.subtitle||'')}" placeholder="Цикл, часть, уточнение…"></label>
    <div class="grid two">${w.legacyUrl?`<input type="hidden" name="type" value="${esc(w.type)}">`:`<label class="field">Тип *<select name="type">${window.CHERNILA_SEED.types.map(t=>`<option value="${t.id}" ${w.type===t.id?'selected':''}>${t.label}</option>`).join('')}</select></label>`}
    <label class="field">Жанр * · выберите или впишите свой<input class="input" name="genre" list="workGenres" required maxlength="60" value="${esc(w.genre)}" placeholder="Например: философское фэнтези"><datalist id="workGenres">${[...new Set([...window.CHERNILA_SEED.genres,...publicWorks().map(w=>w.genre)])].map(g=>`<option value="${esc(g)}"></option>`).join('')}</datalist></label></div>
    <div class="grid two"><label class="field">Статус<select name="status">${Object.entries(STATUS_LABEL).map(([k,v])=>`<option value="${k}" ${w.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="field">Возрастной рейтинг<select name="ageRating">${['0+','6+','12+','16+','18+'].map(r=>`<option ${w.ageRating===r?'selected':''}>${r}</option>`).join('')}</select></label></div>
    <label class="field">Теги (через запятую)<input class="input" name="tags" value="${esc((w.tags||[]).join(', '))}" placeholder="память, город, первая любовь"></label>
    <label class="field">Аннотация *<textarea class="input" name="description" rows="5" required maxlength="2000" placeholder="Пара предложений, после которых невозможно не открыть первую главу.">${esc(w.description)}</textarea></label>
    <div><span class="small" style="font-weight:800;color:var(--muted)">Обложка: градиент и символ</span>
      <div class="cover-picker" id="coverPick" style="margin:10px 0">${COVERS.map(([f,t])=>`<button type="button" class="swatch ${w.cover?.from===f?'on':''}" data-from="${f}" data-to="${t}" style="background:linear-gradient(140deg,${f},${t})" aria-label="Градиент обложки"></button>`).join('')}</div>
      <div class="chiprow" id="symbolPick">${SYMBOLS.map(s=>`<button type="button" class="chipbtn ${w.cover?.symbol===s?'on':''}" data-s="${s}" style="font-size:1.1rem">${s}</button>`).join('')}</div></div>
    <div id="coverStudio"></div>
    ${!w.legacyUrl?'<details class="author-design"><summary>Авторское оформление · конструктор страниц</summary><p class="small muted">Стиль применяется ко всем главам. Посетитель сможет выбрать личную тему чтения.</p><div id="workDesigner"></div></details>':''}
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">${w.id?'Сохранить произведение':'Создать и перейти к главам →'}</button><a class="btn ghost" href="#/studio/works">Отмена</a></div>
  </form>`;
}
function bindWorkForm(w){
  const workId=w?.id||Store.uid();let designChanged=false;const designer=$('#workDesigner')?InkStory.mount($('#workDesigner'),w?.readerStyle,()=>designChanged=true):null;
  let cover={...(w?w.cover:{from:COVERS[0][0],to:COVERS[0][1],symbol:'✦'})};
  const art=InkCover.mount($('#coverStudio'),cover,c=>cover=c,Store.currentUser().id+':'+workId);disposePage=()=>{art.dispose();designer?.dispose();};
  $('#coverPick').addEventListener('click',e=>{const b=e.target.closest('.swatch');if(!b)return;cover.from=b.dataset.from;cover.to=b.dataset.to;art.set(cover);$$('.swatch').forEach(x=>x.classList.toggle('on',x===b))});
  $('#symbolPick').addEventListener('click',e=>{const b=e.target.closest('[data-s]');if(!b)return;cover.symbol=b.dataset.s;art.set(cover);$$('#symbolPick .chipbtn').forEach(x=>x.classList.toggle('on',x===b))});
  $('#workForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const u=me();
    const data={...(designer&&(designChanged||Store.mode==='local'||Store.studioReady)?{readerStyle:designer.read()}:{}),id:workId,authorId:u.id,title:f.get('title').trim(),subtitle:f.get('subtitle').trim(),type:f.get('type'),genre:f.get('genre'),status:f.get('status'),ageRating:f.get('ageRating'),
      tags:f.get('tags').split(',').map(t=>t.trim()).filter(Boolean),description:f.get('description').trim(),cover,legacyUrl:w?w.legacyUrl:null,featured:w?!!w.featured:false,views:w?w.views||0:0,createdAt:w?w.createdAt:Store.today()};
    const btn=e.target.querySelector('[type=submit]');btn.disabled=true;try{if(designer?.busy())throw new Error('Дождитесь завершения импорта шрифта или разделителя.');data.cover=await art.read();await Store.upsertWork(data); toast(w?(u.role==='admin'?'Произведение сохранено':'Карточка сохранена. Статус публикации указан в мастерской.'):'Произведение создано! Теперь добавьте первую главу ✒'); location.hash='#/studio/work/'+data.id;}catch(err){toast(err.message,true);}finally{btn.disabled=false;}});
}
function pageStudioNew(){ if(!guardStudio()) return; setNav('studio');
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('new')}<div><div class="kicker">Студия автора</div><h1 style="font-size:2.3rem;margin:10px 0 8px">Новое произведение</h1>
  <p class="muted">Рассказ, роман, цикл стихов, эссе — всё начинается с этой карточки. Главы добавите следующим шагом.</p><div class="panel" style="margin-top:20px">${workFormHTML(null)}</div></div></div></div>`; bindWorkForm(null); }
document.addEventListener('click',async e=>{const b=e.target.closest('[data-submit-review]');if(!b||b.disabled)return;b.disabled=true;try{await Store.submitForReview(b.dataset.submitReview);toast(me()?.role==='admin'?'Опубликовано':'Произведение отправлено на проверку');route();}catch(err){toast(err.message,true);b.disabled=false;}});
function moderationPanel(w){return `<section class="panel publication-state" data-publication-state="${w.moderationStatus||'draft'}"><div class="action-row"><span class="pill gold">${esc(REVIEW_LABEL[w.moderationStatus]||(w.legacyUrl?'Опубликовано':'Черновик'))}</span>${!w.legacyUrl?`<button class="btn sm" type="button" data-submit-review="${esc(w.id)}" ${w.moderationStatus==='pending'?'disabled':''}>${me()?.role==='admin'?'Опубликовать':'Отправить на проверку'}</button>`:''}</div>${w.moderationNote?`<p><b>Комментарий модератора:</b> ${esc(w.moderationNote)}</p>`:''}<p class="small muted">${me()?.role==='admin'?'Ваши произведения публикуются без ожидания проверки.':'Публикацию проверяет администратор. Отправка главы ставит всё произведение в очередь. Изменение карточки или опубликованного текста снимает произведение с публикации до нового одобрения. Обычные черновики глав читателям не видны.'}</p>${Store.mode==='supabase'&&!Store.moderationReady?'<p class="small">Проверка ещё не подключена к базе: нужна SQL-миграция. Сохранение новых историй заблокировано.</p>':''}</section>`;}
function pageStudioWork(id){
  if(!guardStudio()) return; const w=work(id); if(!w||w.authorId!==me().id){toast('Можно редактировать только свои произведения',true);location.hash='#/studio/works';return}
  setNav('studio'); const chs=chaptersOf(id,true);
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('works')}<div>
    <div class="kicker">Редактирование</div><h1 style="font-size:2.2rem;margin:10px 0">«${esc(w.title)}»</h1>
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:20px"><a class="btn ghost sm" href="#/work/${id}">Страница для читателей →</a>${w.legacyUrl?'':`<a class="btn sm" href="#/studio/chapter/${id}/new">+ Новая глава</a>`}</div>
    ${moderationPanel(w)}${storyAccessSettings(w)}<div class="panel">${w.legacyUrl?`<h2>Исходный авторский текст</h2><p class="muted">Полный текст хранится в файле <code>${esc(w.legacyUrl)}</code>. Здесь можно менять карточку; сам текст редактируется в исходнике, чтобы не создавать вторую несогласованную версию.</p><a class="btn ghost sm" href="${esc(w.legacyUrl)}">Открыть полный текст ↗</a>`:`<h2 style="margin-bottom:14px">Главы и черновики · ${chs.length}</h2>`}
    ${!w.legacyUrl&&chs.length?chs.map((c,i)=>`<div class="chapter-row"><span class="num">${String(i+1).padStart(2,'0')}</span><span style="flex:1"><b style="font-family:var(--serif)">${esc(c.title)}</b> ${c.status==='draft'?'<span class="pill gold">черновик</span>':`<span class="pill">${Store.isWorkPublic(w)?'опубликовано':w.moderationStatus==='pending'?'на проверке':'подготовлена к публикации'}</span>`}<br><span class="small muted">${fmt(words(c.body))} слов · ${esc(c.createdAt||'')}</span></span>
      <button class="btn dark sm" data-action="ch-up" data-id="${c.id}" ${i===0?'disabled':''}>↑</button><button class="btn dark sm" data-action="ch-down" data-id="${c.id}" ${i===chs.length-1?'disabled':''}>↓</button>
      <a class="btn dark sm" href="#/studio/chapter/${id}/${c.id}">✎ Редактировать</a><button class="btn danger sm" data-action="del-chapter" data-id="${c.id}">✕</button></div>`).join(''):w.legacyUrl?'':'<p class="muted">Глав пока нет. Напишите первую — читатели уже заждались.</p>'}
    </div>
    <div class="panel" style="margin-top:20px"><h2 style="margin-bottom:14px">Карточка произведения</h2>${workFormHTML(w)}</div>
  </div></div></div>`; bindWorkForm(w);bindStoryAccess(w); }
function pageStudioChapter(wid,cid){
  if(!guardStudio())return;const w=work(wid);if(!w||w.authorId!==me().id)return page404();
  if(w.legacyUrl){location.hash='#/studio/work/'+wid;return;}
  const c=cid==='new'?null:S.chapters.find(x=>x.id===cid&&x.workId===wid);if(cid!=='new'&&!c)return page404();const draftId=c?.id||Store.uid();setNav('studio');
  $('#app').innerHTML='<div class="wrap workshop-wrap" id="writerRoot"></div>';
  disposePage=InkWriter.mount({host:$('#writerRoot'),work:w,chapter:c,chapterId:cid,userId:me().id,notify:toast,requiresReview:me().role!=='admin',saveStyle:readerStyle=>Store.upsertWork({...w,readerStyle}),
    save:patch=>Store.upsertChapter({id:draftId,workId:wid,...patch,order:c?.order||Math.max(0,...chaptersOf(wid,true).map(x=>x.order))+1,createdAt:c?.createdAt||Store.today()}),
    onSaved:status=>{toast(status==='published'?(Store.isWorkPublic(work(wid))?'Глава опубликована':'Глава отправлена на проверку. До одобрения произведение скрыто от читателей.'):'Черновик сохранён в аккаунте');location.hash='#/studio/work/'+wid;}});
}
function socialArrow(){return '<svg class="social-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>';}
function profileSocials(c){
  const links=[...(c.website?[{network:'website',url:c.website,label:'Личный сайт'}]:[]),...c.socialLinks.map(link=>({...link,label:InkProfileTools.networks.find(n=>n.id===link.network).label})),...(c.telegram&&!c.socialLinks.some(link=>link.url===c.telegram)?[{network:'website',url:c.telegram,label:'Ещё одна ссылка'}]:[])];
  return links.length?`<section class="profile-socials" aria-label="Публичные ссылки автора"><div class="profile-socials-label">На других площадках</div><div class="profile-social-list">${links.map(link=>`<a class="profile-social-link" data-network="${link.network}" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(link.label)} — открыть в новой вкладке"><span class="social-network-icon">${InkProfileTools.socialIcon(link.network)}</span><span>${esc(link.label)}</span><span class="social-external">${socialArrow()}</span></a>`).join('')}</div></section>`:'';
}
function profilePreview(u,media={}){const c={...Store.cleanCustomization(u.customization||{}),...media};return `<div class="profile-preview ${c.layout}" style="${profileStyle(u)}"><div class="profile-banner">${c.bannerUrl?`<img src="${esc(c.bannerUrl)}" alt="" referrerpolicy="no-referrer">`:''}</div><div class="profile-preview-body">${ava({...u,customization:c},'lg')}<div><h2>${esc(u.displayName)}</h2><p class="muted">@${esc(u.username)}${c.pronouns?' · '+esc(c.pronouns):''}${c.showLocation&&u.location?' · '+esc(u.location):''}</p><div class="chiprow">${c.genres.map(g=>`<span class="pill">${esc(g)}</span>`).join('')}</div></div></div>${profileSocials(c)}</div>`;}
function pageProfile(){
  if(!guardStudio())return;setNav('studio');const u=me(),c=Store.cleanCustomization(u.customization||{});
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('profile')}<div><div class="kicker">Настройки автора</div><h1>Ваш профиль</h1><p class="muted">Изменяйте оформление и сразу смотрите результат. Значки и права доступа настраивает только администратор.</p><div id="profilePreview">${profilePreview(u)}</div>
  <form id="profileForm" class="stack panel" style="margin-top:24px">
  <fieldset><legend>О вас</legend><div class="grid two"><label class="field">Логин (юзернейм)<input class="input" readonly value="${esc(u.username)}"></label><label class="field">Имя / псевдоним *<input class="input" name="displayName" required maxlength="80" value="${esc(u.displayName)}"></label></div>
  <label class="field">Как к вам обращаться / местоимения<input class="input" name="pronouns" maxlength="60" value="${esc(c.pronouns)}"></label><label class="field">Город<input class="input" name="location" maxlength="80" value="${esc(u.location||'')}"></label><label class="field">О себе<textarea class="input" name="bio" maxlength="1200" rows="5">${esc(u.bio||'')}</textarea></label></fieldset>
  <fieldset><legend>Оформление</legend><p class="small muted">Выберите свои изображения с устройства, настройте кадр и сохраните профиль. ${Store.mode==='local'?'Локальный режим: изображения сохраняются только в этом браузере.':'Файлы загружаются в хранилище профилей Supabase.'}</p><div id="avatarUrlPicker"></div><div id="bannerUrlPicker"></div></fieldset>
  <fieldset><legend>Ссылки и интересы</legend><label class="field">Личный сайт<input class="input" name="website" type="url" maxlength="1000" value="${esc(c.website)}" placeholder="https://…"></label><div class="social-picker"><div class="connections-intro"><span class="connections-eyebrow">Ваши площадки</span><h3>Подключённые аккаунты</h3><p class="muted">Один профиль — ваши любимые сервисы. Подтвердите аккаунт через официальную авторизацию.</p><span class="connections-privacy">Публикуются только ссылки, которые вы добавите сами</span></div><div id="socialConnectionSummary" class="connection-summary" role="status"></div><div id="socialConnections" class="social-connections" aria-label="Подключение сервисов"></div><div class="connections-footer"><button class="btn ghost sm" id="reloadConnections" type="button" ${Store.mode==='local'?'disabled':''}>↻ Проверить подключения</button><p id="socialStatus" class="small muted" role="status"></p></div><details class="public-social-links"><summary><span><b>Публичные ссылки на соцсети</b><small>Выберите, где читатели смогут вас найти</small></span><span class="social-details-plus" aria-hidden="true">+</span></summary><p class="small muted">Здесь можно добавить публичную ссылку без авторизации. Подтверждённая привязка Telegram доступна в карточке выше; ВКонтакте, YouTube и Instagram пока подключаются только ссылками. Ссылку на подключённый аккаунт также можно разместить публично.</p><div id="socialLinksList"></div><div class="grid two"><label class="field">Социальная сеть<select id="socialNetwork">${InkProfileTools.networks.map(n=>`<option value="${n.id}">${esc(n.label)}</option>`).join('')}</select></label><label class="field">Имя пользователя или ссылка<input class="input" id="socialHandle" maxlength="1000" placeholder="@username или https://…"></label></div><button class="btn ghost sm" type="button" id="addSocialLink">Добавить / обновить ссылку</button><p class="small muted" id="socialNetworkHint"></p>${c.telegram?`<p class="small muted">Ранее сохранённая ссылка: <a href="${esc(c.telegram)}" target="_blank" rel="noopener noreferrer">Открыть ↗</a></p>`:''}</details></div><label class="field">Жанры, которые вы пишете (через запятую, до 8)<input class="input" name="genres" maxlength="480" value="${esc(c.genres.join(', '))}"></label></fieldset>
  <fieldset><legend>Публичная страница</legend><label><input type="checkbox" name="showLocation" ${c.showLocation?'checked':''}> Показывать город</label><br><label><input type="checkbox" name="showStats" ${c.showStats?'checked':''}> Показывать блок статистики</label><p class="small muted">Счётчики отдельных произведений остаются публичными.</p></fieldset>
  <div class="action-row"><button class="btn" type="submit">Сохранить профиль</button><a class="btn ghost" href="#/author/${u.id}">Посмотреть страницу</a><button class="btn dark" type="button" id="resetAppearance">Сбросить изображения</button></div><p class="small muted" id="profileFeedback" role="status"></p></form>
  <div id="personalThemeSettings" style="margin-top:20px"></div><div class="panel" style="margin-top:20px"><h3>Значки и достижения</h3><p class="muted">Выдаются и отзываются администратором платформы.</p><div class="chiprow">${(u.badges||[]).map(b=>`<span class="pill gold">✦ ${esc(b)}</span>`).join('')||'Пока нет значков'}</div>${u.role==='admin'?'<p><a class="btn ghost" href="#/admin">♛ Панель администратора</a></p>':''}</div></div></div></div>`;
  const form=$('#profileForm'),networks=InkProfileTools.networks;
  let socials=[...(c.socialLinks||[])],disposed=false,dirty=false,saving=false,identityList=[],identityReady=Store.mode==='local',previewFrame=0;
  const media={};
  const read=()=>{const f=new FormData(form);return {displayName:f.get('displayName').trim(),bio:f.get('bio').trim(),location:f.get('location').trim(),customization:Store.cleanCustomization({...c,...Object.fromEntries(f),avatarUrl:c.avatarUrl,bannerUrl:c.bannerUrl,socialLinks:socials,genres:f.get('genres').split(',').map(x=>x.trim()).filter(Boolean),showStats:f.has('showStats'),showLocation:f.has('showLocation')})};};
  const preview=()=>{dirty=true;cancelAnimationFrame(previewFrame);previewFrame=requestAnimationFrame(()=>{if(disposed)return;try{$('#profilePreview').innerHTML=profilePreview({...u,...read()},Object.fromEntries(Object.entries(media).map(([slot,control])=>[slot,control.preview()])));$('#profileFeedback').textContent='Предпросмотр · изменения ещё не сохранены.';}catch(err){$('#profileFeedback').textContent=err.message;}});};
  for(const slot of ['avatarUrl','bannerUrl'])media[slot]=InkProfileTools.mountMedia($('#'+slot+'Picker'),slot,c[slot],preview,msg=>toast(msg,true));
  const onProfileInput=e=>{if(!['socialNetwork','socialHandle'].includes(e.target.id))preview();};
  form.addEventListener('input',onProfileInput);form.addEventListener('change',onProfileInput);
  const renderSocials=()=>{$('#socialLinksList').innerHTML=socials.map(link=>`<div class="social-link-row" data-network="${link.network}"><a class="social-link-identity" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span class="social-network-icon">${InkProfileTools.socialIcon(link.network)}</span><div><b>${esc(networks.find(n=>n.id===link.network).label)}</b><span>${esc(link.url)}</span></div></a><div class="action-row"><button class="btn ghost sm" type="button" data-edit-social="${esc(link.network)}">Изменить</button><button class="btn ghost sm" type="button" data-remove-social="${esc(link.network)}">Убрать</button></div></div>`).join('')||'<p class="muted">Вы пока не добавили публичные ссылки.</p>';};
  renderSocials();
  $('#socialLinksList').addEventListener('click',e=>{const remove=e.target.closest('[data-remove-social]'),edit=e.target.closest('[data-edit-social]');if(edit){const link=socials.find(x=>x.network===edit.dataset.editSocial);$('#socialNetwork').value=link.network;$('#socialHandle').value=link.url;refreshNetwork();$('#socialHandle').focus();return;}if(!remove)return;socials=socials.filter(x=>x.network!==remove.dataset.removeSocial);renderSocials();renderConnections();preview();});
  $('#addSocialLink').addEventListener('click',()=>{try{const link=InkProfileTools.socialLink($('#socialNetwork').value,$('#socialHandle').value);socials=InkProfileTools.cleanSocialLinks([...socials.filter(x=>x.network!==link.network),link]);$('#socialHandle').value='';renderSocials();renderConnections();preview();}catch(err){toast(err.message,true);$('#socialStatus').textContent=err.message;}});
  const refreshNetwork=()=>{const n=networks.find(n=>n.id===$('#socialNetwork').value);$('#socialHandle').placeholder=n.hint+' или https://…';$('#socialNetworkHint').textContent='Это публичная ссылка на вашу страницу, не авторизация. Для подтверждённой привязки используйте карточки выше.';};
  $('#socialNetwork').addEventListener('change',refreshNetwork);refreshNetwork();
  let providerList=[],providerReady=Store.mode==='local',oauthBusy=false,loadingConnections=false,loadRevision=0,otherSocialsOpen=false;
  const renderConnections=()=>{$('#socialConnectionSummary').textContent=loadingConnections?'Проверяем подключения…':!identityReady||!providerReady?'Статус подключений не получен':Store.mode==='local'?'Локальный профиль · доступны публичные ссылки':networks.filter(n=>n.provider&&identityList.some(i=>InkProfileTools.providers(n).includes(i.provider))).length+' подключено · '+networks.filter(n=>n.provider&&InkProfileTools.providers(n).some(p=>providerList.includes(p))).length+' встроенных провайдеров включено';$('#socialConnections').setAttribute('aria-busy',String(loadingConnections||oauthBusy));const cards=networks.filter(n=>n.provider).map(n=>{
    const custom=n.provider==='custom:telegram',identity=identityReady?identityList.find(i=>InkProfileTools.providers(n).includes(i.provider)):null,enabled=providerReady&&(custom||InkProfileTools.providers(n).some(p=>providerList.includes(p))),link=identity?InkProfileTools.identityLink(n,identity):null,added=socials.some(x=>x.network===n.id);
    const state=identity?'Подключён':Store.mode==='local'?'Только в общей базе':loadingConnections?'Проверяем…':!identityReady||!providerReady?'Не удалось проверить':custom?'Проверяется при подключении':enabled?'Готов к подключению':'Не настроено на сервере';
    const hint=identity?identity.identity_data?.user_name||identity.identity_data?.preferred_username||identity.identity_data?.name||'Аккаунт подтверждён провайдером':Store.mode==='local'?'В локальном режиме можно добавить публичную ссылку ниже.':loadingConnections?'Загружаем настройки авторизации…':!identityReady||!providerReady?'Нажмите «Проверить подключения», чтобы повторить запрос.':custom?'Подтвердите, что Telegram-аккаунт принадлежит вам.':enabled?'Безопасная авторизация на стороне сервиса. Пароль вводится только там.':'OAuth для этого сервиса пока не настроен. Публичную ссылку можно добавить ниже.';
    const html=`<article class="social-account-card" data-network="${n.id}" data-state="${identity?'connected':loadingConnections?'loading':custom&&providerReady?'unverified':enabled?'ready':'unavailable'}"><div class="social-account-heading"><span class="social-network-icon">${InkProfileTools.socialIcon(n.id)}</span><div><h4>${esc(n.label)}</h4><span class="connection-status ${identity?'connected-label':''}"><span class="connection-status-mark" aria-hidden="true">${identity?'✓':''}</span>${state}</span></div></div><p class="small muted">${esc(hint)}</p>${custom&&!identity?'<p id="telegramConnectionPrivacy" class="small muted" role="note"><strong>Подключение необязательно.</strong> Получим идентификатор и основные данные профиля Telegram. При авторизации обрабатывается IP-адрес подключения. Доступ к переписке и номеру телефона не запрашиваем. Если не хотите подключать аккаунт, можно просто добавить публичную ссылку.</p>':''}${identity&&identityList.length<2?'<p class="small muted">Это последний способ входа. Сначала подключите другой аккаунт.</p>':''}<div class="action-row">${identity?`<button class="btn ghost sm" type="button" data-unlink-social="${esc(identity.identity_id||identity.id)}" ${oauthBusy||saving||loadingConnections||identityList.length<2?'disabled':''}>Отключить</button>${link&&!added?`<button class="btn sm" type="button" data-publish-social="${n.id}" ${oauthBusy||saving?'disabled':''}>Добавить ссылку в профиль</button>`:added?'<span class="small muted">Ссылка добавлена в профиль</span>':'<span class="small muted">Публичную ссылку можно указать ниже</span>'}`:`<button class="btn sm" type="button" data-connect-social="${n.id}" ${oauthBusy||saving||loadingConnections||!identityReady||!providerReady||!enabled||Store.mode==='local'?'disabled':''} aria-label="Подключить ${esc(n.label)}" ${custom?'aria-describedby="telegramConnectionPrivacy"':''}>${custom?'Проверить и подключить':'Подключить'} ${socialArrow()}</button>`}</div></article>`;
    return {n,html,unavailable:!identity&&!enabled&&identityReady&&providerReady&&!loadingConnections};
  });
    const active=cards.filter(card=>!card.unavailable),other=cards.filter(card=>card.unavailable);otherSocialsOpen=$('#socialConnections .other-socials')?.open??otherSocialsOpen;
    $('#socialConnections').innerHTML=`${active.length?`<div class="social-account-grid">${active.map(card=>card.html).join('')}</div>`:'<p class="connections-empty muted small">Пока нет доступных подключений. Публичные ссылки можно добавить ниже.</p>'}${other.length?`<details class="other-socials" ${otherSocialsOpen?'open':''}><summary><span class="other-socials-icons" aria-hidden="true">${other.slice(0,3).map(card=>`<span data-network="${card.n.id}">${InkProfileTools.socialIcon(card.n.id)}</span>`).join('')}</span><span class="other-socials-title">Другие сервисы <small>${other.length} · пока недоступны</small></span><span class="social-details-plus" aria-hidden="true">+</span></summary><div class="social-account-grid">${other.map(card=>card.html).join('')}</div></details>`:''}`;
  };
  const loadIdentities=async()=>{const revision=++loadRevision;if(Store.mode==='local'){renderConnections();return;}loadingConnections=true;renderConnections();$('#reloadConnections').disabled=true;
    const [identities,providers]=await Promise.allSettled([Store.socialIdentities(),Store.socialProviders()]);if(disposed||revision!==loadRevision)return;
    identityReady=identities.status==='fulfilled';providerReady=providers.status==='fulfilled';identityList=identityReady?identities.value:[];providerList=providerReady?providers.value:[];loadingConnections=false;renderConnections();$('#reloadConnections').disabled=false;
    $('#socialStatus').textContent=!identityReady?'Не удалось проверить аккаунты: '+identities.reason.message:!providerReady?'Не удалось проверить провайдеров: '+providers.reason.message:'Статус получен из Supabase Auth. Публичные ссылки сами по себе не подтверждают аккаунт.';
  };
  $('#reloadConnections').addEventListener('click',loadIdentities);loadIdentities();
  $('#socialConnections').addEventListener('click',async e=>{
    const b=e.target.closest('[data-connect-social],[data-unlink-social],[data-publish-social]');if(!b||b.disabled||oauthBusy||saving)return;
    if(b.dataset.publishSocial){const n=networks.find(n=>n.id===b.dataset.publishSocial),identity=identityList.find(i=>InkProfileTools.providers(n).includes(i.provider)),link=InkProfileTools.identityLink(n,identity);if(!link)return;socials=InkProfileTools.cleanSocialLinks([...socials.filter(x=>x.network!==n.id),link]);renderSocials();renderConnections();preview();toast('Ссылка добавлена. Сохраните профиль.');return;}
    oauthBusy=true;renderConnections();try{
      if(b.dataset.unlinkSocial){if(!confirm('Отключить этот аккаунт? Публичная ссылка останется, её можно удалить отдельно.'))return;await Store.unlinkSocial(b.dataset.unlinkSocial);await loadIdentities();toast('Аккаунт отключён');}
      else{if(dirty){if(!confirm('Сохранить изменения профиля перед авторизацией?'))return;await saveProfile();}await Store.beginSocialLink(b.dataset.connectSocial);}
    }catch(err){if(!disposed){toast(err.message,true);$('#socialStatus').textContent=err.message;}}finally{oauthBusy=false;if(!disposed)renderConnections();}
  });
  $('#resetAppearance').addEventListener('click',()=>{Object.values(media).forEach(m=>m.remove());preview();});
  const saveProfile=async()=>{
    if(saving)throw new Error('Сохранение уже выполняется.');
    if(!form.reportValidity())throw new Error('Заполните обязательные поля профиля.');
    if(Object.values(media).some(m=>m.busy))throw new Error('Подождите обработки изображений.');
    const patch=read(),old={avatarUrl:c.avatarUrl,bannerUrl:c.bannerUrl},uploaded=[];saving=true;cancelAnimationFrame(previewFrame);$('#profileFeedback').textContent='Сохраняем профиль и изображения…';
    const elements=[...form.elements],states=elements.map(el=>el.disabled);elements.forEach(el=>el.disabled=true);
    try{
      for(const [slot,control] of Object.entries(media)){
        if(control.removed)patch.customization[slot]='';
        else if(control.dirty){const blob=await control.blob();if(blob){if(Store.currentUser()?.id!==u.id)throw new Error('Аккаунт изменился. Откройте профиль заново.');const url=await Store.uploadProfileImage(blob,slot);uploaded.push(url);patch.customization[slot]=url;}}
      }
      if(disposed||Store.currentUser()?.id!==u.id)throw new Error('Профиль закрыт или аккаунт изменился. Повторите сохранение.');
      await Store.updateProfile(patch);Object.assign(c,patch.customization);dirty=false;
      for(const [slot,control] of Object.entries(media)){control.committed(c[slot]);if(old[slot]&&old[slot]!==c[slot])Store.removeProfileImage(old[slot]).catch(()=>{});}
      if(!disposed){$('#profilePreview').innerHTML=profilePreview(u);renderUserChip();$('#profileFeedback').textContent='Профиль сохранён.';toast('Профиль сохранён');}
    }catch(err){await Promise.all(uploaded.map(url=>Store.removeProfileImage(url).catch(()=>{})));throw err;}
    finally{saving=false;elements.forEach((el,i)=>el.disabled=states[i]);if(!disposed)renderConnections();}
  };
  form.addEventListener('submit',async e=>{e.preventDefault();try{await saveProfile();}catch(err){if(!disposed)$('#profileFeedback').textContent='Не сохранено: '+err.message;toast(err.message,true);}});
  try{const result=JSON.parse(sessionStorage.getItem('chernila_social_result')||'null');if(result){$('#socialStatus').textContent=result.message;toast(result.message,!result.ok);sessionStorage.removeItem('chernila_social_result');}}catch(_){}
  const theme=InkTheme.mount($('#personalThemeSettings'),u.id,toast);
  disposePage=()=>{disposed=true;cancelAnimationFrame(previewFrame);theme.dispose();Object.values(media).forEach(m=>m.dispose());};

}
function reviewQueueHTML(){
  const queue=S.works.filter(w=>w.moderationStatus==='pending').sort((a,b)=>(a.submittedAt||'').localeCompare(b.submittedAt||''));
  return `<section class="panel review-queue"><div class="sec-head"><div><div class="kicker">Ручная премодерация</div><h2>На проверке · ${queue.length}</h2></div><button class="btn ghost sm" type="button" id="refreshReviewQueue">Обновить</button></div>${Store.mode==='supabase'&&!Store.moderationReady?'<p class="moderation-warning">Серверная премодерация ещё не включена. Примените миграцию 20261102000200_manual_publication_review.sql. До этого нельзя считать прямые запросы защищёнными.</p>':''}<p class="small muted">Откройте заявку и прочитайте все подготовленные главы. Черновики не публикуются. Если автор изменит текст после загрузки заявки, решение будет отклонено — потребуется обновить очередь.</p>${Store.publicationReadError?'<p class="moderation-warning">Не удалось загрузить очередь. Нажмите «Обновить»; пустой список не означает отсутствие заявок.</p>':''}${queue.map(w=>`<details class="review-request" data-review-request="${esc(w.id)}"><summary><span><b>${esc(w.title)}</b><small>${esc(author(w.authorId).displayName)} · @${esc(author(w.authorId).username)} · версия ${w.moderationRevision||1}</small></span><span class="pill">Проверить</span></summary><div class="review-request-body"><p>${esc(w.description)}</p><p class="small muted">${esc(w.genre)} · ${esc(w.ageRating||'12+')}</p>${chaptersOf(w.id).map(c=>`<section class="review-chapter"><h3>${esc(c.title)}</h3><div class="reader-text" data-review-style="${esc(w.id)}">${renderText(c.body,w.type==='poetry')}</div></section>`).join('')||'<p class="muted">Нет подготовленных глав. Одобрение недоступно.</p>'}<form class="review-decision stack" data-review-work="${esc(w.id)}" data-revision="${w.moderationRevision||1}"><label class="field">Причина возврата на доработку (обязательна при возврате)<textarea class="input" name="note" rows="3" maxlength="2000"></textarea></label><div class="action-row"><button class="btn" name="decision" value="approved" ${!chaptersOf(w.id).length?'disabled':''}>Одобрить публикацию</button><button class="btn ghost" name="decision" value="rejected">Вернуть на доработку</button></div><p class="small muted" role="status"></p></form></div></details>`).join('')||'<div class="empty">В очереди нет новых заявок.</div>'}</section>`;
}
function pageAdmin(){
  const u=me(); if(!u||u.role!=='admin'){toast('Доступ только для администратора платформы',true);location.hash='#/';return}
  setNav('studio');
  $('#app').innerHTML=`<div class="wrap"><div class="studio-grid">${studioSide('dash')}<div>
   <div class="kicker">Модерация платформы</div><h1 style="font-size:2.3rem;margin:10px 0">Панель администратора</h1>
   <div class="statgrid"><div class="statbox"><b>${S.authors.length}</b>авторов</div><div class="statbox"><b>${S.works.length}</b>произведений</div><div class="statbox"><b>${S.reviews.length}</b>рецензий</div><div class="statbox"><b>${S.comments.length}</b>комментариев</div><div class="statbox"><b>${Store.mode}</b>режим данных</div></div>
   ${reviewQueueHTML()}<section class="panel" style="margin-bottom:24px"><h2>♛ Значки и достижения</h2><p class="muted">Выберите автора, выдайте свой значок или отзовите существующий. Права администратора этим действием не выдаются.</p><form id="badgeForm" class="stack"><label class="field">Автор<select name="authorId">${S.authors.filter(a=>Store.mode!=='supabase'||a.id!=='cnizroman').map(a=>`<option value="${esc(a.id)}">${esc(a.displayName)} · @${esc(a.username)}</option>`).join('')}</select></label><div id="adminBadges" class="chiprow"></div><div class="grid two"><label class="field">Название значка<input class="input" name="badge" maxlength="80" required placeholder="Например: Мастер атмосферы"></label><label class="field">Готовые варианты<select id="badgePreset"><option value="">Свой значок</option><option>Выбор редакции</option><option>Мастер атмосферы</option><option>Завершённый цикл</option><option>Голос сообщества</option><option>Поэт платформы</option></select></label></div><button class="btn" type="submit">Выдать значок</button><p id="badgeFeedback" role="status" class="small muted"></p></form></section>
   <div class="panel"><h3 style="margin-bottom:12px">Рецензии</h3>${S.reviews.map(r=>`<div class="comment"><div style="flex:1"><b>${esc(r.name)}</b> · «${esc(work(r.workId)?.title||'удалено')}» · ★ ${reviewTotal(r)}/21 <span class="small muted">${esc(r.createdAt)}</span><p style="margin:4px 0 0">${esc(r.text)}</p></div><button class="btn danger sm" data-action="del-review" data-id="${r.id}">Удалить</button></div>`).join('')||'<p class="muted">Нет рецензий</p>'}</div>
   <div class="panel" style="margin-top:18px"><h3 style="margin-bottom:12px">Комментарии</h3>${S.comments.map(c=>`<div class="comment"><div style="flex:1"><b>${esc(c.name)}</b> · «${esc(work(c.workId)?.title||'удалено')}» <span class="small muted">${esc(c.createdAt)}</span><p style="margin:4px 0 0">${esc(c.text)}</p></div><button class="btn danger sm" data-action="del-comment" data-id="${c.id}">Удалить</button></div>`).join('')||'<p class="muted">Нет комментариев</p>'}</div>
   <div class="panel" style="margin-top:18px"><h3>Произведения платформы</h3><p class="small muted">Значок «Выбор платформы» ставит произведение на главную.</p>
   ${S.works.map(w=>`<div class="comment"><div style="flex:1"><b>${esc(w.title)}</b> <span class="small muted">${esc(author(w.authorId).displayName)} · 👁 ${fmt(w.views||0)}</span></div><button class="btn dark sm" data-action="feature" data-id="${w.id}">${w.featured?'✦ На главной':'На главную'}</button><button class="btn danger sm" data-action="del-work" data-id="${w.id}">Удалить</button></div>`).join('')}</div>
   <p class="small muted" style="margin-top:14px">Старая панель модерации рецензий книг Cnizroman сохранена: <a href="reviews-admin.html" style="color:var(--gold)">reviews-admin.html ↗</a></p>
  </div></div></div>`;
  $$('[data-review-style]').forEach(el=>InkStory.apply(el,work(el.dataset.reviewStyle)?.readerStyle));
  $('#refreshReviewQueue').addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{if(Store.mode==='supabase')await Store.pullFromSupabase({strict:true});route();}catch(err){toast(err.message,true);b.disabled=false;}});
  $$('.review-decision').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const buttons=$$('button',form),feedback=$('[role=status]',form);if(form.dataset.busy)return;form.dataset.busy='true';buttons.forEach(b=>b.disabled=true);try{await Store.reviewPublication(form.dataset.reviewWork,Number(form.dataset.revision),e.submitter?.value,form.elements.note.value);toast('Решение сохранено');route();}catch(err){feedback.textContent=err.message;delete form.dataset.busy;buttons.forEach(b=>b.disabled=false);}}));
  const form=$('#badgeForm'),select=form.elements.authorId;
  const renderBadges=()=>{const target=author(select.value);$('#adminBadges').innerHTML=(target.badges||[]).map(b=>`<button class="chipbtn" type="button" data-revoke-badge="${esc(b)}" title="Отозвать значок">${esc(b)} ×</button>`).join('')||'<span class="muted">У автора нет значков.</span>';};
  select.addEventListener('change',renderBadges);renderBadges();
  $('#badgePreset').addEventListener('change',e=>{form.elements.badge.value=e.target.value;});
  form.addEventListener('submit',async e=>{e.preventDefault();const target=author(select.value),btn=form.querySelector('[type=submit]');btn.disabled=true;try{await Store.setBadges(select.value,[...(target.badges||[]),form.elements.badge.value]);form.elements.badge.value='';renderBadges();$('#badgeFeedback').textContent='Значок выдан.';}catch(err){toast(err.message,true);}finally{btn.disabled=false;}});
  $('#adminBadges').addEventListener('click',async e=>{const btn=e.target.closest('[data-revoke-badge]');if(!btn||!confirm('Отозвать значок «'+btn.dataset.revokeBadge+'»?'))return;btn.disabled=true;try{await Store.setBadges(select.value,(author(select.value).badges||[]).filter(b=>b!==btn.dataset.revokeBadge));renderBadges();$('#badgeFeedback').textContent='Значок отозван.';}catch(err){toast(err.message,true);btn.disabled=false;}});

}

/* ---------- Авторизация ---------- */
function pageAuth(params){
  setNav(''); const mode=params.get('mode')==='signup'?'signup':'login'; if(me()){location.hash='#/studio';return}
  $('#app').innerHTML=`<div class="wrap"><div class="auth-box reveal"><div class="panel" style="padding:36px">
   <div style="text-align:center;font-family:var(--serif);font-size:2.6rem;color:var(--gold)">✒</div>
   <h1 style="text-align:center;font-size:2rem;margin:8px 0 6px">${mode==='signup'?'Стать автором «Чернил»':'С возвращением'}</h1>
   <p class="muted center">${mode==='signup'?'Создайте аккаунт и подтвердите email, чтобы открыть студию автора.':'Ваши черновики и полка скучали.'}</p>
   <div class="tabs" style="justify-content:center;margin-top:18px"><a href="#/auth" class="${mode==='login'?'on':''}">Вход</a><a href="#/auth?mode=signup" class="${mode==='signup'?'on':''}">Регистрация</a></div>
   <form class="stack" id="authForm">
   ${mode==='signup'?`<label class="field">Логин (юзернейм) *<input class="input" name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_]{3,30}" title="От 3 до 30 символов: латинские буквы, цифры и подчёркивание" placeholder="Например: roman_writer" autocomplete="username"><span class="small muted">3–30 символов: a–z, 0–9 и _. <b>После регистрации юзернейм изменить нельзя.</b></span></label>
   <label class="field">Имя или псевдоним *<input class="input" name="displayName" required placeholder="Имя или творческий псевдоним"></label>
   <label class="field">Email *<input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>`
   :`<label class="field">Логин (юзернейм)<input class="input" name="login" required autocomplete="username" placeholder="cnizroman"></label>`}
   <label class="field">Пароль *<input class="input" name="password" type="password" required minlength="6" placeholder="${mode==='signup'?'Придумайте пароль — от 6 символов':'Ваш пароль'}" autocomplete="${mode==='signup'?'new-password':'current-password'}"></label>
   <button class="btn" type="submit" style="justify-content:center">${mode==='signup'?'Создать аккаунт автора':'Войти'}</button>
   <p id="authFeedback" class="auth-feedback small" role="status" aria-live="polite" hidden></p>
   <p class="small muted center">${Store.mode==='supabase'?'Вход по юзернейму. Также можно ввести email аккаунта. Данные хранятся в Supabase Auth.':'Локальный режим: аккаунт создаётся в вашем браузере. Вход основателя: <b>cnizroman</b> / <b>demo1234</b>'}</p>
   </form></div></div></div>`;
  const form=$('#authForm'),btn=form.querySelector('button[type=submit]'),feedback=$('#authFeedback');let submitting=false;
  form.addEventListener('input',()=>{if(!submitting){btn.disabled=false;feedback.hidden=true;}});
  form.addEventListener('submit',async e=>{e.preventDefault();if(submitting||btn.disabled)return;const f=Object.fromEntries(new FormData(form));submitting=true;btn.disabled=true;feedback.hidden=true;let pending=false;
    try{
      const result=mode==='signup'?await Store.signup(f):await Store.login(f);
      if(result?.confirmationRequired){pending=true;form.elements.password.value='';feedback.dataset.kind='success';feedback.textContent='Подтвердите email, чтобы завершить регистрацию. Проверьте входящие и папку «Спам», затем войдите по своему логину. Если аккаунт уже есть, используйте вкладку «Вход».';feedback.hidden=false;return;}
      renderUserChip();toast('Добро пожаловать в «Чернила», '+me().displayName+' ✒');location.hash='#/studio';
    }catch(err){feedback.dataset.kind='error';feedback.textContent=err.message;feedback.hidden=false;}
    finally{submitting=false;btn.disabled=pending;}
  });
}


/* ---------- Запуск общей платформы: одно действие владельца ---------- */
function pageSetup(){
  setNav('');
  const cfg=window.CHERNILA_SUPABASE_CONFIG||{}; const ref=((cfg.url||'').match(/https:\/\/([^.]+)\./)||[])[1]||'';
  const sqlUrl='https://supabase.com/dashboard/project/'+ref+'/sql/new';
  const done=Store.mode==='supabase';
  $('#app').innerHTML=`<div class="wrap" style="max-width:860px;padding:52px 0 0"><div class="kicker">Запуск платформы</div>
  <h1 style="font-size:clamp(2rem,5vw,3rem);margin:14px 0">${done?'Общая база подключена ✦':'Подключение общей базы'}</h1>
  ${done?`<div class="panel"><p style="font-family:var(--body);font-size:1.2rem">«Чернила» работают на общей базе Supabase: аккаунты, произведения, рецензии и подписки теперь едины для всех посетителей.</p>
    <p class="muted">Админский аккаунт назначается владельцем через SQL Editor, а не по одному только юзернейму. Инструкция — в ADMIN_SETUP.md. После назначения аккаунту основателя подключатся его книги.</p>
    <div class="action-row"><button class="btn" id="copySql" type="button">Скопировать обновлённый SQL</button><a class="btn ghost" href="${sqlUrl}" target="_blank" rel="noopener">SQL Editor ↗</a><a class="btn ghost" href="ADMIN_SETUP.md" target="_blank" rel="noopener">Настройка владельца и юзернейма ↗</a><a class="btn ghost" href="SOCIAL_AND_MEDIA_SETUP.md" target="_blank" rel="noopener">Файлы профиля и OAuth ↗</a><a class="btn ghost" href="#/catalog">В каталог</a></div></div>`
  :`<p class="muted" style="font-family:var(--body);font-size:1.18rem">Сейчас платформа работает в локальном режиме: всё функционирует, но данные хранятся в браузере каждого посетителя по отдельности. Чтобы у всех авторов и читателей была <b style="color:var(--text)">одна общая платформа</b>, владельцу нужно выполнить один готовый SQL-файл в Supabase. После SQL подтвердите свой аккаунт основателя и подключите вход по юзернейму по инструкции ADMIN_SETUP.md.</p>
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
      <li>Профиль автора создаётся при регистрации. Email нужно подтвердить по письму, особенно перед подключением соцсетей.</li>
      <li>Владелец назначает свой подтверждённый аккаунт администратором через SQL Editor (ADMIN_SETUP.md). Другой пользователь не может выдать себе права или значки.</li>
      <li>Книги первого автора уже встроены в платформу: вносить их в базу вручную не нужно.</li>

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
  <h2 style="color:var(--text);margin:34px 0 10px">Для авторов</h2><p>Студия автора: произведения и главы, черновики с автосохранением, редактор с форматированием, генератор обложек, статистика просмотров, подписчики. Публикация бесплатна и мгновенна, права на тексты остаются у автора.</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Правила дома</h2><p>Пишите честно. Рецензируйте так, как хотели бы, чтобы рецензировали вас: с аргументами и без злобы. Плагиат и спам удаляются модерацией. Всё остальное — литература.</p>
  <h2 style="color:var(--text);margin:34px 0 10px">Техника</h2><p>Платформа — статичный сайт на GitHub Pages, данные и аккаунты — Supabase (Auth, Postgres, Row Level Security). Сейчас режим данных: <b style="color:var(--gold2)">${Store.mode==='supabase'?'Supabase — общая база всех читателей':'локальный (браузер)'}</b>.</p>
  </div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:26px">${Store.mode==='supabase'?'':'<a class="btn" href="#/setup">Запуск общей базы: одно действие владельца →</a>'}<a class="btn" href="#/catalog">В каталог</a><a class="btn ghost" href="#/auth?mode=signup">Стать автором</a></div></div>`;
}
function page404(){ setNav(''); $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:70px"><span class="big">✒</span><h2 style="font-size:2rem">Эта страница ещё не написана</h2><p>Возможно, автор её только придумывает. Вернитесь в каталог — там уже много готового.</p><a class="btn" href="#/catalog">В каталог</a> <a class="btn ghost" href="#/">На главную</a></div></div>`; }

/* ================= ДЕЙСТВИЯ ================= */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]'); if(!el) return; const act=el.dataset.action,id=el.dataset.id;
  try{
  if(act==='logout'){Store.logout();renderUserChip();toast('Вы вышли. Возвращайтесь — чернила не высохнут.');location.hash='#/';route();}
  if(act==='like'){ if(!needAuth())return; Store.toggleLike(id); route(); }
  if(act==='follow'){ if(!needAuth())return; Store.toggleFollow(id); toast(isFollowing(id)?'Подписка оформлена — новые главы появятся в вашей ленте':'Подписка отменена'); route(); }
  if(act==='share'){ const url=location.origin+location.pathname+'#/work/'+id; try{await navigator.clipboard.writeText(url);toast('Ссылка на произведение скопирована')}catch(_){toast(url)} }
  if(act==='del-comment'){ if(confirm('Удалить комментарий?')){Store.deleteComment(id);toast('Комментарий удалён');route();} }
  if(act==='del-review'){ if(confirm('Удалить рецензию?')){Store.deleteReview(id);toast('Рецензия удалена');route();} }
  if(act==='del-work'){ const w=work(id); if(confirm('Удалить произведение «'+(w?w.title:'')+'» и все его главы безвозвратно?')){await Store.deleteWork(id);toast('Произведение удалено'); location.hash='#/studio/works'; route();} }
  if(act==='del-chapter'){ if(confirm('Удалить главу?')){await Store.deleteChapter(id);toast('Глава удалена');route();} }
  if(act==='feature'){ const w=work(id); await Store.setFeatured(id,!w.featured); toast(w.featured?'Произведение — на главной':'Убрано с главной'); route(); }
  if(act==='reset'){ if(confirm('Сбросить все локальные данные платформы к стартовым?')) Store.resetDemo(); }
  if(act==='font'){ readerSettings.size=Math.min(28,Math.max(15,(readerSettings.size||20)+ +el.dataset.v)); localStorage.setItem('chernila_reader',JSON.stringify(readerSettings)); route(); }
  if(act==='theme'){ readerSettings.theme=el.dataset.v; localStorage.setItem('chernila_reader',JSON.stringify(readerSettings)); route(); }
  if(act==='ch-up'||act==='ch-down'){ const c=S.chapters.find(x=>x.id===id); const sibs=chaptersOf(c.workId,true); const i=sibs.indexOf(c); const j=act==='ch-up'?i-1:i+1; if(sibs[j]){const t=c.order;c.order=sibs[j].order;sibs[j].order=t;await Store.upsertChapter(c);await Store.upsertChapter(sibs[j]);route();} }
  }catch(err){toast(err.message,true);}
});
$('#burger')?.addEventListener?.('click',()=>{});
document.addEventListener('DOMContentLoaded',()=>{});

/* ================= РОУТЕР ================= */
function route(){
  if(disposePage){disposePage();disposePage=null;}
  InkTheme.activate(me()?.id);
  const hash=location.hash.replace(/^#\/?/,''); const [pathQ]=[hash]; const [path,qs]=pathQ.split('?'); const params=new URLSearchParams(qs||'');
  const seg=path.split('/').filter(Boolean); window.scrollTo({top:0}); $('#mainNav')?.classList.remove('open');
  try{
    if(!seg.length) pageHome();
    else if(seg[0]==='catalog') pageCatalog(params);
    else if(seg[0]==='group'&&seg[1]) pageGroup(decodeURIComponent(seg[1]));
    else if(seg[0]==='work'&&seg[1]) pageWork(decodeURIComponent(seg[1]));
    else if(seg[0]==='read'&&seg[1]&&seg[2]) pageRead(seg[1],seg[2]);
    else if(seg[0]==='author'&&seg[1]) pageAuthor(decodeURIComponent(seg[1]));
    else if(seg[0]==='authors') pageAuthors();
    else if(seg[0]==='feed') pageFeed();
    else if(seg[0]==='library') pageLibrary();
    else if(seg[0]==='auth') pageAuth(params);
    else if(seg[0]==='about') pageAbout();
    else if(seg[0]==='setup') pageSetup();
    else if(seg[0]==='profile') pageProfile();
    else if(seg[0]==='admin') pageAdmin();
    else if(seg[0]==='studio'&&!seg[1]) pageStudio();
    else if(seg[0]==='studio'&&seg[1]==='groups') pageStudioGroups(seg[2]?decodeURIComponent(seg[2]):null);
    else if(seg[0]==='studio'&&seg[1]==='works') pageStudioWorks();
    else if(seg[0]==='studio'&&seg[1]==='new') pageStudioNew();
    else if(seg[0]==='studio'&&seg[1]==='work'&&seg[2]) pageStudioWork(seg[2]);
    else if(seg[0]==='studio'&&seg[1]==='chapter'&&seg[2]&&seg[3]) pageStudioChapter(seg[2],seg[3]);
    else page404();
  }catch(err){ console.error(err); $('#app').innerHTML=`<div class="wrap"><div class="empty" style="margin-top:60px"><span class="big">✒</span>Чернила пролились: ${esc(err.message)}<br><br><a class="btn" href="#/">На главную</a></div></div>`; }
  InkFreedom.hydratePage().catch(()=>{});if(seg[0]==='read'&&seg[1]){const w=work(seg[1]);if(w&&Store.canReadStory(w))InkFreedom.hydrate(w).catch(()=>{});}
  $('#app').focus?.({preventScroll:true});
}
function bindLiveSearch(){
  const input=$('#topSearchInput'),box=document.createElement('div');box.id='searchSuggestions';box.className='search-suggestions';box.hidden=true;box.setAttribute('role','listbox');$('#topSearch').append(box);
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',box.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  let selected=-1;
  const close=()=>{box.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;};
  const update=()=>{
    const norm=t=>String(t).toLocaleLowerCase('ru').replace(/ё/g,'е').trim(),q=norm(input.value);selected=-1;
    if(!q){close();return;}
    const list=publicWorks().filter(w=>norm(w.title).includes(q)||groupsOf(w.id).some(g=>norm(g.title).includes(q)));
    box.innerHTML=shelfEntries(list).slice(0,6).map((e,i)=>{const g=e.group,w=e.work;return `<a id="searchOption${i}" role="option" aria-selected="false" href="${g?'#/group/'+encodeURIComponent(g.id):'#/work/'+w.id}"><b>${esc(g?g.title:w.title)}</b><span>${g?esc(GROUP_KINDS[g.kind])+' · '+e.matches.map(x=>esc(x.title)).join(', '):esc(author(w.authorId).displayName)}</span></a>`;}).join('')||'<p class="muted">Ничего не найдено</p>';
    box.hidden=false;input.setAttribute('aria-expanded','true');
  };
  input.addEventListener('input',update);input.addEventListener('focus',()=>{if(input.value)update();});
  input.addEventListener('keydown',e=>{const options=$$('[role=option]',box);if(e.key==='Escape'){close();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!options.length)return;selected=(selected+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((el,i)=>el.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant',options[selected].id);}if(e.key==='Enter'&&selected>=0&&options[selected]){e.preventDefault();location.hash=options[selected].getAttribute('href');close();}});
  box.addEventListener('click',close);document.addEventListener('click',e=>{if(!e.target.closest('#topSearch'))close();});
  $('#topSearch').addEventListener('focusout',e=>{if(!e.relatedTarget?.closest('#topSearch'))close();});
  addEventListener('hashchange',close);
}
async function boot(){
  await Store.init(); S=Store.state; renderUserChip(); route();
  addEventListener('hashchange',route);
  bindLiveSearch();
  $('#openSiteTheme').addEventListener('click',()=>{
    const d=$('#siteThemeDialog'),host=$('#quickThemes');host.innerHTML=InkTheme.presets.map(p=>`<button class="quick-theme" type="button" data-quick-theme="${p.id}"><span style="background:${p.background};color:${p.text};border-color:${p.accent}">Aa</span>${esc(p.label)}</button>`).join('');d.showModal();
  });
  $('#quickThemes').addEventListener('click',e=>{const b=e.target.closest('[data-quick-theme]');if(!b)return;try{InkTheme.save(InkTheme.presets.find(p=>p.id===b.dataset.quickTheme),me()?.id);toast('Тема сайта сохранена');}catch(err){toast('Не удалось сохранить тему: '+err.message,true);}});
  $('#closeSiteTheme').addEventListener('click',()=>$('#siteThemeDialog').close());
  $('#burger').addEventListener('click',()=>$('#mainNav').classList.toggle('open'));
  $('#topSearch').addEventListener('submit',e=>{e.preventDefault();$('#searchSuggestions').hidden=true;$('#topSearchInput').setAttribute('aria-expanded','false');const v=$('#topSearchInput').value.trim();location.hash='#/catalog'+(v?'?q='+encodeURIComponent(v):'');});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
