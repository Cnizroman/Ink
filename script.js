
/* =========================================================
   NOBODY CAME 2.1 — READER ENGINE
   Работает поверх существующих intro/book HTML без изменения текста.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- утилиты ---------- */
  // localStorage может быть недоступен (приватный режим, запрет cookies) — не падаем.
  const store = {
    get(k, d = null){ try{ const v = localStorage.getItem(k); return v === null ? d : v; }catch(e){ return d; } },
    set(k, v){ try{ localStorage.setItem(k, String(v)); }catch(e){} },
    remove(k){ try{ localStorage.removeItem(k); }catch(e){} }
  };

  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  let path = location.pathname.split('/').pop() || 'index.html';
  if(!/\.html$/i.test(path)) path += '.html';   // GitHub Pages отдаёт и /book1, и /book1.html

  const isHome = document.body.classList.contains('home-v2');
  const isReader = !isHome && path !== 'index.html' && path !== '404.html' && !!document.querySelector('main, #locked-data');

  const bookKey = path.replace('.html','') || 'home';
  const progressKey = `nobody-progress-${bookKey}`;
  const audioKey = `nobody-audio-${bookKey}`;
  const lastKey = 'nobody-last-page';

  const $ = (s, root=document) => root.querySelector(s);

  // Один общий requestAnimationFrame на все scroll-обработчики.
  const scrollHandlers = [];
  let scrollQueued = false;
  function onScroll(fn){
    scrollHandlers.push(fn);
  }
  function runScrollHandlers(){
    scrollQueued = false;
    scrollHandlers.forEach(fn => fn());
  }
  window.addEventListener('scroll', () => {
    if(scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(runScrollHandlers);
  }, {passive:true});
  window.addEventListener('resize', () => {
    if(scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(runScrollHandlers);
  });

  function saveLastPage(){
    if(path !== 'index.html') store.set(lastKey, path);
  }

  function getProgress(){
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    return max <= 0 ? 0 : Math.min(100, Math.max(0, (window.scrollY / max) * 100));
  }

  /* ---------- время чтения ---------- */
  const WPM = 200;
  function visibleMains(){
    return [...document.querySelectorAll('main')].filter(m => m.getClientRects().length);
  }
  function countWords(){
    let n = 0;
    visibleMains().forEach(m => {
      m.querySelectorAll('p').forEach(p => {
        if(p.closest('.review-system, .reader-hero-v2, .reader-note-v2, .audio-player')) return;
        n += (p.textContent.match(/[\p{L}\p{N}]+/gu) || []).length;
      });
    });
    return n;
  }
  function formatMinutes(min){
    if(min < 1) return '< 1 мин';
    if(min >= 60){
      const h = Math.floor(min / 60), m = Math.round(min % 60);
      return m ? `${h} ч ${m} мин` : `${h} ч`;
    }
    return `${Math.round(min)} мин`;
  }

  /* ---------- прогресс чтения и его восстановление ---------- */
  // Раньше прогресс перезаписывался нулём сразу при открытии страницы,
  // поэтому восстановление позиции фактически не работало. Теперь запись
  // начинается только после того, как позиция восстановлена (или пользователь
  // сам взял управление на себя).
  const readState = { restoring: false, words: 0, baseY: null, moved: false };
  function finishRestore(){ readState.restoring = false; readState.baseY = window.scrollY; }

  function setupProgress(){
    const bar = document.createElement('div');
    bar.className = 'reader-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    const saved = Number(store.get(progressKey, 0)) || 0;
    readState.restoring = saved >= 5 && !location.hash;
    readState.saved = saved;
    readState.baseY = readState.restoring ? null : window.scrollY;

    let saveTimer = null;
    const saveNow = () => {
      // Пишем только после реального движения — иначе просто открытая страница затёрла бы сохранённую позицию.
      if(readState.restoring || !readState.moved) return;
      store.set(progressKey, Math.round(getProgress()));
    };

    const update = () => {
      const p = getProgress();
      bar.style.width = `${p}%`;
      const label = $('#readerPercent');
      if(label) label.textContent = `${Math.round(p)}%`;
      const left = $('#readerLeft');
      if(left){
        if(!readState.words) readState.words = countWords();
        left.textContent = readState.words ? formatMinutes(readState.words / WPM * (1 - p/100)) : '—';
      }
      if(readState.baseY !== null && Math.abs(window.scrollY - readState.baseY) >= 2) readState.moved = true;
      if(readState.moved && !readState.restoring){
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 250);
      }
    };

    onScroll(update);
    update();
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if(document.hidden) saveNow(); });
  }

  function restoreProgress(){
    if(!readState.restoring) return;
    const saved = readState.saved;
    let done = false;

    // Если пользователь сам начал листать — не мешаем ему.
    const cancel = () => { if(!done){ done = true; finishRestore(); } };
    ['wheel','touchstart','keydown','mousedown'].forEach(ev =>
      window.addEventListener(ev, cancel, {once:true, passive:true}));

    const attempt = () => {
      if(done) return true;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if(max > 300){
        // В CSS задано scroll-behavior:smooth, поэтому на время восстановления отключаем плавность.
        const html = document.documentElement, prev = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, max * (saved / 100));
        html.style.scrollBehavior = prev;
        done = true;
        finishRestore();
        return true;
      }
      return false;
    };

    // Ждём шрифты: после их загрузки меняется высота страницы, а позиция хранится в процентах.
    const ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => {
      setTimeout(() => {
        if(attempt()) return;
        // Контент ещё скрыт (например, пароль в книге 3) — одна повторная попытка и выходим.
        setTimeout(() => { if(!attempt()){ done = true; finishRestore(); } }, 900);
      }, 120);
    });
  }

  function setupBackTop(){
    const b = document.createElement('button');
    b.className = 'back-top';
    b.type = 'button';
    b.setAttribute('aria-label','Наверх');
    b.textContent = '↑';
    document.body.appendChild(b);
    const toggle = () => b.classList.toggle('visible', window.scrollY > 500);
    onScroll(toggle);
    toggle();
    b.addEventListener('click', () => window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'}));
  }

  /* ---------- закрытие панелей ---------- */
  const panels = [];   // {wrap, close}
  function registerPanel(wrap, toggle, panel){
    const close = () => {
      wrap.classList.remove('open');
      toggle.setAttribute('aria-expanded','false');
      panel.setAttribute('aria-hidden','true');
    };
    const open = () => {
      panels.forEach(p => { if(p.wrap !== wrap) p.close(); });
      wrap.classList.add('open');
      toggle.setAttribute('aria-expanded','true');
      panel.setAttribute('aria-hidden','false');
    };
    panels.push({wrap, close});
    return {open, close, isOpen: () => wrap.classList.contains('open')};
  }
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    panels.forEach(p => {
      if(p.wrap.classList.contains('open')){
        p.close();
        const t = p.wrap.querySelector('button[aria-expanded]');
        if(t) t.focus();
      }
    });
  });
  document.addEventListener('click', e => {
    panels.forEach(p => { if(p.wrap.classList.contains('open') && !p.wrap.contains(e.target)) p.close(); });
  });

  /* ---------- главы ---------- */
  function getChapters(){
    const list = [...document.querySelectorAll('main h3, main h4')]
      .filter(h => h.getClientRects().length && !h.closest('.review-system'));
    list.forEach((h, i) => { if(!h.id) h.id = `chapter-${i+1}`; });
    return list;
  }
  function currentChapterIndex(chapters){
    let idx = -1;
    chapters.forEach((h, i) => { if(h.getBoundingClientRect().top <= 90) idx = i; });
    return idx;
  }
  function goTo(el){
    el.scrollIntoView({behavior: reduceMotion ? 'auto' : 'smooth', block:'start'});
  }
  function chapterLabel(h){
    const t = h.textContent.replace(/\s+/g,' ').trim();
    return t.length > 42 ? t.slice(0, 41) + '…' : t;
  }

  /* ---------- панель чтения ---------- */
  function setupTools(){
    const wrap = document.createElement('div');
    wrap.className = 'reader-tools';
    wrap.innerHTML = `
      <div class="reader-tools-panel" id="readerToolsPanel" aria-hidden="true" role="group" aria-label="Настройки чтения">
        <div class="tool-title">Настройки чтения</div>
        <div class="tool-row">
          <button type="button" data-action="font-down" aria-label="Уменьшить шрифт">A−</button>
          <button type="button" data-action="font-reset" aria-label="Сбросить размер шрифта">A</button>
          <button type="button" data-action="font-up" aria-label="Увеличить шрифт">A+</button>
        </div>
        <div class="tool-row">
          <button type="button" data-action="focus" aria-pressed="false">Фокус</button>
          <button type="button" data-action="top">Наверх</button>
        </div>
        <div class="reader-stat"><span>Прогресс</span><strong id="readerPercent">0%</strong></div>
        <div class="reader-stat"><span>Осталось</span><strong id="readerLeft">—</strong></div>
        <div class="reader-stat"><span>Размер</span><strong id="readerSize">20px</strong></div>
        <div class="tool-toc" id="readerToc" hidden>
          <div class="tool-toc-title">Содержание</div>
          <div class="tool-toc-list" role="list"></div>
        </div>
      </div>
      <button type="button" class="reader-tools-toggle" aria-label="Настройки чтения" aria-expanded="false" aria-controls="readerToolsPanel">☰</button>
    `;
    document.body.appendChild(wrap);

    const panel = wrap.querySelector('.reader-tools-panel');
    const toggle = wrap.querySelector('.reader-tools-toggle');
    const ctl = registerPanel(wrap, toggle, panel);
    const toc = wrap.querySelector('#readerToc');
    const tocList = toc.querySelector('.tool-toc-list');

    function renderToc(){
      const chapters = getChapters();
      if(chapters.length < 2){ toc.hidden = true; return; }
      const cur = currentChapterIndex(chapters);
      tocList.innerHTML = '';
      chapters.forEach((h, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role','listitem');
        b.textContent = chapterLabel(h);
        if(i === cur){ b.classList.add('current'); b.setAttribute('aria-current','true'); }
        b.addEventListener('click', () => { goTo(h); ctl.close(); });
        tocList.appendChild(b);
      });
      toc.hidden = false;
      const active = tocList.querySelector('.current');
      if(active) tocList.scrollTop = Math.max(0, active.offsetTop - 40);
    }

    toggle.addEventListener('click', () => {
      if(ctl.isOpen()){ ctl.close(); return; }
      readState.words = countWords() || readState.words;
      renderToc();
      ctl.open();
      window.dispatchEvent(new Event('scroll'));
    });

    let size = Number(store.get('nobody-font-size', 20)) || 20;
    const applySize = () => {
      size = Math.min(28, Math.max(15, size));
      document.documentElement.style.setProperty('--font-size', `${size}px`);
      $('#readerSize').textContent = `${size}px`;
      store.set('nobody-font-size', size);
    };
    applySize();

    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if(!btn) return;
      const action = btn.dataset.action;
      if(action === 'font-down') size -= 1;
      if(action === 'font-up') size += 1;
      if(action === 'font-reset') size = 20;
      if(action.startsWith('font')) applySize();
      if(action === 'focus'){
        const on = document.body.classList.toggle('focus-mode');
        btn.setAttribute('aria-pressed', String(on));
      }
      if(action === 'top') window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'});
    });
  }

  function setupReadingTime(){
    const kicker = $('.reader-kicker');
    if(!kicker || kicker.querySelector('.reader-time')) return;
    const words = countWords();
    if(!words) return;
    readState.words = words;
    const span = document.createElement('span');
    span.className = 'reader-time';
    span.textContent = `≈ ${formatMinutes(words / WPM)} чтения`;
    kicker.appendChild(span);
  }

  /* ---------- аудио ---------- */
  function setupAudio(){
    const audio = document.querySelector('audio');
    if(!audio) return;

    const player = audio.closest('.audio-player');
    if(!player) return;
    const button = player.querySelector('button.play-btn');
    const status = player.querySelector('.audio-status');
    const key = audioKey;

    const unavailable = () => {
      if(button){ button.disabled = true; button.textContent = '▶ Озвучка недоступна'; }
      if(status) status.textContent = '(файл не найден)';
    };
    audio.querySelectorAll('source').forEach(s =>
      s.addEventListener('error', () => {
        if(audio.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) unavailable();
      }));
    audio.addEventListener('error', unavailable);

    if(button){
      button.addEventListener('click', () => {
        if(audio.paused){
          audio.play().catch(() => {});
        }else{
          audio.pause();
        }
      });
    }
    audio.addEventListener('play', () => {
      if(button) button.textContent = '❚❚ Пауза';
      if(status) status.textContent = '(играет)';
    });
    audio.addEventListener('pause', () => {
      if(button) button.textContent = '▶ Воспроизвести озвучку';
      if(status) status.textContent = '(пауза)';
    });
    audio.addEventListener('ended', () => {
      if(button) button.textContent = '▶ Воспроизвести озвучку';
      if(status) status.textContent = '(завершено)';
      store.remove(key);
    });
    let lastSaved = 0;
    audio.addEventListener('timeupdate', () => {
      const t = audio.currentTime;
      if(Number.isFinite(t) && Math.abs(t - lastSaved) >= 2){ lastSaved = t; store.set(key, t); }
    });
    audio.addEventListener('loadedmetadata', () => {
      const saved = Number(store.get(key, 0));
      if(saved > 5 && saved < audio.duration - 5) audio.currentTime = saved;
    });
  }

  /* ---------- навигация по главам внизу ---------- */
  function setupChapterMarkers(){
    const main = $('main');
    if(!main || main.querySelector('.chapter-nav')) return;
    const headings = [...main.querySelectorAll('h3,h4')];
    if(headings.length < 2) return;

    headings.forEach((h, i) => { if(!h.id) h.id = `chapter-${i+1}`; h.dataset.chapter = i + 1; });

    const nav = document.createElement('nav');
    nav.className = 'chapter-nav';
    nav.setAttribute('aria-label', 'Навигация по главам');
    nav.innerHTML = `
      <button type="button" data-chapter-nav="prev">← Предыдущая часть</button>
      <button type="button" data-chapter-nav="next">Следующая часть →</button>
    `;
    main.appendChild(nav);

    nav.addEventListener('click', e => {
      const btn = e.target.closest('[data-chapter-nav]');
      if(!btn) return;
      const chapters = getChapters();
      if(!chapters.length){ window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'}); return; }
      const idx = currentChapterIndex(chapters);
      if(btn.dataset.chapterNav === 'next'){
        if(idx + 1 < chapters.length) goTo(chapters[idx + 1]);
        else window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'});
      }else{
        // Если мы глубоко внутри главы — сначала к её началу, иначе к предыдущей.
        const cur = chapters[idx];
        if(cur && cur.getBoundingClientRect().top < -160) goTo(cur);
        else if(idx - 1 >= 0) goTo(chapters[idx - 1]);
        else window.scrollTo({top:0, behavior: reduceMotion ? 'auto' : 'smooth'});
      }
    });
  }

  /* ---------- атмосферные эффекты ---------- */
  function setupStars(){
    if(!document.body.classList.contains('theme-book3') || reduceMotion) return;
    let container = $('#starsContainer');
    if(!container){
      container = document.createElement('div');
      container.className = 'stars-container';
      container.id = 'starsContainer';
      container.setAttribute('aria-hidden','true');
      document.body.prepend(container);
    }
    if(container.children.length) return;
    const count = window.innerWidth < 600 ? 70 : 130;
    const frag = document.createDocumentFragment();
    for(let i = 0; i < count; i++){
      const s = document.createElement('i');
      s.className = 'star';
      s.style.left = `${Math.random()*100}%`;
      s.style.top = `${Math.random()*100}%`;
      const size = (Math.random()*2+.6).toFixed(2);
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
      s.style.animationDuration = `${(2+Math.random()*5).toFixed(2)}s`;
      s.style.animationDelay = `${(-Math.random()*5).toFixed(2)}s`;
      frag.appendChild(s);
    }
    container.appendChild(frag);
  }

  function setupSnow(){
    if(!document.body.classList.contains('theme-book1') || reduceMotion) return;
    let container = $('#snowContainer');
    if(!container){
      container = document.createElement('div');
      container.className = 'snow-container';
      container.id = 'snowContainer';
      container.setAttribute('aria-hidden','true');
      document.body.prepend(container);
    }
    if(container.children.length) return;
    const count = window.innerWidth < 600 ? 30 : 65;
    const frag = document.createDocumentFragment();
    for(let i = 0; i < count; i++){
      const s = document.createElement('span');
      s.className = 'snowflake';
      s.textContent = Math.random() > .75 ? '✦' : '•';
      s.style.left = `${Math.random()*100}%`;
      s.style.fontSize = `${(5+Math.random()*9).toFixed(1)}px`;
      s.style.animationDuration = `${(7+Math.random()*12).toFixed(1)}s`;
      s.style.animationDelay = `${(-Math.random()*15).toFixed(1)}s`;
      s.style.setProperty('--drift', `${-80+Math.random()*160}px`);
      frag.appendChild(s);
    }
    container.appendChild(frag);
  }

  function setupScrollDarkening(){
    if(!document.body.classList.contains('theme-book4')) return;
    let overlay = $('#scrollDarkening');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.id = 'scrollDarkening';
      overlay.className = 'scroll-darkening';
      overlay.setAttribute('aria-hidden','true');
      document.body.prepend(overlay);
    }
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      overlay.style.setProperty('--scroll-darkness', (0.06 + p*0.64).toFixed(3));
      overlay.style.setProperty('--scroll-vignette', (0.03 + p*0.30).toFixed(3));
    };
    onScroll(update);
    update();
  }

  function setupGhostSmoke(){
    if(!document.body.classList.contains('theme-book4') || reduceMotion) return;
    let container = $('#ghostSmoke');
    if(!container){
      container = document.createElement('div');
      container.className = 'ghost-smoke';
      container.id = 'ghostSmoke';
      container.setAttribute('aria-hidden','true');
      document.body.prepend(container);
    }
    if(container.children.length) return;
    const count = window.innerWidth < 600 ? 7 : 18;
    const frag = document.createDocumentFragment();
    for(let i = 0; i < count; i++){
      const w = document.createElement('i');
      w.className = 'ghost-wisp';
      w.style.setProperty('--x', `${-5+Math.random()*110}%`);
      w.style.setProperty('--size', `${90+Math.random()*190}px`);
      w.style.setProperty('--blur', `${8+Math.random()*16}px`);
      w.style.setProperty('--duration', `${14+Math.random()*17}s`);
      w.style.setProperty('--delay', `${-Math.random()*24}s`);
      w.style.setProperty('--drift', `${-90+Math.random()*180}px`);
      w.style.setProperty('--rot', `${-25+Math.random()*50}deg`);
      w.style.setProperty('--opacity', `${(.18+Math.random()*.28).toFixed(2)}`);
      frag.appendChild(w);
    }
    container.appendChild(frag);
  }

  function improvePassword(){
    const overlay = $('#passwordOverlay');
    const input = $('#passwordInput');
    if(!overlay || !input) return;
    input.setAttribute('autocomplete','off');
    input.addEventListener('keydown', e => {
      if(e.key === 'Enter') $('#unlockBtn')?.click();
    });
  }

  /* ---------- главная ---------- */
  function setupHome(){
    // Секретные истории удалены при переходе на платформу «Чернила» (2026).

    const btn = $('#continueBtn');
    const last = store.get(lastKey);
    if(btn && last && last !== 'index.html' && /^[\w-]+\.html$/.test(last)){
      btn.href = last;
      const p = Number(store.get(`nobody-progress-${last.replace('.html','')}`, 0)) || 0;
      btn.innerHTML = p >= 3 ? `Продолжить чтение · ${Math.round(p)}% <b>→</b>` : 'Продолжить чтение <b>→</b>';
    }

    document.querySelectorAll('[data-progress-for]').forEach(line => {
      const key = line.dataset.progressFor.replace('.html','');
      const p = Math.round(Number(store.get(`nobody-progress-${key}`, 0)) || 0);
      line.style.setProperty('--progress', `${p}%`);
      if(p > 0){
        const card = line.closest('a');
        if(card){
          const sr = document.createElement('span');
          sr.className = 'sr-only';
          sr.textContent = `Прочитано: ${p}%`;
          card.appendChild(sr);
          card.title = `Прочитано: ${p}%`;
        }
      }
    });
  }

  function init(){
    if(isReader){
      if('scrollRestoration' in history) history.scrollRestoration = 'manual';
      saveLastPage();
      setupProgress();
      setupBackTop();
      setupTools();
    }
    if(!isReader){
      setupHome();
      return;
    }
    setupReadingTime();
    setupAudio();
    setupChapterMarkers();
    setupStars();
    setupSnow();
    setupScrollDarkening();
    setupGhostSmoke();
    improvePassword();
    restoreProgress();

    // Текст книги 3 появляется только после ввода пароля: достраиваем то, что зависит от текста.
    document.addEventListener('nobody:content-ready', () => {
      setupReadingTime();
      setupChapterMarkers();
      readState.saved = Number(store.get(progressKey, 0)) || 0;
      readState.restoring = readState.saved >= 5;
      readState.baseY = null;
      if(readState.restoring) restoreProgress(); else finishRestore();
    });
  }

  /* ---------- офлайн-чтение ---------- */
  // Service worker кеширует страницы после первого посещения: прочитанное открывается без сети.
  function registerOffline(){
    if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
  registerOffline();

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }
})();
