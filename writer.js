/* Chapter workshop. Drafts are isolated by account, work and chapter. */
window.InkWriter={mount({host,work,chapter,chapterId,userId,save,onSaved,notify}){
  const esc=InkText.escape, key=`chernila_workshop_${userId}_${work.id}_${chapterId}`;
  let settings={size:20,leading:1.8,font:'serif',goal:1000,preview:true};
  try{settings={...settings,...JSON.parse(localStorage.getItem('chernila_workshop_settings')||'{}')};}catch(_){}
  const original={title:chapter?.title||'',body:chapter?.body||'',notes:''};
  let backup=null;try{backup=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
  if(!backup&&!chapter){const old=localStorage.getItem('chernila_draft_'+work.id);if(old)backup={title:'',body:old,notes:''};}
  host.innerHTML=`<div class="workshop"><div class="workshop-heading"><div><div class="kicker">Мастерская · ${esc(work.title)}</div><h1>${chapter?'Редактирование главы':'Новая глава'}</h1></div><a class="btn ghost sm" href="#/studio/work/${work.id}">← К произведению</a></div>
  <div class="panel draft-recovery" id="draftRecovery" ${backup&&(backup.body!==original.body||backup.title!==original.title||backup.notes)?'':'hidden'}><b>Есть локальная несохранённая версия.</b> <button class="btn sm" type="button" id="restoreDraft">Восстановить</button> <button class="btn ghost sm" type="button" id="discardDraft">Удалить локальную версию</button></div>
  <form id="chapterForm" class="stack">
    <label class="field">Заголовок главы *<input class="input" name="title" maxlength="160" required value="${esc(original.title)}"></label>
    <div class="editor-tools" role="toolbar" aria-label="Форматирование текста">
    ${[['bold','Жирный · Ctrl+B'],['italic','Курсив · Ctrl+I'],['underline','Подчёркивание · Ctrl+U'],['strike','Зачёркивание'],['mark','Выделение цветом'],['heading','Заголовок'],['quote','Цитата'],['list','Список'],['numbered','Нумерация'],['dialog','Диалоговое окно'],['note','Примечание'],['spoiler','Спойлер'],['align','Выравнивание'],['divider','Разделитель сцен'],['undo','↶ Отменить'],['redo','↷ Повторить']].map(([id,title])=>`<button type="button" data-format="${id}" title="${title}">${title.split(' · ')[0]}</button>`).join('')}</div>
    <div class="workshop-options panel"><label class="field">Шрифт<select id="writerFont"><option value="serif">Книжный</option><option value="sans">Без засечек</option><option value="mono">Моноширинный</option></select></label><label class="field">Размер<input id="writerSize" type="number" min="14" max="32" value="${Number(settings.size)||20}"></label><label class="field">Интервал<select id="writerLeading"><option>1.4</option><option>1.8</option><option>2.2</option></select></label><label class="field">Цель, слов<input id="writerGoal" type="number" min="1" max="100000" value="${Number(settings.goal)||1000}"></label><button class="btn ghost sm" id="togglePreview" type="button">Предпросмотр</button><button class="btn ghost sm" id="toggleFocus" type="button">Режим фокуса</button></div>
    <div class="writer-panels"><label class="field">Текст<textarea class="input editor" id="bodyEd" name="body" maxlength="400000" spellcheck="true" placeholder="Начните историю…">${esc(original.body)}</textarea></label><section class="writer-preview" aria-label="Предпросмотр главы"><div class="kicker">Так увидит читатель</div><div id="chapterPreview" class="reader-text"></div></section></div>
    <div class="writer-status" role="status"><span id="wordCount"></span><span id="draftStatus">Изменений нет</span></div><progress id="writingGoal" max="100" value="0" aria-label="Прогресс к цели"></progress>
    <details class="panel"><summary>Заметки автора · видны только в этом браузере</summary><textarea class="input" id="writerNotes" rows="4" maxlength="10000" placeholder="План сцены, персонажи, что проверить перед публикацией…"></textarea></details>
    <div class="action-row"><button class="btn" type="submit" name="st" value="published">${chapter?.status==='published'?'Сохранить публикацию':'Опубликовать главу'}</button><button class="btn ghost" type="submit" name="st" value="draft">Сохранить черновик</button><button class="btn dark" type="button" id="exportDraft">Скачать текст .txt</button></div>
    <p class="small muted">Выделите текст и выберите оформление. HTML не исполняется. Предпросмотр использует ту же разметку, что и читалка. Автосохранение — локальное; кнопки выше сохраняют главу в аккаунте.</p>
  </form>
  <dialog id="writerDialog" class="writer-dialog" aria-labelledby="writerDialogTitle"><form method="dialog" class="stack"><h2 id="writerDialogTitle">Вставить блок</h2><label class="field">Заголовок / имя говорящего<input class="input" id="blockTitle" maxlength="100"></label><label class="field">Содержимое<textarea class="input" id="blockBody" rows="6"></textarea></label><label class="field" id="alignmentField" hidden>Выравнивание<select id="blockAlignment"><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label><div class="action-row"><button class="btn" value="insert">Вставить</button><button class="btn ghost" value="cancel" formnovalidate>Отмена</button></div></form></dialog></div>`;
  const $=s=>host.querySelector(s),ta=$('#bodyEd'),title=$('[name=title]'),notes=$('#writerNotes'),dialog=$('#writerDialog');
  notes.value=localStorage.getItem(key+'_notes')||'';
  let tools=null;
  let timer,dirty=false,disposed=false,clean=false,history=[{body:ta.value,start:0,end:0}],pos=0,pendingBlock='',selection=[0,0];
  const snapshot=()=>({title:title.value,body:ta.value,notes:notes.value,at:Date.now()});
  const persist=()=>{clearTimeout(timer);if(!dirty||clean)return;try{localStorage.setItem(key,JSON.stringify(snapshot()));$('#draftStatus').textContent='Локальная версия сохранена · '+new Date().toLocaleTimeString('ru');}catch(_){$('#draftStatus').textContent='Не удалось сохранить локально. Скачайте текст.';}};
  const remember=()=>{if(history[pos]?.body===ta.value)return;history=history.slice(0,pos+1);history.push({body:ta.value,start:ta.selectionStart,end:ta.selectionEnd});if(history.length>100)history.shift();pos=history.length-1;};
  const redraw=()=>{
    const count=ta.value.trim().split(/\s+/).filter(Boolean).length;
    $('#wordCount').textContent=`${count} слов · ${ta.value.length} знаков · ~${Math.max(1,Math.round(count/180))} мин · цель ${settings.goal} слов`;
    $('#writingGoal').value=Math.min(100,count/Math.max(1,settings.goal)*100);
    $('#chapterPreview').innerHTML=InkText.render(ta.value,work.type==='poetry');
    $('.writer-panels').classList.toggle('without-preview',!settings.preview);
    const fonts={serif:'var(--body)',sans:'var(--ui)',mono:'monospace'};
    [ta,$('#chapterPreview')].forEach(el=>{el.style.fontFamily=fonts[settings.font]||fonts.serif;el.style.fontSize=Math.min(32,Math.max(14,Number(settings.size)||20))+'px';el.style.lineHeight=String(settings.leading);});
    $('#togglePreview').setAttribute('aria-pressed',String(settings.preview));tools?.update();
  };
  const changed=()=>{dirty=true;clean=false;$('#draftStatus').textContent='Изменения…';remember();redraw();clearTimeout(timer);timer=setTimeout(persist,400);};
  const replace=(text)=>{ta.setRangeText(text,selection[0],selection[1],'end');ta.focus();changed();};
  ta.addEventListener('input',changed);title.addEventListener('input',changed);notes.addEventListener('input',changed);
  const format=kind=>{
    if(kind==='undo'||kind==='redo'){pos=Math.max(0,Math.min(history.length-1,pos+(kind==='undo'?-1:1)));const s=history[pos];ta.value=s.body;ta.setSelectionRange(s.start,s.end);dirty=true;clean=false;redraw();persist();ta.focus();return;}
    selection=[ta.selectionStart,ta.selectionEnd];const text=ta.value.slice(...selection)||'текст';
    if(['dialog','note','spoiler','align'].includes(kind)){
      pendingBlock=kind;$('#writerDialogTitle').textContent={dialog:'Диалоговое окно',note:'Примечание',spoiler:'Скрываемый спойлер',align:'Выравнивание блока'}[kind];
      $('#blockTitle').value='';$('#blockBody').value=ta.value.slice(...selection);$('#alignmentField').hidden=kind!=='align';$('#blockTitle').parentElement.hidden=kind==='align';dialog.returnValue='cancel';dialog.showModal();return;
    }
    const wraps={bold:'**',italic:'*',underline:'__',strike:'~~',mark:'=='};
    if(wraps[kind])replace(wraps[kind]+text+wraps[kind]);
    else if(kind==='divider')replace('\n\n---\n\n');
    else if(kind==='heading')replace('\n\n## '+text+'\n\n');
    else if(kind==='quote')replace('\n\n'+text.split('\n').map(l=>'> '+l).join('\n')+'\n\n');
    else replace('\n\n'+text.split('\n').map((l,i)=>(kind==='numbered'?`${i+1}. `:'- ')+l).join('\n')+'\n\n');
  };
  host.querySelectorAll('[data-format]').forEach(b=>b.addEventListener('click',()=>format(b.dataset.format)));
  dialog.addEventListener('close',()=>{if(!disposed&&dialog.returnValue==='insert'){
    const type=pendingBlock==='align'?$('#blockAlignment').value:pendingBlock;
    const caption=$('#blockTitle').value.replace(/\n/g,' '),body=$('#blockBody').value.replace(/^:::/gm,'：：：');
    replace(`\n\n:::${type}${pendingBlock!=='align'&&caption?' '+caption:''}\n${body}\n:::\n\n`);
  }});
  ta.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey))return;const key=e.key.toLowerCase(),map={b:'bold',i:'italic',u:'underline',z:e.shiftKey?'redo':'undo',y:'redo'};if(map[key]){e.preventDefault();format(map[key]);}});
  $('#restoreDraft').addEventListener('click',()=>{if(!backup)return;title.value=backup.title||'';ta.value=backup.body||'';notes.value=backup.notes||'';$('#draftRecovery').hidden=true;changed();});
  $('#discardDraft').addEventListener('click',()=>{localStorage.removeItem(key);localStorage.removeItem('chernila_draft_'+work.id);backup=null;$('#draftRecovery').hidden=true;});
  $('#writerFont').value=settings.font;$('#writerLeading').value=String(settings.leading);
  for(const [id,prop] of [['writerFont','font'],['writerSize','size'],['writerLeading','leading'],['writerGoal','goal']])$('#'+id).addEventListener('change',e=>{settings[prop]=prop==='font'?e.target.value:Math.max(1,Number(e.target.value)||1);redraw();localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));});
  $('#togglePreview').addEventListener('click',()=>{settings.preview=!settings.preview;redraw();localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));});
  $('#toggleFocus').addEventListener('click',()=>{const on=document.body.classList.toggle('writer-focus');$('#toggleFocus').setAttribute('aria-pressed',String(on));});
  $('#exportDraft').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([title.value+'\n\n'+ta.value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=InkWorkshopTools.fileName(title.value,'txt');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('#chapterForm').addEventListener('submit',async e=>{
    e.preventDefault();const status=e.submitter?.value||'draft';
    if(!title.value.trim()||!ta.value.trim()){notify('Заполните заголовок и текст главы',true);return;}
    if(status==='published'&&!confirm('Опубликовать эту версию главы для читателей?'))return;
    const buttons=[...host.querySelectorAll('[type=submit]')];buttons.forEach(b=>b.disabled=true);persist();
    try{const saved=await save({title:title.value.trim(),body:ta.value,status});clean=true;dirty=false;clearTimeout(timer);
      // Retain private planning notes but not an outdated chapter backup.
      try{localStorage.removeItem(key);
      const notesKey=`chernila_workshop_${userId}_${work.id}_${saved?.id||chapterId}_notes`;
      if(notes.value)localStorage.setItem(notesKey,notes.value);else localStorage.removeItem(notesKey);
      if(notesKey!==key+'_notes')localStorage.removeItem(key+'_notes');
      localStorage.removeItem('chernila_draft_'+work.id);}
      catch(_){notify('Глава сохранена, но локальные заметки обновить не удалось. Скачайте резервную копию.',true);}
      tools?.afterSaved(saved?.id);if(!disposed)onSaved(status);
    }catch(err){notify('Глава не сохранена: '+err.message,true);buttons.forEach(b=>b.disabled=false);}
  });
  tools=InkWorkshopTools.mount({host,ta,title,notes,key,settings,changed,notify});
  const unload=()=>persist();addEventListener('pagehide',unload);redraw();
  return ()=>{persist();disposed=true;tools?.dispose();clearTimeout(timer);removeEventListener('pagehide',unload);document.body.classList.remove('writer-focus');if(dialog.open)dialog.close();};
}};
