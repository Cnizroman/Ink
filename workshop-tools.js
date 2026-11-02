/* Search, imports, local versions and workspace controls. No executable markup. */
(function(root){
'use strict';
function fileName(title,ext){
  const ru={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  const stem=String(title||'').toLowerCase().replace(/[а-яё]/g,c=>ru[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'chapter';
  return stem+'.'+(['txt','md','json'].includes(ext)?ext:'txt');
}
function matches(text,term,{caseSensitive=false,wholeWord=false}={}){
  if(!term)return [];
  const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),re=new RegExp(escaped,caseSensitive?'gu':'giu'),out=[];
  const word=c=>!!c&&/[\p{L}\p{N}_]/u.test(c);let m;
  while((m=re.exec(text))&&out.length<20000){if(!wholeWord||(!word(text[m.index-1])&&!word(text[m.index+m[0].length])))out.push({start:m.index,end:m.index+m[0].length});}
  return out;
}
function replaceAll(text,found,replacement){let out='',at=0;for(const m of found){out+=text.slice(at,m.start)+replacement;at=m.end;}return out+text.slice(at);}
function parseDraft(raw,json=false){
  const v=json?JSON.parse(raw):{title:'',body:raw,notes:''};
  if(!v||typeof v!=='object'||typeof v.body!=='string'||(v.title!==undefined&&typeof v.title!=='string')||(v.notes!==undefined&&typeof v.notes!=='string'))throw new Error('Некорректный файл черновика.');
  const draft={title:v.title||'',body:v.body.replace(/\r\n/g,'\n'),notes:v.notes||''};
  if(draft.body.length>400000||draft.title.length>160||draft.notes.length>10000)throw new Error('Файл превышает лимиты главы: 400 000 знаков, заголовок 160, заметки 10 000.');
  if(v.readerStyle&&root.InkStory)draft.readerStyle=root.InkStory.clean(v.readerStyle);
  return draft;
}
function outline(text){let offset=0;return text.split('\n').flatMap(line=>{const at=offset;offset+=line.length+1;const m=line.match(/^(#{1,3}) (.+)$/);return m?[{at,level:m[1].length,title:m[2]}]:[];});}
function mount({host,ta,title,notes,key,settings,changed,notify,visualActions,getStyle,setStyle}){
  const esc=root.InkText.escape,$=s=>host.querySelector(s);let disposed=false,activeMatch=-1;
  const options=host.querySelector('.workshop-options');
  options.insertAdjacentHTML('beforeend',`<label class="field">Вид редактора<select id="writerLayout"><option value="split">Текст и предпросмотр</option><option value="stack">Друг под другом</option><option value="text">Только текст</option><option value="preview">Только предпросмотр</option></select></label><label class="field">Тема листа<select id="writerTheme"><option value="dark">Тёмная</option><option value="paper">Бумага</option><option value="light">Светлая</option></select></label><label class="field">Ширина области<input id="writerWidth" type="range" min="640" max="1280" step="40"></label><label class="field check-field"><input id="writerSpellcheck" type="checkbox"> Проверка орфографии</label>`);
  host.querySelector('.editor-tools').insertAdjacentHTML('beforeend',`<label class="inline-color">Цвет текста<input type="color" id="textColor" value="#a67bc4"></label><button type="button" id="applyTextColor">Применить цвет</button><label class="inline-color">Цвет выделения<input type="color" id="highlightColor" value="#e3c98f"></label><button type="button" id="applyHighlightColor">Применить выделение</button><button type="button" id="clearFormatting">Убрать выделения</button>`);
  host.querySelector('.writer-panels').insertAdjacentHTML('beforebegin',`<details class="panel writer-utilities"><summary>Поиск и замена · шаблоны · импорт · версии · структура</summary><div class="writer-utility-grid">
  <section><h3>Поиск и замена</h3><label class="field">Найти<input class="input" id="findTerm" maxlength="1000"></label><label class="field">Заменить на<input class="input" id="replaceTerm" maxlength="10000"></label><div class="action-row"><label><input type="checkbox" id="findCase"> Регистр</label><label><input type="checkbox" id="findWhole"> Целое слово</label></div><p id="findCount" class="small muted" role="status"></p><div class="action-row"><button class="btn ghost sm" type="button" id="findPrev">← Найти</button><button class="btn ghost sm" type="button" id="findNext">Найти →</button><button class="btn ghost sm" type="button" id="replaceOne">Заменить одно</button><button class="btn ghost sm" type="button" id="replaceAll">Заменить всё</button></div></section>
  <section><h3>Шаблоны и структура</h3><label class="field">Вставить шаблон<select id="writerTemplate"><option value="scene">Сцена</option><option value="dialog">Диалог</option><option value="letter">Письмо</option><option value="poem">Стихотворение</option></select></label><button type="button" class="btn ghost sm" id="insertTemplate">Вставить в позицию курсора</button><label class="field">Уровень заголовка<select id="headingLevel"><option value="1">Раздел</option><option value="2" selected>Подраздел</option><option value="3">Подпункт</option></select></label><button type="button" class="btn ghost sm" id="insertHeading">Сделать заголовком</button><nav id="writerOutline" aria-label="Структура главы"></nav></section>
  <section><h3>Импорт и резервная копия</h3><label class="field">Загрузить текст / черновик<input class="input" type="file" id="importDraft" accept=".txt,.md,.json,text/plain,text/markdown,application/json"></label><p class="small muted">TXT, Markdown или JSON-копия мастерской. До 2 МБ, текст до 400 000 знаков. HTML не исполняется.</p><div class="action-row"><button type="button" class="btn ghost sm" id="exportMarkdown">Скачать .md</button><button type="button" class="btn ghost sm" id="exportBackup">Резервная копия .json</button></div></section>
  <section><h3>Локальная история версий</h3><label class="field">Название версии<input id="versionLabel" class="input" maxlength="100" placeholder="Например: до правок диалога"></label><button type="button" class="btn ghost sm" id="saveVersion">Сохранить версию</button><p class="small muted">До 8 версий в этом браузере; общий объём ограничен. Это не публикация и не облачная история.</p><div id="writerVersions"></div></section>
  </div></details>`);
  let versionKey=key+'_versions',versions=[];
  const readVersions=()=>{try{const v=JSON.parse(localStorage.getItem(versionKey)||'[]');versions=Array.isArray(v)?v.slice(-8).filter(x=>{try{parseDraft(JSON.stringify(x),true);return typeof x.id==='string'&&Number.isFinite(x.at);}catch(_){return false;}}):[];}catch(_){versions=[];}};
  const renderVersions=()=>{$('#writerVersions').innerHTML=[...versions].reverse().map(v=>`<div class="version-row"><div><b>${esc(v.label||v.title||'Версия')}</b><span class="small muted">${esc(new Date(v.at).toLocaleString('ru'))} · ${v.body.length} знаков</span></div><button class="btn ghost sm" type="button" data-restore-version="${esc(v.id)}">Восстановить</button><button class="btn ghost sm" type="button" data-delete-version="${esc(v.id)}">Удалить</button></div>`).join('')||'<p class="small muted">Сохранённых версий нет.</p>';};
  const storeVersions=next=>{localStorage.setItem(versionKey,JSON.stringify(next));versions=next;renderVersions();};
  const saveVersion=label=>{const next=[...versions,{...parseDraft(JSON.stringify({title:title.value,body:ta.value,notes:notes.value,readerStyle:getStyle?.()}),true),id:crypto.randomUUID(),at:Date.now(),label:String(label||'').slice(0,100)}].slice(-8);while(next.length>1&&JSON.stringify(next).length>600000)next.shift();storeVersions(next);};
  readVersions();renderVersions();
  const found=()=>matches(ta.value,$('#findTerm').value,{caseSensitive:$('#findCase').checked,wholeWord:$('#findWhole').checked});
  const selectMatch=m=>{ta.focus();ta.setSelectionRange(m.start,m.end);const fraction=ta.value.slice(0,m.start).split('\n').length/Math.max(1,ta.value.split('\n').length);ta.scrollTop=Math.max(0,(ta.scrollHeight-ta.clientHeight)*fraction-ta.clientHeight/4);};
  const findNext=direction=>{const all=found();if(!all.length)return;const current=all.findIndex(m=>m.start===ta.selectionStart&&m.end===ta.selectionEnd);if(current>=0)activeMatch=(current+direction+all.length)%all.length;else if(direction>0){activeMatch=all.findIndex(m=>m.start>=ta.selectionEnd);if(activeMatch<0)activeMatch=0;}else{activeMatch=all.findLastIndex(m=>m.end<=ta.selectionStart);if(activeMatch<0)activeMatch=all.length-1;}selectMatch(all[activeMatch]);};
  const insert=text=>{if(ta.value.length-ta.selectionEnd+ta.selectionStart+text.length>400000)throw new Error('Превышен лимит главы.');ta.setRangeText(text,ta.selectionStart,ta.selectionEnd,'end');ta.focus();changed();};
  const safe=fn=>async()=>{try{await fn();}catch(e){notify(e.message||'Не удалось выполнить действие.',true);}};
  $('#findNext').addEventListener('click',()=>findNext(1));$('#findPrev').addEventListener('click',()=>findNext(-1));
  $('#replaceOne').addEventListener('click',safe(()=>{const all=found();const m=all.find(m=>m.start===ta.selectionStart&&m.end===ta.selectionEnd);if(!m){findNext(1);return;}selectMatch(m);insert($('#replaceTerm').value);}));
  $('#replaceAll').addEventListener('click',safe(()=>{const all=found();if(!all.length)return;if(!confirm('Заменить все совпадения: '+all.length+'?'))return;const value=replaceAll(ta.value,all,$('#replaceTerm').value);if(value.length>400000)throw new Error('Превышен лимит главы.');ta.value=value;changed();notify('Заменено: '+all.length);}));
  $('#saveVersion').addEventListener('click',safe(()=>{saveVersion($('#versionLabel').value);notify('Локальная версия сохранена');}));
  $('#writerVersions').addEventListener('click',e=>{const restore=e.target.closest('[data-restore-version]'),remove=e.target.closest('[data-delete-version]');try{
    if(remove){if(confirm('Удалить только эту локальную версию?'))storeVersions(versions.filter(x=>x.id!==remove.dataset.deleteVersion));return;}
    if(!restore)return;const v=versions.find(x=>x.id===restore.dataset.restoreVersion);if(!v||!confirm('Восстановить версию? Текущее состояние сохранится в истории.'))return;saveVersion('Перед восстановлением');title.value=v.title;ta.value=v.body;notes.value=v.notes;if(v.readerStyle)setStyle?.(v.readerStyle);changed();notify('Версия восстановлена в редактор, но ещё не опубликована');
  }catch(err){notify(err.message,true);}});
  const templates={scene:'## Новая сцена\n\nМесто и время.\n\nДействие.\n\n---\n\n',dialog:':::dialog Персонаж\n— Реплика.\n\n— Ответ.\n:::\n\n',letter:'## Письмо\n\n> Дорогой читатель,\n> \n> Текст письма.\n\n',poem:'## Название\n\nПервая строка\nВторая строка\n\nНовая строфа\n\n'};
  $('#insertTemplate').addEventListener('click',safe(()=>insert('\n\n'+templates[$('#writerTemplate').value])));
  $('#insertHeading').addEventListener('click',safe(()=>insert('\n\n'+'#'.repeat(Number($('#headingLevel').value))+' '+(ta.value.slice(ta.selectionStart,ta.selectionEnd)||'Заголовок')+'\n\n')));
  $('#applyTextColor').addEventListener('click',safe(()=>{if(visualActions?.isActive())return visualActions.color($('#textColor').value,false);insert(`{color:${$('#textColor').value}}${ta.value.slice(ta.selectionStart,ta.selectionEnd)||'текст'}{/color}`);}));
  $('#applyHighlightColor').addEventListener('click',safe(()=>{if(visualActions?.isActive())return visualActions.color($('#highlightColor').value,true);insert(`{mark:${$('#highlightColor').value}}${ta.value.slice(ta.selectionStart,ta.selectionEnd)||'текст'}{/mark}`);}));
  $('#clearFormatting').addEventListener('click',safe(()=>{if(visualActions?.isActive())return visualActions.clear();if(ta.selectionStart===ta.selectionEnd)return;const text=ta.value.slice(ta.selectionStart,ta.selectionEnd).replace(/\{(?:color|mark):#[0-9a-f]{6}\}|\{\/(?:color|mark)\}/gi,'').replace(/\*\*|__|~~|==|\*/g,'');insert(text);}));
  $('#importDraft').addEventListener('change',safe(async()=>{
    const file=$('#importDraft').files?.[0];if(!file)return;
    try{if(file.size>2*1024*1024||!/\.(txt|md|json)$/i.test(file.name))throw new Error('Выберите TXT, MD или JSON до 2 МБ.');const draft=parseDraft(await file.text(),/\.json$/i.test(file.name));if(disposed)return;
      if((ta.value||title.value||notes.value)&&!confirm('Заменить содержимое редактора? Текущая версия сохранится в истории.'))return;
      if(ta.value||title.value||notes.value)saveVersion('Перед импортом');ta.value=draft.body;if(draft.title)title.value=draft.title;else if(!title.value)title.value=file.name.replace(/\.[^.]+$/,'').slice(0,160);if(/\.json$/i.test(file.name))notes.value=draft.notes;if(draft.readerStyle)setStyle?.(draft.readerStyle);changed();notify('Файл импортирован. Проверьте текст перед публикацией.');
    }finally{$('#importDraft').value='';}
  }));
  const download=(content,ext,type)=>{const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=fileName(title.value,ext);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#exportMarkdown').addEventListener('click',()=>download(ta.value,'md','text/markdown;charset=utf-8'));
  $('#exportBackup').addEventListener('click',()=>download(JSON.stringify({format:'chernila-draft-v1',title:title.value,body:ta.value,notes:notes.value,readerStyle:getStyle?.()},null,2),'json','application/json'));
  const applySettings=()=>{
    settings.layout=['split','stack','text','preview'].includes(settings.layout)?settings.layout:(settings.preview?'split':'text');settings.theme=['dark','paper','light'].includes(settings.theme)?settings.theme:'dark';settings.width=Math.max(640,Math.min(1280,Number(settings.width)||1280));settings.spellcheck=settings.spellcheck!==false;
    host.querySelector('.writer-panels').dataset.layout=settings.layout;host.querySelector('.writer-panels').classList.remove('without-preview');host.querySelector('.workshop').dataset.theme=settings.theme;host.style.setProperty('--writer-measure',settings.width+'px');ta.spellcheck=settings.spellcheck;
    $('#writerLayout').value=settings.layout;$('#writerTheme').value=settings.theme;$('#writerWidth').value=settings.width;$('#writerSpellcheck').checked=settings.spellcheck;
  };
  // Use explicit handlers so checkbox and range values retain their types.
  ['writerLayout','writerTheme','writerWidth','writerSpellcheck'].forEach(id=>$('#'+id).addEventListener('input',()=>{settings.layout=$('#writerLayout').value;settings.theme=$('#writerTheme').value;settings.width=+$('#writerWidth').value;settings.spellcheck=$('#writerSpellcheck').checked;settings.preview=settings.layout!=='text';applySettings();try{localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));}catch(_){notify('Настройки рабочего места не сохранены: нет места в браузере.',true);}}));
  $('#togglePreview').addEventListener('click',()=>{settings.layout=settings.preview?'split':'text';applySettings();try{localStorage.setItem('chernila_workshop_settings',JSON.stringify(settings));}catch(_){}});
  const update=()=>{applySettings();const list=found();$('#findCount').textContent=list.length?'Совпадений: '+list.length+(list.length===20000?' (лимит)':''):'Совпадений нет';$('#writerOutline').innerHTML=outline(ta.value).map(h=>`<button class="outline-item level-${h.level}" type="button" data-jump="${h.at}">${esc(h.title)}</button>`).join('')||'<p class="small muted">Добавьте заголовки — здесь появится структура главы.</p>';};
  ['findTerm','findCase','findWhole'].forEach(id=>$('#'+id).addEventListener('input',update));
  $('#writerOutline').addEventListener('click',e=>{const b=e.target.closest('[data-jump]');if(!b)return;if(settings.layout==='preview'){settings.layout='split';applySettings();}selectMatch({start:+b.dataset.jump,end:+b.dataset.jump});});
  ta.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();try{if(e.shiftKey){const start=ta.value.lastIndexOf('\n',ta.selectionStart-1)+1;if(ta.value.slice(start,start+2)==='  '){ta.setRangeText('',start,start+2,'end');changed();}}else insert('  ');}catch(err){notify(err.message,true);}}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('.writer-utilities').open=true;$('#findTerm').focus();}});
  update();
  return {update,afterSaved(id){if(!id||!key.endsWith('_new'))return;const nextKey=key.slice(0,-3)+id+'_versions';try{if(versions.length)localStorage.setItem(nextKey,JSON.stringify(versions));localStorage.removeItem(versionKey);versionKey=nextKey;}catch(_){notify('Глава сохранена, но историю версий перенести не удалось.',true);}},dispose(){disposed=true;}};
}
const api={fileName,matches,replaceAll,parseDraft,outline,mount};root.InkWorkshopTools=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
