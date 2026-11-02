/* Safe, shared text format for the workshop preview and reader. No raw HTML. */
(function(root){
'use strict';
const design=root.InkStory||(typeof module!=='undefined'?require('./story-tools.js'):null);
const freedom=root.InkFreedom||(typeof module!=='undefined'?require('./workshop-freedom.js'):null);
const blockTypes={dialog:'Диалог',window:'Всплывающее окно',note:'Примечание',spoiler:'Спойлер',choice:'Раскрываемый вариант',scene:'Новая сцена',letter:'Письмо',document:'Документ',system:'Сообщение системы',memory:'Воспоминание',dream:'Сон',epigraph:'Эпиграф',poem:'Стихотворение',chat:'Переписка',warning:'Предупреждение',page:'Отдельная страница',card:'Карточка',timeline:'Линия времени',report:'Отчёт',footnote:'Сноска',annotation:'Комментарий на полях',location:'Место и время',code:'Лог / код',verse:'Строфа',question:'Вопрос',answer:'Ответ',pullquote:'Выносная цитата'};
const dividerIds=design?.dividers.map(d=>d[0])||['stars','line','diamond'],pageLayouts=design?.layouts.map(p=>p[0])||['sheet'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){
  return esc(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>')
    .replace(/__([^_\n]+)__/g,'<u>$1</u>').replace(/~~([^~\n]+)~~/g,'<del>$1</del>')
    .replace(/==([^=\n]+)==/g,'<mark>$1</mark>')
    .replace(/\{color:(#[0-9a-f]{6})\}([\s\S]*?)\{\/color\}/gi,'<span style="color:$1">$2</span>')
    .replace(/\{mark:(#[0-9a-f]{6})\}([\s\S]*?)\{\/mark\}/gi,'<mark style="background-color:$1;color:#181818">$2</mark>');
}
function render(text,poetry=false,depth=0){
  if(depth>5) return esc(text);
  const lines=String(text||'').replace(/\r\n/g,'\n').split('\n'), out=[];
  for(let i=0;i<lines.length;){
    const line=lines[i];
    if(!line.trim()){if(poetry)out.push('<span class="line">&nbsp;</span>');i++;continue;}
    if(line.trim()==='===page==='){out.push('<div class="text-pagebreak" role="separator" aria-label="Новая страница" contenteditable="false"></div>');i++;continue;}
    const imageDivider=line.trim().match(/^---\{asset:([0-9a-f-]{36})\}$/i);if(imageDivider&&freedom?.uuid.test(imageDivider[1])){out.push(`<hr data-divider-asset="${imageDivider[1].toLowerCase()}" aria-label="Авторский разделитель">`);i++;continue;}
    const divider=line.trim().match(/^---\{([a-z]+)\}$/);
    if(divider&&dividerIds.includes(divider[1])){out.push(`<hr data-divider="${divider[1]}" aria-label="Разделитель сцен">`);i++;continue;}
    const header=line.match(/^:::([a-z]+)(?:\[([a-z]+)\])?(?:\{([A-Za-z0-9_-]{1,2048})\})?(?: (.*))?$/);
    const block=header&&(Object.hasOwn(blockTypes,header[1])||['left','center','right'].includes(header[1]))&&(!header[2]||(header[1]==='page'&&pageLayouts.includes(header[2])))?header:null;
    if(block){
      const body=[];i++;let nested=0;while(i<lines.length){if(lines[i]===':::'){if(!nested)break;nested--;}else if(/^:::[a-z]+(?:\[[a-z]+\])?(?:\{[A-Za-z0-9_-]+\})?(?: |$)/.test(lines[i]))nested++;body.push(lines[i++]);}if(lines[i]===':::')i++;
      const content=render(body.join('\n'),poetry||['poem','verse','code'].includes(block[1]),depth+1),title=inline(block[4]||blockTypes[block[1]]),box=block[3]?freedom?.boxDecode(block[3]):null,attrs=box?` data-box="${freedom.boxEncode(box)}" style="${freedom.boxCSS(box)}"`:'',icon=box?.icon?`<span class="text-box-icon">${inline(box.icon)}</span>`:'',footer=box?.footer?`<div class="text-box-footer">${inline(box.footer)}</div>`:'';
      if(['spoiler','choice'].includes(block[1]))out.push(`<details class="text-spoiler${block[1]==='choice'?' text-choice':''}"${attrs}><summary>${icon}${title}</summary>${content}${footer}</details>`);
      else if(block[1]==='window')out.push(`<aside class="text-window"${attrs}><div class="text-block-title"><button type="button" data-story-open>${title}</button></div><dialog class="story-custom-modal" aria-label="${esc(block[4]||blockTypes[block[1]])}"><div class="text-window-caption">${icon}${title}</div><div class="text-window-body">${content}${footer}</div><button type="button" data-story-close>Закрыть</button></dialog></aside>`);
      else if(['left','center','right'].includes(block[1]))out.push(`<div class="text-align-${block[1]}">${content}</div>`);
      else if(block[1]==='page')out.push(`<section class="text-page"${attrs}${block[2]?` data-page-layout="${block[2]}"`:''}><div class="text-block-title">${icon}${title}</div>${content}${footer}</section>`);
      else out.push(`<aside class="text-${block[1]}"${attrs}><div class="text-block-title">${icon}${title}</div>${content}${footer}</aside>`);
      continue;
    }
    if(line.trim()==='---'){out.push('<hr>');i++;continue;}
    if(/^#{1,3} /.test(line)){const level=line.match(/^#+/)[0].length+1;out.push(`<h${level}>${inline(line.replace(/^#{1,3} /,''))}</h${level}>`);i++;continue;}
    if(line.startsWith('> ')){const q=[];while(i<lines.length&&lines[i].startsWith('> '))q.push(lines[i++].slice(2));out.push(`<blockquote>${inline(q.join('\n')).replace(/\n/g,'<br>')}</blockquote>`);continue;}
    if(/^(- |\d+\. )/.test(line)){
      const ordered=/^\d/.test(line),items=[];const re=ordered?/^\d+\. /:/^- /;
      while(i<lines.length&&re.test(lines[i]))items.push(`<li>${inline(lines[i++].replace(re,''))}</li>`);
      out.push(`<${ordered?'ol':'ul'}>${items.join('')}</${ordered?'ol':'ul'}>`);continue;
    }
    if(poetry){out.push(`<span class="line">${inline(line)}</span>`);i++;continue;}
    const p=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!/^(:::|#{1,3} |> |- |\d+\. |---(?:\{[a-z]+(?::[0-9a-f-]+)?\})?$|===page===$)/.test(lines[i]))p.push(lines[i++]);
    out.push(`<p>${inline(p.join('\n')).replace(/\n/g,'<br>')}</p>`);
  }
  return out.join('');
}
const api={render,escape:esc,blockTypes,dividerIds,pageLayouts};root.InkText=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
