/* «Где нас нет»: the server releases the key, not a client-side boolean. */
(() => {
  'use strict';
  const form=document.getElementById('book3AccessForm');
  if(!form)return;
  const gate=document.getElementById('book3Gate'),status=document.getElementById('book3AccessStatus');
  const button=form.querySelector('button'),input=form.elements.password;
  const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  let opened=false,voiceURL=null,bookRoot=null;
  const offline=()=>navigator.serviceWorker?.register('sw.js').catch(()=>{});
  if(document.readyState==='complete')offline();else window.addEventListener('load',offline,{once:true});
  async function request(url,options={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try {
      const response=await fetch(url,{...options,signal:controller.signal,cache:'no-store',credentials:'omit'});
      if(!response.ok)throw new Error('Сервер недоступен. Попробуйте позже.');
      return new Uint8Array(await response.arrayBuffer());
    } finally {clearTimeout(timer);}
  }
  async function decrypt(part,key,aad) {
    return crypto.subtle.decrypt({name:'AES-GCM',iv:decode(part.iv),additionalData:new TextEncoder().encode(aad)},key,decode(part.data));
  }
  function mountVoice(root,payload,key) {
    const box=root.querySelector('[data-final-voice]');if(!box)return;
    const audio=box.querySelector('audio'),play=box.querySelector('.final-voice-play');
    audio.removeAttribute('src');audio.preload='none';
    const feedback=box.querySelector('.final-voice-status'),current=box.querySelector('.final-voice-current');
    const duration=box.querySelector('.final-voice-duration'),bars=[...box.querySelectorAll('.final-voice-wave i')];
    const fmt=sec=>!Number.isFinite(sec)?'0:00':Math.floor(sec/60)+':'+String(Math.floor(sec%60)).padStart(2,'0');
    const paint=()=>{current.textContent=fmt(audio.currentTime);bars.forEach((bar,i)=>bar.classList.toggle('active',!!audio.duration&&i/bars.length<audio.currentTime/audio.duration));};
    play.addEventListener('click',async()=>{
      play.disabled=true;
      try {
        if(!audio.src){
          feedback.textContent='Открываем голосовое…';
          const bytes=await decrypt(payload.voice,key,payload.aad+':audio');
          if(!root.isConnected)return;
          voiceURL=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));audio.src=voiceURL;
        }
        if(audio.paused){await audio.play();play.textContent='❚❚';play.setAttribute('aria-label','Поставить голосовое на паузу');feedback.textContent='идёт воспроизведение';}
        else audio.pause();
      }catch{feedback.textContent='Не удалось открыть голосовое. Попробуйте ещё раз.';}
      finally{play.disabled=false;}
    });
    audio.addEventListener('loadedmetadata',()=>duration.textContent=fmt(audio.duration));
    audio.addEventListener('timeupdate',paint);
    audio.addEventListener('pause',()=>{if(!audio.ended){play.textContent='▶';feedback.textContent='приостановлено';}});
    audio.addEventListener('ended',()=>{play.textContent='↻';feedback.textContent='сообщение завершено';paint();root.querySelector('[data-message-unfinished]')?.classList.add('visible');});
    bars.forEach((bar,i)=>bar.addEventListener('click',()=>{if(audio.duration){audio.currentTime=audio.duration*i/bars.length;paint();}}));
    audio.addEventListener('error',()=>feedback.textContent='Не удалось воспроизвести голосовое.');
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled||opened)return;
    button.disabled=true;status.textContent='Проверяем доступ…';
    try {
      if(!globalThis.crypto?.subtle)throw new Error('Для защищённого чтения нужен современный браузер и HTTPS.');
      const config=window.CHERNILA_SUPABASE_CONFIG;
      if(!config?.url||!config.publishableKey)throw new Error('Защита временно недоступна.');
      const bytes=await request(config.url+'/rest/v1/rpc/unlock_legacy_book',{
        method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},
        body:JSON.stringify({p_password:input.value})
      });
      input.value='';
      const access=JSON.parse(new TextDecoder().decode(bytes));
      if(access.error)throw new Error(({incorrect_password:'Неверный пароль.',rate_limit:'Слишком много попыток. Попробуйте через 5 минут.',unavailable:'История временно недоступна.',password_not_set:'Старые коды отключены. Автору нужно назначить новый пароль в мастерской.'})[access.error]||'Доступ не подтверждён.');
      if(!/^[a-f0-9]{64}$/.test(access.key)||!/^[a-f0-9]{64}$/.test(access.asset_id))throw new Error('Сервер не подтвердил доступ.');
      status.textContent='Открываем историю…';
      const encrypted=await request('assets/protected/book3-'+access.asset_id+'.json');
      if(hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encrypted)))!==access.asset_id)throw new Error('Не удалось проверить целостность истории.');
      const payload=JSON.parse(new TextDecoder().decode(encrypted));
      if(payload.v!==1||payload.aad!=='ink:book3:v1')throw new Error('Неподдерживаемая версия истории.');
      const key=await crypto.subtle.importKey('raw',Uint8Array.from(access.key.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['decrypt']);
      access.key='';
      const plaintext=await decrypt(payload.document,key,payload.aad+':text');
      const template=document.createElement('template');template.innerHTML=new TextDecoder().decode(plaintext);
      if(!template.content.querySelector('main')||template.content.querySelector('script,iframe,object,embed'))throw new Error('Некорректный формат истории.');
      bookRoot=document.createElement('div');bookRoot.id='book-content';bookRoot.className='container book-content visible';
      bookRoot.append(template.content);
      mountVoice(bookRoot,payload,key);
      const lock=document.createElement('button');lock.type='button';lock.className='reader-lock-again';lock.textContent='Закрыть историю';
      lock.addEventListener('click',()=>{bookRoot.querySelectorAll('audio').forEach(a=>a.pause());bookRoot.remove();if(voiceURL)URL.revokeObjectURL(voiceURL);location.reload();});
      bookRoot.prepend(lock);gate.replaceWith(bookRoot);opened=true;document.title='Где нас нет · Трилогия';
      // No reader controls or reader script exist until the authenticated decryption succeeds.
      const reader=document.createElement('script');reader.src='script.js';document.body.append(reader);
    } catch(error) {
      status.textContent=error.name==='AbortError'?'Сервер не ответил вовремя. Попробуйте ещё раз.':error instanceof TypeError?'Нет соединения с сервером. Проверьте сеть.':error.name==='OperationError'?'Не удалось расшифровать историю. Обратитесь к автору.':error.message;
    } finally {input.value='';button.disabled=false;}
  });
  window.addEventListener('pagehide',()=>{
    bookRoot?.querySelectorAll('audio').forEach(a=>a.pause());bookRoot?.remove();
    if(voiceURL)URL.revokeObjectURL(voiceURL);
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
})();
