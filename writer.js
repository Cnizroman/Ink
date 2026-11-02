/* Chapter workshop. Drafts are isolated by account, work and chapter. */
window.InkWriter={mount({host,work,chapter,chapterId,userId,save,onSaved,notify,requiresReview=false,saveStyle}){
  const esc=InkText.escape, key=`chernila_workshop_${userId}_${work.id}_${chapterId}`;
  let settings={size:20,leading:1.8,font:'serif',goal:1000,preview:true};
  try{settings={...settings,...JSON.parse(localStorage.getItem('chernila_workshop_settings')||'{}')};}catch(_){}
  const original={title:chapter?.title||'',body:chapter?.body||'',notes:''};
  let backup=null;try{backup=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
  if(!backup&&!chapter){const old=localStorage.getItem('chernila_draft_'+work.id);if(old)backup={title:'',body:old,notes:''};}
  host.innerHTML=`<div class="workshop"><div class="workshop-heading"><div><div class="kicker">Мастерская · ${esc(work.title)}</div><h1>${chapter?'Редактирование главы':'Новая глава'}</h1></div><a class="btn ghost sm" href="#/studio/work/${work.id}">← К произведению</a></div>
  <div class="panel draft-recovery" id="draftRecovery" ${backup&&(backup.body!==original.body||backup.title!==original.title||backup.notes||(backup.readerStyle&&JSON.stringify(InkStory.clean(backup.readerStyle))!==JSON.stringify(InkStory.clean(work.readerStyle))))?'':'hidden'}><b>Есть локальная несохранённая версия.</b> <button class="btn sm" type="button" id="restoreDraft">Восстановить</button> <button class="btn ghost sm" type="button" id="discardDraft">Удалить локальную версию</button></div>
  <form id="chapterForm" class="stack">
    <label class="field">Заголовок главы *<input class="input" name="title" maxlength="160" required value="${esc(original.title)}"></label>
    <div class="writer-modebar" role="group" aria-label="Режим редактора"><button class="btn sm" type="button" id="visualMode" aria-pressed="true">Визуальный редактор</button><button class="btn ghost sm" type="button" id="sourceMode" aria-pressed="false">Разметка</button><span class="small muted">Пишите как в обычном документе</span></div>
    <details class="panel creative-palette"><summary>Добавить красивый блок · страницы, сцены и разделители</summary><p class="small muted">26 типов блоков, отдельные страницы и разные разделители внутри одной главы. Оформление сохраняется для читателей.</p><label class="field">Найти блок<input class="input" id="creativeSearch" type="search" placeholder="Письмо, страница, цитата…"></label><div class="creative-blocks">${[...Object.entries(InkText.blockTypes),['divider','Разделитель сцен'],['pagebreak','Разрыв страницы']].map(([type,label])=>`<button type="button" data-creative="${type}"><b>${label}</b><span>Добавить в текст →</span></button>`).join('')}</div></details>
    <details class="panel author-design"><summary>Оформление для читателей · конструктор страниц и типографики</summary><p class="small muted">Это стиль произведения, а не личная тема сайта. Он сохраняется вместе с главой. Читатель сможет выбрать свою тему чтения.</p><div id="storyDesigner"></div></details>
    <div class="editor-tools" role="toolbar" aria-label="Форматирование текста">
    ${[['bold','Жирный · Ctrl+B'],['italic','Курсив · Ctrl+I'],['underline','Подчёркивание · Ctrl+U'],['strike','Зачёркивание'],['mark','Выделение цветом'],['heading','Заголовок'],['quote','Цитата'],['list','Список'],['numbered','Нумерация'],['dialog','Диалоговое окно'],['note','Примечание'],['spoiler','Спойлер'],['align','Выравнивание'],['divider','Разделитель сцен'],['undo','↶ Отменить'],['redo','↷ Повторить']].map(([id,title])=>`<button type="button" data-format="${id}" title="${title}">${title.split(' · ')[0]}</button>`).join('')}</div>
    <div class="workshop-options panel"><label class="field">Шрифт<select id="writerFont">${InkStory.fontOptions()}</select></label><label class="field">Размер<input id="writerSize" type="number" min="14" max="32" value="${Number(settings.size)||20}"></label><label class="field">Интервал<select id="writerLeading"><option>1.4</option><option>1.8</option><option>2.2</option></select></label><label class="field">Цель, слов<input id="writerGoal" type="number" min="1" max="100000" value="${Number(settings.goal)||1000}"></label><button class="btn ghost sm" id="togglePreview" type="button">Предпросмотр</button><button class="btn ghost sm" id="toggleFocus" type="button">Режим фокуса</button></div>
    <div class="writer-panels"><label class="field">Текст<textarea class="input editor" id="bodyEd" name="body" maxlength="400000" spellcheck="true" placeholder="Начните историю…">${esc(original.body)}</textarea></label><section class="writer-preview" aria-label="Предпросмотр главы"><div class="kicker">Так увидит читатель</div><div id="chapterPreview" class="reader-text"></div></section></div>
    <div class="writer-status" role="status"><span id="wordCount"></span><span id="draftStatus">Изменений нет</span></div><progress id="writingGoal" max="100" value="0" aria-label="Прогресс к цели"></progress>
    <details class="panel"><summary>Заметки автора · видны только в этом браузере</summary><textarea class="input" id="writerNotes" rows="4" maxlength="10000" placeholder="План сцены, персонажи, что проверить перед публикацией…"></textarea></details>
    <div class="action-row"><button class="btn" type="submit" name="st" value="published">${requiresReview?'Отправить на проверку':chapter?.status==='published'?'Сохранить публикацию':'Опубликовать главу'}</button><button class="btn ghost" type="submit" name="st" value="draft">Сохранить черновик</button><button class="btn dark" type="button" id="exportDraft">Скачать текст .txt</button></div>
    <p class="small muted">Выделите текст и выберите оформление. HTML не исполняется. Предпросмотр использует ту же разметку, что и читалка. Автосохранение — локальное; кнопки выше сохраняют главу в аккаунте.</p>
  </form>
  <dialog id="writerDialog" class="writer-dialog" aria-labelledby="writerDialogTitle"><form method="dialog" class="stack"><h2 id="writerDialogTitle">Вставить блок</h2><label class="field">Заголовок / имя говорящего<input class="input" id="blockTitle" maxlength="100"></label><label class="field">Содержимое<textarea class="input" id="blockBody" rows="6"></textarea></label><label class="field" id="pageLayoutField" hidden>Вид отдельной страницы<select id="blockPageLayout"><option value="inherit">Как у произведения</option>${InkStory.layouts.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="field" id="dividerField" hidden>Разделитель<select id="blockDivider">${InkStory.dividers.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><small>Свои символы задаются в конструкторе оформления.</small></label><label class="field" id="alignmentField" hidden>Выравнивание<select id="blockAlignment"><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label><div class="action-row"><button class="btn" value="insert">Вставить</button><button class="btn ghost" value="cancel" formnovalidate>Отмена</button></div></form></dialog></div>`;
  const $=s=>host.querySelector(s),ta=$('#bodyEd'),title=$('[name=title]'),notes=$('#writerNotes'),dialog=$('#writerDialog');
  notes.value=localStorage.getItem(key+'_notes')||'';
  let tools=null;
  let timer,dirty=false,disposed=false,clean=false,history=[{body:ta.value,start:0,end:0}],pos=0,pendingBlock='',selection=[0,0];
  const snapshot=()=>({title:title.value,body:ta.value,notes:notes.value,readerStyle:designer.read(),at:Date.now()});
  let visual=null,visualMode=true,styleDirty=false;
  const designer=InkStory.mount($('#storyDesigner'),work.readerStyle,()=>{styleDirty=true;changed(true);});
  const persist=()=>{clearTimeout(timer);if(!dirty||clean)return;try{localStorage.setItem(key,JSON.stringify(snapshot()));$('#draftStatus').textContent='Локальная версия сохранена · '+new Date().toLocaleTimeString('ru');}catch(_){$('#draftStatus').textContent='Не удалось сохранить локально. Скачайте текст.';}};
  const remember=()=>{if(history[pos]?.body===ta.value)return;history=history.slice(0,pos+1);history.push({body:ta.value,start:ta.selectionStart,end:ta.selectionEnd});if(history.length>100)history.shift();pos=history.length-1;};
  const redraw=()=>{
    const count=ta.value.trim().split(/\s+/).filter(Boolean).length;
    $('#wordCount').textContent=`${count} слов · ${ta.value.length} знаков · ~${Math.max(1,Math.round(count/180))} мин · цель ${settings.goal} слов`;
    $('#writingGoal').value=Math.min(100,count/Math.max(1,settings.goal)*100);
    $('#chapterPreview').innerHTML=InkText.render(ta.value,work.type==='poetry');InkStory.apply($('#chapterPreview'),designer.read());
    $('.writer-panels').classList.toggle('without-preview',!settings.preview);
    const fonts=InkStory.fonts;
    if(visual)InkStory.apply(visual.el,designer.read());
    [ta,...(visual?[visual.el]:[])].forEach(el=>{el.style.fontFamily=fonts[settings.font]||fonts.serif;el.style.fontSize=Math.min(32,Math.max(14,Number(settings.size)||20))+'px';el.style.lineHeight=String(settings.leading);});
    $('#togglePreview').setAttribute('aria-pressed',String(settings.preview));tools?.update();
  };
  const changed=(fromVisual=false)=>{if(fromVisual!==true)visual?.render();dirty=true;clean=false;$('#draftStatus').textContent='Изменения…';remember();redraw();clearTimeout(timer);timer=setTimeout(persist,400);};
  const replace=(text)=>{if(visualMode){visual.insert(text);return;}ta.setRangeText(text,selection[0],selection[1],'end');ta.focus();changed();};
  visual=InkVisual.mount({host,ta,poetry:work.type==='poetry',onChange:e=>{if(e?.message){notify(e.message,true);return;}changed(true);}});
  const setMode=mode=>{if(!mode&&visualMode)visual.sync();visualMode=mode;visual.clearSelection();ta.parentElement.hidden=mode;visual.el.hidden=!mode;$('#visualMode').setAttribute('aria-pressed',String(mode));$('#sourceMode').setAttribute('aria-pressed',String(!mode));if(mode)visual.render();};
  $('#visualMode').addEventListener('click',()=>setMode(true));$('#sourceMode').addEventListener('click',()=>setMode(false));setMode(true);
  ta.addEventListener('input',()=>changed());title.addEventListener('input',()=>changed());notes.addEventListener('input',()=>changed());
  const openBlock=type=>{
    pendingBlock=type;selection=[ta.selectionStart,ta.selectionEnd];
    if(type==='pagebreak'){replace('\n\n===page===\n\n');return;}
    $('#writerDialogTitle').textContent=InkText.blockTypes[type]||{divider:'Разделитель сцен',align:'Выравнивание блока'}[type];
    $('#blockTitle').parentElement.hidden=['align','divider'].includes(type);$('#blockBody').parentElement.hidden=type==='divider';$('#blockTitle').value='';$('#blockBody').value=visualMode?(getSelection()?.toString()||''):ta.value.slice(...selection);
    $('#alignmentField').hidden=type!=='align';$('#pageLayoutField').hidden=type!=='page';$('#dividerField').hidden=type!=='divider';$('#blockPageLayout').value='inherit';$('#blockDivider').value=designer.read().divider;dialog.returnValue='cancel';dialog.showModal();
  };
  host.querySelectorAll('[data-creative]').forEach(b=>b.addEventListener('click',()=>openBlock(b.dataset.creative)));
  $('#creativeSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLocaleLowerCase('ru');host.querySelectorAll('[data-creative]').forEach(b=>b.hidden=!b.textContent.toLocaleLowerCase('ru').includes(q));});
  const format=kind=>{
    if(kind==='undo'||kind==='redo'){pos=Math.max(0,Math.min(history.length-1,pos+(kind==='undo'?-1:1)));const s=history[pos];ta.value=s.body;ta.setSelectionRange(s.start,s.end);dirty=true;clean=false;visual?.render();redraw();persist();if(visualMode)visual.restore();else ta.focus();return;}
    if(visualMode&&visual.command(kind))return;
    selection=[ta.selectionStart,ta.selectionEnd];const text=(visualMode?getSelection()?.toString():ta.value.slice(...selection))||'текст';
    if(['dialog','note','spoiler','align','divider'].includes(kind)){openBlock(kind);return;}
    const wraps={bold:'**',italic:'*',underline:'__',strike:'~~',mark:'=='};
    if(wraps[kind])replace(wraps[kind]+text+wraps[kind]);
    else if(kind==='heading')replace('\n\n## '+text+'\n\n');
    else if(kind==='quote')replace('\n\n'+text.split('\n').map(l=>'> '+l).join('\n')+'\n\n');
    else replace('\n\n'+text.split('\n').map((l,i)=>(kind==='numbered'?`${i+1}. `:'- ')+l).join('\n')+'\n\n');
  };
  host.querySelector('.editor-tools').addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault();});
  host.querySelectorAll('[data-format]').forEach(b=>b.addEventListener('click',()=>format(b.dataset.format)));
  dialog.addEventListener('close',()=>{if(!disposed&&dialog.returnValue==='insert'){
    if(pendingBlock==='divider'){replace('\n\n---{'+$('#blockDivider').value+'}\n\n');return;}
    const type=pendingBlock==='align'?$('#blockAlignment').value:pendingBlock==='page'&&$('#blockPageLayout').value!=='inherit'?'page['+$('#blockPageLayout').value+']':pendingBlock;
    const caption=$('#blockTitle').value.replace(/\n/g,' '),body=$('#blockBody').value.replace(/^:::/gm,'：：：');
    replace(`\n\n:::${type}${pendingBlock!=='align'&&caption?' '+caption:''}\n${body}\n:::\n\n`);
  }});
  const shortcuts=e=>{if(!(e.ctrlKey||e.metaKey))return;const key=e.key.toLowerCase(),map={b:'bold',i:'italic',u:'underline',z:e.shiftKey?'redo':'undo',y:'redo'};if(map[key]){e.preventDefault();format(map[key]);}};ta.addEventListener('keydown',shortcuts);visual.el.addEventListener('keydown',shortcuts);
  $('#restoreDraft').addEventListener('click',()=>{if(!backup)return;title.value=backup.title||'';ta.value=backup.body||'';notes.value=backup.notes||'';if(backup.readerStyle){designer.set(backup.readerStyle);styleDirty=true;}$('#draftRecovery').hidden=true;changed();});
  $('#discardDraft').addEventListener('click',()=>{localStorage.removeItem(key);localStorage.removeItem('chernila_draft_'+work.id);backup=null;$('#draftRecovery').hidden=true;});
  $('#writerFont').value=settings.font;$('#writerLeading').value=String(settings.leading);
  for(const [id,prop] of [['writerFont','font'],['writerSize','size'],['writerLeading','leading'],['writerGoal','goal']])$('#'+id).addEventListener('change',e=>{settings[prop]=prop==='font'?e.target.value:Math.max(1,Number(e.target.value)||1);redraw();localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));});
  $('#togglePreview').addEventListener('click',()=>{settings.preview=!settings.preview;redraw();localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));});
  $('#toggleFocus').addEventListener('click',()=>{const on=document.body.classList.toggle('writer-focus');$('#toggleFocus').setAttribute('aria-pressed',String(on));});
  $('#exportDraft').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([title.value+'\n\n'+ta.value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=InkWorkshopTools.fileName(title.value,'txt');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('#chapterForm').addEventListener('submit',async e=>{
    e.preventDefault();if(visualMode)visual.sync();const status=e.submitter?.value||'draft';
    if(!title.value.trim()||!ta.value.trim()){notify('Заполните заголовок и текст главы',true);return;}
    if(status==='published'&&!confirm(requiresReview?'Отправить главу на проверку? Произведение будет скрыто от читателей до одобрения администратором.':'Опубликовать эту версию главы для читателей?'))return;
    const buttons=[...host.querySelectorAll('#chapterForm > .action-row [type=submit],#chapterForm button[value=draft],#chapterForm button[value=published]')];buttons.forEach(b=>b.disabled=true);persist();
    try{if(styleDirty&&saveStyle){await saveStyle(designer.read());styleDirty=false;}const saved=await save({title:title.value.trim(),body:ta.value,status});clean=true;dirty=false;clearTimeout(timer);
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
  host.addEventListener('click',e=>{if(e.target.closest('.writer-utilities button,.writer-utilities input[type=file]'))setMode(false);},true);
  tools=InkWorkshopTools.mount({host,ta,title,notes,key,settings,changed,notify,getStyle:()=>designer.read(),setStyle:v=>{designer.set(v);styleDirty=true;},visualActions:{isActive:()=>visualMode,color:(hex,mark)=>visual.color(hex,mark),clear:()=>visual.clear()}});
  const extra=document.createElement('details');extra.className='advanced-format';extra.innerHTML='<summary>Дополнительное форматирование</summary><div></div>';const extraBody=extra.querySelector('div');host.querySelector('.editor-tools').append(extra);host.querySelectorAll('.editor-tools [data-format]').forEach(b=>{if(['underline','strike','mark','numbered','note','spoiler','align','divider'].includes(b.dataset.format))extraBody.append(b);});host.querySelectorAll('.editor-tools .inline-color,.editor-tools #applyTextColor,.editor-tools #applyHighlightColor,.editor-tools #clearFormatting').forEach(el=>extraBody.append(el));
  const workspace=document.createElement('details');workspace.className='workspace-settings';workspace.innerHTML='<summary>Настройки рабочего места · шрифт, вид, ширина и цель</summary>';const options=host.querySelector('.workshop-options');options.before(workspace);workspace.append(options);host.querySelector('.writer-modebar').append($('#togglePreview'),$('#toggleFocus'));
  const unload=()=>persist();addEventListener('pagehide',unload);redraw();
  return ()=>{persist();disposed=true;visual?.dispose();designer.dispose();tools?.dispose();clearTimeout(timer);removeEventListener('pagehide',unload);document.body.classList.remove('writer-focus');if(dialog.open)dialog.close();};
}};
