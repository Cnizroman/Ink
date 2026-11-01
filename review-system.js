(function(){
  'use strict';

  const CRITERIA = [
    { key:'plot', label:'СЮЖЕТ', max:5 },
    { key:'characters', label:'ПЕРСОНАЖИ', max:4 },
    { key:'atmosphere', label:'АТМОСФЕРА', max:4 },
    { key:'style', label:'ЯЗЫК И СТИЛЬ', max:4 },
    { key:'emotion', label:'ЭМОЦИОНАЛЬНОЕ ВОЗДЕЙСТВИЕ', max:4 }
  ];
  const MAX_TOTAL = 21;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  const config = window.NOBODY_SUPABASE_CONFIG;
  const SUPABASE_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  // Библиотека Supabase (~170 КБ) нужна только тем, кто долистал до отзывов или решил написать свой,
  // поэтому подгружаем её лениво, а не на каждой странице при открытии книги.
  let client = null, clientPromise = null;
  function ensureClient(){
    if (client) return Promise.resolve(client);
    if (clientPromise) return clientPromise;
    clientPromise = new Promise(resolve => {
      const make = () => {
        if (window.supabase && config?.url && config?.publishableKey) {
          client = window.supabase.createClient(config.url, config.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
          });
          if (window.NobodyReviews) window.NobodyReviews.client = client;
        }
        if (!client) clientPromise = null;      // при сбое можно будет повторить попытку
        resolve(client);
      };
      if (window.supabase) return make();
      const sc = document.createElement('script');
      sc.src = SUPABASE_SRC;
      sc.async = true;
      sc.onload = make;
      sc.onerror = () => { clientPromise = null; resolve(null); };
      document.head.appendChild(sc);
    });
    return clientPromise;
  }

  const total = r => CRITERIA.reduce((n,c)=>n+Number(r[c.key]||0),0);
  const dateOf = r => r.created_at || r.createdAt;

  function reviewMarkup(bookId, title, accent){
    return `
<section class="review-system" data-review-book="${esc(bookId)}" style="--review-accent:${accent}">
  <div class="review-archive-head">
    <div>
      <div class="review-kicker">REVIEW ARCHIVE</div>
      <h2>Отзывы о произведении</h2>
      <p>Оценка формируется из пяти независимых критериев. Каждый критерий можно изменить полоской ниже.</p>
    </div>
    <div class="review-summary" aria-live="polite">
      <strong class="review-average">—</strong><span>/ 21</span>
      <small class="review-count">Отзывов: 0</small>
    </div>
  </div>
  <div class="review-published" data-review-list><div class="review-empty">Загрузка архива…</div></div>
  <button class="review-open" type="button" data-review-open>НАПИСАТЬ РЕЦЕНЗИЮ</button>
  <form class="review-form" data-review-form hidden>
    <div class="review-form-title"><span>REVIEW</span><b>НОВАЯ ЗАПИСЬ</b></div>
    <label class="review-field"><span>ИМЯ / ПСЕВДОНИМ</span><input name="name" maxlength="60" placeholder="Анонимный читатель" autocomplete="nickname"></label>
    <div class="review-sliders">
      ${CRITERIA.map(c=>`<label class="review-slider"><span><b>${c.label}</b><strong data-value-for="${c.key}">0 / ${c.max}</strong></span><input type="range" name="${c.key}" min="0" max="${c.max}" value="0" step="1" data-slider="${c.key}"></label>`).join('')}
    </div>
    <div class="review-total"><span>ИТОГОВАЯ ОЦЕНКА</span><strong data-total>0 / ${MAX_TOTAL}</strong></div>
    <div class="review-hp" aria-hidden="true"><label>Не заполняйте это поле<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <label class="review-field"><span>ТЕКСТ РЕЦЕНЗИИ</span><textarea name="text" rows="7" maxlength="3000" required placeholder="Что вы думаете об этой истории?"></textarea></label>
    <div class="review-form-actions"><button type="submit">ОТПРАВИТЬ НА МОДЕРАЦИЮ</button><button type="button" class="review-cancel" data-review-cancel>ОТМЕНА</button></div>
    <p class="review-note">После отправки запись получает статус PENDING. Публично она появится только после модерации.</p>
    <div class="review-message" data-review-message aria-live="polite"></div>
  </form>
</section>`;
  }

  function setMessage(form, text, error=false){
    const msg=form.querySelector('[data-review-message]');
    msg.textContent=text;
    msg.classList.add('show');
    if(error) msg.style.color='#d88f8f'; else msg.style.color='';
  }

  function render(root, published){
    const list=root.querySelector('[data-review-list]');
    const avg=published.length ? published.reduce((n,r)=>n+total(r),0)/published.length : null;
    root.querySelector('.review-average').textContent=avg===null?'—':avg.toFixed(1);
    root.querySelector('.review-count').textContent=`Отзывов: ${published.length}`;
    if(!published.length){
      list.innerHTML='<div class="review-empty">Пока нет опубликованных отзывов. Станьте первым читателем, оставившим запись в архиве.</div>';
      return;
    }
    list.innerHTML=published.map(r=>`<article class="review-card">
      <div class="review-card-top"><div><b>${esc(r.name||'Анонимный читатель')}</b><small>${dateOf(r)?new Date(dateOf(r)).toLocaleDateString('ru-RU'):''}</small></div><strong>${total(r)} / 21</strong></div>
      <div class="review-breakdown">${CRITERIA.map(c=>`<span>${c.label}: <b>${Number(r[c.key])}/${c.max}</b></span>`).join('')}</div>
      <p>${esc(r.text).replace(/\n/g,'<br>')}</p>
    </article>`).join('');
  }

  async function loadPublished(root){
    const client = await ensureClient();
    if(!client){
      render(root,[]);
      root.querySelector('[data-review-list]').innerHTML='<div class="review-empty">Система рецензий не подключена к базе данных.</div>';
      return;
    }
    const {data,error}=await client.from('reviews').select('id,book_id,name,text,plot,characters,atmosphere,style,emotion,total,created_at').eq('book_id',root.dataset.reviewBook).eq('status','PUBLISHED').order('created_at',{ascending:false});
    if(error){
      console.error('Nobody Reviews:',error);
      render(root,[]);
      root.querySelector('[data-review-list]').innerHTML='<div class="review-empty">Не удалось загрузить архив рецензий.</div>';
      return;
    }
    render(root,data||[]);
  }

  function updateTotal(form){
    let sum=0;
    CRITERIA.forEach(c=>{const el=form.querySelector(`[data-slider="${c.key}"]`); const v=Number(el.value); sum+=v; form.querySelector(`[data-value-for="${c.key}"]`).textContent=`${v} / ${c.max}`;});
    form.querySelector('[data-total]').textContent=`${sum} / ${MAX_TOTAL}`;
  }

  async function submitReview(root,form){
    const client = await ensureClient();
    if(!client){setMessage(form,'Система рецензий сейчас недоступна.',true);return;}
    const fd=new FormData(form);
    const text=String(fd.get('text')||'').trim();
    if(!text){form.querySelector('[name=text]').focus();return;}

    // Скрытое поле-ловушка: заполняют только боты. Делаем вид, что всё прошло.
    if(String(fd.get('website')||'').trim()){
      form.reset(); updateTotal(form);
      setMessage(form,'Запись принята и отправлена на модерацию.');
      return;
    }
    // Не чаще одной отправки в минуту с одного браузера.
    const COOLDOWN_MS=60000, LAST_KEY='nobody-review-last';
    let last=0; try{ last=Number(localStorage.getItem(LAST_KEY)||0); }catch(e){}
    const wait=COOLDOWN_MS-(Date.now()-last);
    if(wait>0){
      setMessage(form,`Подождите ещё ${Math.ceil(wait/1000)} сек. перед следующей отправкой.`,true);
      return;
    }
    const payload={
      book_id:root.dataset.reviewBook,
      name:String(fd.get('name')||'').trim()||'Анонимный читатель',
      text,
      plot:Number(fd.get('plot')||0),
      characters:Number(fd.get('characters')||0),
      atmosphere:Number(fd.get('atmosphere')||0),
      style:Number(fd.get('style')||0),
      emotion:Number(fd.get('emotion')||0),
      status:'PENDING'
    };
    const submit=form.querySelector('.review-form-actions button[type="submit"]');
    submit.disabled=true;
    submit.textContent='ОТПРАВКА…';
    const {error}=await client.from('reviews').insert(payload);
    submit.disabled=false;
    submit.textContent='ОТПРАВИТЬ НА МОДЕРАЦИЮ';
    if(error){
      console.error('Nobody Reviews:',error);
      setMessage(form,'Не удалось отправить рецензию. Попробуйте ещё раз.',true);
      return;
    }
    try{ localStorage.setItem(LAST_KEY,String(Date.now())); }catch(e){}
    form.reset(); updateTotal(form);
    setMessage(form,'Запись принята и отправлена на модерацию.');
    setTimeout(()=>{form.querySelector('[data-review-message]').classList.remove('show');form.hidden=true;root.querySelector('[data-review-open]').hidden=false;},1800);
  }

  function init(root){
    const id=root.dataset.reviewBook;
    if(!id || root.dataset.reviewReady) return;
    root.dataset.reviewReady='1';
    const form=root.querySelector('[data-review-form]');
    root.querySelector('[data-review-open]').addEventListener('click',()=>{form.hidden=false;root.querySelector('[data-review-open]').hidden=true;form.scrollIntoView({behavior:'smooth',block:'center'});});
    root.querySelector('[data-review-cancel]').addEventListener('click',()=>{form.hidden=true;root.querySelector('[data-review-open]').hidden=false;});
    form.querySelectorAll('input[type=range]').forEach(el=>el.addEventListener('input',()=>updateTotal(form)));
    form.addEventListener('submit',e=>{e.preventDefault();submitReview(root,form);});
    updateTotal(form);

    // Отзывы грузим, когда блок почти попал в экран.
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver(entries => {
        if(entries.some(en => en.isIntersecting)){ io.disconnect(); loadPublished(root); }
      }, {rootMargin:'900px 0px'});
      io.observe(root);
    }else{
      loadPublished(root);
    }
  }

  window.NobodyReviewsTemplate=function(o){ return reviewMarkup(o.id,o.title,o.accent); };
  window.NobodyReviews={client,total,CRITERIA,MAX_TOTAL,mount:()=>mount(),refreshAll:()=>document.querySelectorAll('[data-review-book]').forEach(loadPublished)};

  function mount(){
    document.querySelectorAll('[data-review-book]').forEach(root=>{
      if(!root.querySelector('.review-archive-head')){
        const title=root.dataset.reviewTitle||'Отзывы';
        const accent=root.style.getPropertyValue('--review-accent')||'#aaa';
        root.outerHTML=reviewMarkup(root.dataset.reviewBook,title,accent);
      }
    });
    document.querySelectorAll('[data-review-book]').forEach(init);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
})();
