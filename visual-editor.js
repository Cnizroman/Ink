/* Visual surface <-> safe Ink text. No raw user HTML is stored or pasted. */
(function(root){'use strict';
const hex=v=>{if(/^#[0-9a-f]{6}$/i.test(v))return v.toLowerCase();const m=String(v).match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);return m?'#'+m.slice(1).map(n=>(+n).toString(16).padStart(2,'0')).join(''):null;};
const blocks=['dialog','note','scene','letter','document','system','memory','dream','epigraph','poem','chat','warning'];
function serialize(node){
 const walk=n=>{
  if(n.nodeType===3)return n.textContent.replace(/\u00a0/g,' ');if(n.nodeType!==1)return '';
  const tag=n.tagName;if(['SCRIPT','STYLE','IFRAME','OBJECT','IMG','SVG','VIDEO','AUDIO'].includes(tag))return '';
  const kids=()=>[...n.childNodes].map(walk).join(''),body=()=>kids().trim();
  if(tag==='BR')return '\n';if(tag==='HR')return '\n\n---\n\n';
  if(['SPAN','FONT','MARK'].includes(tag)){let out=kids(),fg=hex(n.getAttribute('color')||n.style.color||''),bg=hex(n.style.backgroundColor||'');if(fg)out=`{color:${fg}}${out}{/color}`;if(bg)out=`{mark:${bg}}${out}{/mark}`;if(fg||bg)return out;}
  const wrap={STRONG:'**',B:'**',EM:'*',I:'*',U:'__',S:'~~',STRIKE:'~~',DEL:'~~',MARK:'=='}[tag];if(wrap){const content=kids();if(!content)return '';let out=wrap+content+wrap,fg=hex(n.style.color||''),bg=hex(n.style.backgroundColor||'');if(fg)out=`{color:${fg}}${out}{/color}`;if(bg)out=`{mark:${bg}}${out}{/mark}`;return out;}
  if(/^H[234]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1])-1)+' '+body()+'\n\n';
  if(tag==='UL'||tag==='OL')return '\n\n'+[...n.children].filter(el=>el.tagName==='LI').map((el,i)=>(tag==='UL'?'- ':`${i+1}. `)+[...el.childNodes].map(walk).join('').trim()).join('\n')+'\n\n';
  if(tag==='BLOCKQUOTE')return '\n\n'+body().split('\n').map(l=>'> '+l).join('\n')+'\n\n';
  const kind=blocks.find(k=>n.classList.contains('text-'+k));
  if(kind){const title=n.querySelector(':scope > .text-block-title'),content=[...n.childNodes].filter(el=>el!==title).map(walk).join('').trim();return `\n\n:::${kind}${title?' '+title.textContent.replace(/\n/g,' '):''}\n${content}\n:::\n\n`;}
  if(tag==='DETAILS'){const title=n.querySelector(':scope > summary'),kind=n.classList.contains('text-choice')?'choice':'spoiler',content=[...n.childNodes].filter(el=>el!==title).map(walk).join('').trim();return `\n\n:::${kind} ${title?.textContent.replace(/\n/g,' ')||'Подробнее'}\n${content}\n:::\n\n`;}
  const alignment=['left','center','right'].find(a=>n.classList.contains('text-align-'+a));if(alignment)return `\n\n:::${alignment}\n${body()}\n:::\n\n`;
  if(tag==='SPAN'&&n.classList.contains('line'))return kids()+'\n';

  if(tag==='P'||tag==='DIV')return '\n\n'+body()+'\n\n';return kids();
 };
 return [...node.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
}
function mount({host,ta,onChange,poetry=false}){
 const el=document.createElement('div');el.className='visual-manuscript reader-text';el.contentEditable='true';el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');el.setAttribute('aria-label','Текст истории — визуальный редактор');el.dataset.placeholder='Начните писать. Оформление выбирается кнопками — код знать не нужно.';ta.parentElement.after(el);
 const controls=document.createElement('div');controls.className='visual-block-actions';controls.hidden=true;controls.innerHTML='<span class="small"></span><button type="button" class="btn ghost sm" data-block-move="up">↑ Выше</button><button type="button" class="btn ghost sm" data-block-move="down">↓ Ниже</button><button type="button" class="btn danger sm" data-block-move="delete">Удалить блок</button>';el.before(controls);
 let selectedBlock=null;
 const clearSelection=()=>{selectedBlock?.removeAttribute('data-editor-selected');selectedBlock=null;controls.hidden=true;};
 el.addEventListener('click',e=>{clearSelection();const block=e.target.closest('aside,details');if(!block||!el.contains(block))return;selectedBlock=block;block.dataset.editorSelected='true';controls.querySelector('span').textContent=block.querySelector('.text-block-title,summary')?.textContent||'Блок';controls.hidden=false;});
 controls.addEventListener('mousedown',e=>e.preventDefault());
 controls.addEventListener('click',e=>{const action=e.target.closest('[data-block-move]')?.dataset.blockMove,b=selectedBlock;if(!action||!b||!el.contains(b))return;if(action==='delete'){if(!confirm('Удалить этот блок? Действие можно отменить.'))return;b.remove();}else{let neighbor=action==='up'?b.previousElementSibling:b.nextElementSibling;while(neighbor&&neighbor.matches('p,div')&&!neighbor.textContent.trim())neighbor=action==='up'?neighbor.previousElementSibling:neighbor.nextElementSibling;if(neighbor){if(action==='up')b.parentNode.insertBefore(b,neighbor);else b.parentNode.insertBefore(b,neighbor.nextSibling);}}sync();render();});
 let range=null,disposed=false;
 const render=()=>{clearSelection();el.innerHTML=root.InkText.render(ta.value,poetry);el.querySelectorAll('details').forEach(d=>d.open=true);};
 const capture=()=>{const s=getSelection();if(s?.rangeCount&&el.contains(s.anchorNode)&&el.contains(s.focusNode))range=s.getRangeAt(0).cloneRange();};
 const restore=()=>{el.focus();const s=getSelection();if(range&&el.contains(range.commonAncestorContainer)){s.removeAllRanges();s.addRange(range);}else{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r);}};
 const sync=()=>{const text=serialize(el);if(text.length>400000){render();throw new Error('Лимит главы — 400 000 знаков.');}ta.value=text;capture();onChange();};
 el.addEventListener('input',()=>{try{sync();}catch(e){onChange(e);}});
 el.addEventListener('paste',e=>{e.preventDefault();restore();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
 el.addEventListener('drop',e=>e.preventDefault());document.addEventListener('selectionchange',capture);
 render();
 return {el,render,clearSelection,capture,restore,sync,color(value,highlight=false){restore();document.execCommand('styleWithCSS',false,true);document.execCommand(highlight?'hiliteColor':'foreColor',false,value);sync();},clear(){restore();document.execCommand('removeFormat');sync();},command(kind){restore();if(kind==='undo'||kind==='redo')return false;const commands={bold:'bold',italic:'italic',underline:'underline',strike:'strikeThrough',undo:'undo',redo:'redo',list:'insertUnorderedList',numbered:'insertOrderedList',heading:'formatBlock',quote:'formatBlock',mark:'hiliteColor'};if(!commands[kind])return false;document.execCommand('styleWithCSS',false,false);document.execCommand(commands[kind],false,kind==='heading'?'h3':kind==='quote'?'blockquote':kind==='mark'?'#e3c98f':null);sync();return true;},insert(markup){restore();const r=getSelection().getRangeAt(0);r.deleteContents();let top=r.startContainer;while(top!==el&&top.parentNode!==el)top=top.parentNode;if(top!==el&&top.nodeType===1)r.setStartAfter(top);r.collapse(true);const template=document.createElement('template');template.innerHTML=root.InkText.render(markup,poetry)+'<p><br></p>';const last=template.content.lastChild;r.insertNode(template.content);const caret=document.createRange();caret.selectNodeContents(last);caret.collapse(true);getSelection().removeAllRanges();getSelection().addRange(caret);el.querySelectorAll('details').forEach(d=>d.open=true);sync();},dispose(){if(disposed)return;disposed=true;document.removeEventListener('selectionchange',capture);controls.remove();el.remove();}};
}
const api={serialize,mount};root.InkVisual=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
