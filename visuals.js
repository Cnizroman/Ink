/* =========================================================================
   NOBODY CAME — VISUAL LAYER v3
   Оформление и ощущение сайта: атмосфера, появление блоков, подсветка
   карточек, липкая шапка чтения, таймлайн пути, карусель цитат.

   Этот файл ничего не знает о прогрессе чтения, паролях и отзывах —
   он только украшает. Всё уважает prefers-reduced-motion и сенсорный ввод.
   ========================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const motionQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const coarse = window.matchMedia ? matchMedia('(pointer: coarse)').matches : false;
  let reduce = !!(motionQuery && motionQuery.matches);
  if (motionQuery && motionQuery.addEventListener) {
    motionQuery.addEventListener('change', e => { reduce = e.matches; });
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Один общий rAF на все scroll-подписчики визуального слоя.
  const scrollFns = [];
  let scrollQueued = false;
  function onScroll(fn) {
    scrollFns.push(fn);
    fn();
  }
  function flushScroll() {
    scrollQueued = false;
    scrollFns.forEach(fn => fn());
  }
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(flushScroll);
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(flushScroll);
  });

  /* =======================================================================
     1. АТМОСФЕРА — медленные пылинки на canvas
     ======================================================================= */
  const ATMOS_THEMES = {
    'home-v2':     { colors: ['200,169,110', '166,123,196', '216,196,150'], density: 1.0, speed: 1.0, size: 1.0 },
    'theme-intro': { colors: ['200,169,110', '222,206,170'],                density: 0.8, speed: 0.9, size: 1.0 },
    'theme-book1': { colors: ['115,185,212', '200,230,245'],                density: 0.5, speed: 0.7, size: 1.1 },
    'theme-book2': { colors: ['184,184,184', '220,220,225'],                density: 0.9, speed: 0.8, size: 1.0 },
    'theme-book3': { colors: ['166,123,196', '210,190,235'],                density: 0.55, speed: 0.6, size: 1.0 },
    'theme-book4': { colors: ['111,255,214', '150,235,215'],                density: 0.5, speed: 0.7, size: 1.0 },
    'theme-belaya':{ colors: ['240,240,240', '200,169,110'],                density: 0.8, speed: 0.9, size: 1.0 },
    'archive-page':{ colors: ['200,169,110', '170,165,158'],                density: 0.7, speed: 0.9, size: 1.0 },
  };

  function setupAtmosphere() {
    if (reduce || !window.CanvasRenderingContext2D) return;

    let palette = ATMOS_THEMES['home-v2'];
    for (const cls in ATMOS_THEMES) {
      if (document.body.classList.contains(cls)) { palette = ATMOS_THEMES[cls]; break; }
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'atmos-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1, motes = [], sprites = {}, raf = null, running = true;

    // Один раз рисуем мягкое свечение в отдельный спрайт на каждый цвет —
    // так в кадре остаются только дешёвые drawImage вместо градиентов.
    function makeSprite(rgb) {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, `rgba(${rgb},.95)`);
      grd.addColorStop(0.28, `rgba(${rgb},.34)`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      return c;
    }

    function build() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      sprites = {};
      palette.colors.forEach(c => { sprites[c] = makeSprite(c); });

      const area = w * h;
      const base = Math.round(area / 20000);
      const count = clamp(Math.round(base * palette.density), 14, 90);
      motes = [];
      for (let i = 0; i < count; i++) {
        motes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: (0.5 + Math.random() * 1.7) * palette.size,
          vy: -(0.06 + Math.random() * 0.34) * palette.speed,
          vx: (Math.random() - 0.5) * 0.14,
          sway: Math.random() * Math.PI * 2,
          swaySpeed: 0.004 + Math.random() * 0.012,
          a: 0.10 + Math.random() * 0.42,
          c: palette.colors[(Math.random() * palette.colors.length) | 0],
          tw: Math.random() * Math.PI * 2,
          twSpeed: 0.006 + Math.random() * 0.016
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.sway += m.swaySpeed;
        m.tw += m.twSpeed;
        m.x += m.vx + Math.sin(m.sway) * 0.22;
        m.y += m.vy;
        if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
        if (m.x < -20) m.x = w + 20;
        if (m.x > w + 20) m.x = -20;

        const alpha = m.a * (0.55 + 0.45 * Math.sin(m.tw));
        const s = m.r * 11;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(sprites[m.c], m.x - s / 2, m.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(draw);
    }

    function start() { if (!raf && running) raf = requestAnimationFrame(draw); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    build();
    start();
    requestAnimationFrame(() => canvas.classList.add('is-ready'));

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { build(); }, 220);
    });

    // Не тратим батарею, когда вкладка скрыта.
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) start(); else stop();
    });

    document.addEventListener('nobody:content-ready', () => { build(); });
  }

  /* =======================================================================
     2. ПОЯВЛЕНИЕ БЛОКОВ ПРИ СКРОЛЛЕ
     ======================================================================= */
  const REVEAL_SELECTOR = [
    '.section-head', '.story-card', '.archive-card', '.cast-card',
    '.path-stop', '.home-stats', '.cast-more',
    '.reader-hero-v2', '.reader-note-v2', '.book-nav-v2', '.archive-character-figure',
    '.archive-entry-content > section', '.archive-entry-content > p',
    '.review-system', '.standalone-heading', '.standalone-note',
    '.archive-section-block', '.archive-category-index-grid a'
  ].join(',');

  function setupReveal() {
    if (!('IntersectionObserver' in window) || reduce) return;

    const vh = window.innerHeight;
    const targets = $$(REVEAL_SELECTOR).filter(el => {
      if (el.closest('.no-reveal')) return false;
      if (el.classList.contains('home-fade')) return false;   // у шапки своя анимация
      const r = el.getBoundingClientRect();
      return r.top > vh * 0.94;           // то, что уже видно, не прячем
    });

    if (!targets.length) return;

    // Небольшой сдвиг появления внутри каждой группы — читается как волна.
    const groups = new Map();
    targets.forEach(el => {
      const key = el.parentElement || document.body;
      const i = groups.get(key) || 0;
      groups.set(key, i + 1);
      el.classList.add('reveal');
      el.style.animationDelay = `${Math.min(i, 6) * 0.07}s`;
    });

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('is-in');
        el.addEventListener('animationend', () => {
          el.style.animationDelay = '';
          el.classList.add('no-motion');   // снимаем animation, чтобы работал hover-transform
        }, { once: true });
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

    targets.forEach(el => io.observe(el));

    // Подстраховка: если анимация по какой-то причине не запустилась — показываем.
    setTimeout(() => {
      targets.forEach(el => { if (!el.classList.contains('is-in')) el.classList.add('is-in', 'no-motion'); });
    }, 4000);
  }

  /* =======================================================================
     3. ПОДСВЕТКА КАРТОЧЕК ПОД КУРСОРОМ
     ======================================================================= */
  function setupSpotlight() {
    if (coarse) return;

    // Страницы, которые мы не трогаем руками, получают подсветку автоматически.
    $$('.archive-character-figure, .reader-hero-v2, .archive-entry-nav a, .archive-card, .archive-category-index-grid a')
      .forEach(el => el.setAttribute('data-spotlight', ''));

    const hosts = $$('[data-spotlight]');
    hosts.forEach(host => {
      const spot = document.createElement('i');
      spot.className = 'spot';
      spot.setAttribute('aria-hidden', 'true');
      const accent = getComputedStyle(host).getPropertyValue('--spot-color').trim();
      if (accent) spot.style.setProperty('--spot-color', accent);
      host.appendChild(spot);

      let frame = null;
      host.addEventListener('pointermove', e => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const r = host.getBoundingClientRect();
          host.style.setProperty('--mx', `${((e.clientX - r.left) / r.width * 100).toFixed(2)}%`);
          host.style.setProperty('--my', `${((e.clientY - r.top) / r.height * 100).toFixed(2)}%`);
        });
      });
    });
  }

  /* =======================================================================
     4. ЛЁГКИЙ НАКЛОН КАРТОЧЕК
     ======================================================================= */
  function setupTilt() {
    if (coarse || reduce) return;
    $$('[data-tilt]').forEach(card => {
      let frame = null;
      card.addEventListener('pointermove', e => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = null;
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          card.style.setProperty('--ty', `${(px * 5).toFixed(2)}deg`);
          card.style.setProperty('--tx', `${(-py * 4).toFixed(2)}deg`);
        });
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--ty', '0deg');
        card.style.setProperty('--tx', '0deg');
      });
    });
  }

  /* =======================================================================
     5. ЗАГОЛОВОК ГЛАВНОЙ — ПОБУКВЕННОЕ ПОЯВЛЕНИЕ
     ======================================================================= */
  function setupHeroReveal() {
    const h1 = $('.home-hero h1');
    if (!h1) return;

    // Компас за заголовком
    if (!$('.home-compass')) {
      const compass = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      compass.setAttribute('class', 'home-compass');
      compass.setAttribute('viewBox', '0 0 200 200');
      compass.setAttribute('aria-hidden', 'true');
      let ticks = '';
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const long = i % 4 === 0;
        const r1 = long ? 78 : 84, r2 = 90;
        ticks += `<line class="compass-tick" x1="${(100 + Math.cos(a) * r1).toFixed(1)}" y1="${(100 + Math.sin(a) * r1).toFixed(1)}" x2="${(100 + Math.cos(a) * r2).toFixed(1)}" y2="${(100 + Math.sin(a) * r2).toFixed(1)}"${long ? '' : ' opacity=".45"'}/>`;
      }
      compass.innerHTML =
        '<circle class="compass-ring" cx="100" cy="100" r="92"/>' +
        '<circle cx="100" cy="100" r="66"/>' +
        '<circle cx="100" cy="100" r="40" opacity=".55"/>' + ticks +
        '<path class="compass-rose" d="M100 30 108 96 100 86 92 96Z"/>' +
        '<path class="compass-rose" d="M100 170 92 104 100 114 108 104Z" opacity=".45"/>' +
        '<line x1="100" y1="20" x2="100" y2="180"/><line x1="20" y1="100" x2="180" y2="100"/>';
      h1.parentElement.appendChild(compass);
    }

    if (reduce) return;

    // Разбиваем текст на строки и буквы, сохраняя <br> и вложенную разметку.
    const lines = h1.innerHTML.split(/<br\s*\/?>/i).map(part => part.trim()).filter(Boolean);
    if (!lines.length) return;
    let idx = 0;
    h1.innerHTML = lines.map(line => {
      const isEm = /<em[\s>]/i.test(line);
      const chars = [...line.replace(/<[^>]+>/g, '')];
      const inner = chars.map(ch => {
        if (ch === ' ') return ' ';
        const safe = ch === '<' ? '&lt;' : (ch === '>' ? '&gt;' : ch);
        const span = `<span class="ch" style="animation-delay:${(0.12 + idx * 0.045).toFixed(3)}s">${safe}</span>`;
        idx++;
        return span;
      }).join('');
      return `<span class="tl${isEm ? ' is-em' : ''}">${inner}</span>`;
    }).join('');

    // Плавное проявление шапки — только для того, что и так видно при загрузке,
    // иначе анимация «проигрывается» за кадром и конфликтует со scroll-reveal.
    ['.home-lead', '.home-quote', '.home-actions'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) el.classList.add('home-fade');
    });
  }

  /* =======================================================================
     6. ПОЛОСА ПРОГРЕССА ПРОКРУТКИ (главная)
     ======================================================================= */
  function setupHomeRail() {
    if (!document.body.classList.contains('home-v2')) return;
    if ($('.nf')) return;                        // на странице 404 полоса не нужна
    const rail = document.createElement('div');
    rail.className = 'home-rail';
    rail.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rail);
    onScroll(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      rail.style.setProperty('--rail', p.toFixed(4));
    });
  }

  /* =======================================================================
     7. ЛИПКАЯ ШАПКА ЧТЕНИЯ
     ======================================================================= */
  function setupMiniHead() {
    const isReader = !!($('main') || $('#locked-data')) &&
      !document.body.classList.contains('home-v2') &&
      !document.body.classList.contains('archive-page');
    if (!isReader) return;

    const heading = $('header h1') || $('h1') || $('#passwordTitle');
    const title = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : 'Никто не вспомнит';

    const escape = t => t.replace(/[<>&"]/g, '');
    const bar = document.createElement('div');
    bar.className = 'mini-head';
    bar.innerHTML =
      '<a class="mini-head-home" href="index.html" aria-label="На главную"><span aria-hidden="true">←</span> Главная</a>' +
      `<span class="mini-head-title">${escape(title)}</span>` +
      '<span class="mini-head-chapter" aria-hidden="true"></span>' +
      '<span class="mini-head-pct" aria-hidden="true">0%</span>';
    document.body.appendChild(bar);
    document.body.classList.add('has-minihead');

    const pct = bar.querySelector('.mini-head-pct');
    const chap = bar.querySelector('.mini-head-chapter');

    // Текущая часть: «День 3 — …», название главы и т.п.
    let headings = [];
    const refreshHeadings = () => {
      headings = $$('main h2, main h3, main h4').filter(h =>
        h.getClientRects().length && !h.closest('.review-system, .reader-hero-v2, .no-reveal'));
    };
    refreshHeadings();
    // Текст книги 3 появляется только после пароля — пересобираем список глав.
    document.addEventListener('nobody:content-ready', refreshHeadings);

    function currentHeading() {
      let found = null;
      headings.forEach(h => { if (h.getBoundingClientRect().top <= 120) found = h; });
      return found;
    }

    onScroll(() => {
      const y = window.scrollY;
      bar.classList.toggle('is-visible', y > 160);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? clamp(y / max, 0, 1) : 0;
      pct.textContent = `${Math.round(p * 100)}%`;

      const h = currentHeading();
      if (h) {
        const label = h.textContent.replace(/\s+/g, ' ').trim();
        chap.textContent = label.length > 44 ? label.slice(0, 43) + '…' : label;
        chap.classList.add('is-on');
      } else {
        chap.textContent = '';
        chap.classList.remove('is-on');
      }
    });
  }

  /* =======================================================================
     8. ПУТЬ ЦИКЛА — линия заполняется по скроллу
     ======================================================================= */
  function setupPath() {
    const list = $('.path-list');
    if (!list) return;

    const fill = document.createElement('span');
    fill.className = 'path-fill';
    fill.setAttribute('aria-hidden', 'true');
    list.appendChild(fill);

    const stops = $$('.path-stop', list);

    onScroll(() => {
      const r = list.getBoundingClientRect();
      const anchor = window.innerHeight * 0.62;
      const p = clamp((anchor - r.top) / Math.max(1, r.height), 0, 1);
      fill.style.setProperty('--path-progress', p.toFixed(4));

      stops.forEach(stop => {
        const sr = stop.getBoundingClientRect();
        stop.classList.toggle('is-on', sr.top < anchor);
      });
    });
  }

  /* =======================================================================
     9. КАРУСЕЛЬ ЦИТАТ
     ======================================================================= */
  function setupQuotes() {
    const stage = $('[data-quotes]');
    if (!stage) return;

    const slides = $$('.quote-slide', stage);
    if (slides.length < 2) { slides[0]?.classList.add('is-active'); return; }

    let dots = $('.quote-dots');
    if (dots) {
      dots.innerHTML = '';
      slides.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', `Цитата ${i + 1}`);
        b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        b.addEventListener('click', () => { go(i); restart(); });
        dots.appendChild(b);
      });
    }

    let current = 0;
    let timer = null;
    const DELAY = 8000;

    function go(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === current));
      if (dots) {
        [...dots.children].forEach((b, k) => b.setAttribute('aria-selected', k === current ? 'true' : 'false'));
      }
    }

    function restart() {
      if (timer) clearInterval(timer);
      if (reduce) return;
      timer = setInterval(() => go(current + 1), DELAY);
    }

    const prev = $('[data-quote-prev]');
    const next = $('[data-quote-next]');
    if (prev) prev.addEventListener('click', () => { go(current - 1); restart(); });
    if (next) next.addEventListener('click', () => { go(current + 1); restart(); });

    stage.addEventListener('mouseenter', () => { if (timer) clearInterval(timer); });
    stage.addEventListener('mouseleave', restart);
    stage.addEventListener('focusin', () => { if (timer) clearInterval(timer); });
    stage.addEventListener('focusout', restart);
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { go(current + 1); restart(); }
      if (e.key === 'ArrowLeft') { go(current - 1); restart(); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (timer) clearInterval(timer); } else restart();
    });

    go(0);

    // Крутим карусель только когда она действительно на экране.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) restart(); else if (timer) clearInterval(timer); });
      }, { threshold: 0.25 }).observe(stage);
    } else {
      restart();
    }
  }

  /* =======================================================================
     10. СЧЁТЧИКИ
     ======================================================================= */
  function setupCounters() {
    const stats = $$('.stat b[data-count]');
    if (!stats.length) return;

    // В разметке лежит итоговое число — без JS читатель увидит его, а не ноль.
    stats.forEach(el => { el.textContent = '0'; });

    const run = el => {
      const target = Number(el.dataset.count) || 0;
      if (reduce) { el.textContent = String(target); return; }
      const dur = 1100;
      const t0 = performance.now();
      const tick = now => {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) { stats.forEach(run); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        run(e.target);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    stats.forEach(el => io.observe(el));
  }

  /* =======================================================================
     11. ШАПКА ПРОИЗВЕДЕНИЯ — единый вид для всех страниц чтения
     У первых книг есть готовый блок с подводкой; там, где его нет,
     собираем такой же из подзаголовка и описания страницы.
     ======================================================================= */
  const BADGES = {
    'theme-intro': '00',
    'theme-book1': 'I',
    'theme-book2': 'II',
    'theme-book3': 'III',
    'theme-book4': 'IV',
    'theme-belaya': '—'
  };

  function setupReaderHero() {
    const main = $('main');
    if (!main || $('.reader-hero-v2')) return;
    if (document.body.classList.contains('home-v2')) return;
    if (document.body.classList.contains('archive-page')) return;

    const heading = $('header h1');
    if (!heading) return;                       // книга 3 открывается паролем

    const subtitle = $('.subtitle');
    const meta = $('meta[name="description"]');
    const kicker = subtitle
      ? subtitle.textContent.replace(/\s+/g, ' ').trim().toUpperCase()
      : 'НИКТО НЕ ВСПОМНИТ';
    const lede = meta ? meta.content.replace(/\s+/g, ' ').trim() : '';
    if (!lede) return;

    let badge = '—';
    for (const cls in BADGES) {
      if (document.body.classList.contains(cls)) { badge = BADGES[cls]; break; }
    }

    const cs = getComputedStyle(document.body);
    const accent = (cs.getPropertyValue('--accent') || '').trim() || '#c8a96e';
    const rgb = (cs.getPropertyValue('--accent-rgb') || '').trim() || '200,169,110';

    const hero = document.createElement('section');
    hero.className = 'reader-hero-v2';
    hero.setAttribute('aria-label', 'О странице');
    hero.setAttribute('data-spotlight', '');
    hero.style.setProperty('--reader-accent', accent);
    hero.style.setProperty('--reader-rgb', rgb);
    hero.innerHTML =
      `<div class="reader-kicker">${kicker.replace(/[<>&]/g, '')}</div>` +
      `<p class="reader-lede">${lede.replace(/[<>&]/g, '')}</p>` +
      `<span class="reader-badge" aria-hidden="true">${badge}</span>`;

    const note = document.createElement('div');
    note.className = 'reader-note-v2';
    note.textContent = 'Читай в своём темпе. Твоя позиция, размер текста и прогресс сохраняются автоматически.';

    main.parentNode.insertBefore(hero, main);
    main.parentNode.insertBefore(note, main);
  }

  /* Навигация «назад / дальше» в конце книги — как у книг 1, 2 и 4.
     Текст третьей книги расшифровывается в браузере, поэтому в самой
     странице такого блока нет: достраиваем его после ввода пароля. */
  const BOOK_NAV = {
    'theme-book3': [
      ['book2.html', '← Спасательный круг'],
      ['book4.html', '7 Дней →']
    ]
  };

  function setupBookNav() {
    const main = $('main');
    if (!main || $('.book-nav-v2')) return;
    let links = null;
    for (const cls in BOOK_NAV) {
      if (document.body.classList.contains(cls)) { links = BOOK_NAV[cls]; break; }
    }
    if (!links) return;

    const nav = document.createElement('nav');
    nav.className = 'book-nav-v2';
    nav.setAttribute('aria-label', 'Навигация по циклу');
    links.forEach(([href, label]) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      nav.appendChild(a);
    });
    main.appendChild(nav);
  }

  /* =======================================================================
     12. ОГЛАВЛЕНИЕ АРХИВА — подсвечиваем текущий раздел
     ======================================================================= */
  function setupArchiveSpy() {
    const links = $$('.archive-category-index-grid a[href^="#"]');
    if (!links.length) return;

    const map = links
      .map(a => ({ a, target: document.getElementById(a.getAttribute('href').slice(1)) }))
      .filter(pair => pair.target);
    if (!map.length) return;

    onScroll(() => {
      const anchor = 140;
      let active = null;
      map.forEach(({ target }) => { if (target.getBoundingClientRect().top <= anchor) active = target; });
      map.forEach(({ a, target }) => {
        const on = target === active;
        a.classList.toggle('is-current', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    });
  }

  /* =======================================================================
     13. МЯГКИЕ ДЕТАЛИ СТРАНИЦ ЧТЕНИЯ
     ======================================================================= */
  function setupReaderPolish() {
    // Аккордеонная подсветка текущего пункта навигации
    const nav = $('.top-nav');
    if (nav) {
      const here = location.pathname.split('/').pop() || 'index.html';
      $$('a', nav).forEach(a => {
        const href = a.getAttribute('href');
        if (href && href === here) a.classList.add('active');
      });
    }
    // На телефоне навигация прокручивается пальцем — показываем текущую страницу
    const activeLink = nav && $('a.active', nav);
    if (activeLink && nav.scrollWidth > nav.clientWidth) {
      requestAnimationFrame(() => {
        nav.scrollLeft = Math.max(0, activeLink.offsetLeft - (nav.clientWidth - activeLink.offsetWidth) / 2);
      });
    }
    // Плавные якорные переходы для оглавления
    $$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const id = a.getAttribute('href').slice(1);
        if (!id) return;
        const target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', `#${id}`);
      });
    });
  }

  /* =======================================================================
     ИНИЦИАЛИЗАЦИЯ
     ======================================================================= */
  function init() {
    setupAtmosphere();
    setupHeroReveal();
    setupHomeRail();
    setupMiniHead();
    setupPath();
    setupQuotes();
    setupCounters();
    setupArchiveSpy();
    setupReaderHero();
    setupBookNav();
    setupReaderPolish();
    setupReveal();
    setupSpotlight();
    setupTilt();

    // Книга 3 открывается паролем: шапка и навигация появляются вместе с текстом.
    document.addEventListener('nobody:content-ready', () => {
      setupReaderHero();
      setupBookNav();
      setupReaderPolish();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
