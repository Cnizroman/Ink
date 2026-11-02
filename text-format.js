/* Safe, shared text format for the workshop preview and reader. No raw HTML. */
(function(root){
'use strict';
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
    const block=line.match(/^:::(dialog|note|spoiler|left|center|right|scene|letter|document|system|memory|dream|epigraph|poem|chat|warning|choice)(?: (.*))?$/);
    if(block){
      const body=[];i++;let nested=0;while(i<lines.length){if(lines[i]===':::'){if(!nested)break;nested--;}else if(/^:::[a-z]+(?: |$)/.test(lines[i]))nested++;body.push(lines[i++]);}if(lines[i]===':::')i++;
      const content=render(body.join('\n'),poetry||block[1]==='poem',depth+1), title=inline(block[2]||({dialog:'Диалог',note:'Примечание',spoiler:'Спойлер',choice:'Подробнее',scene:'Новая сцена',letter:'Письмо',document:'Документ',system:'Сообщение системы',memory:'Воспоминание',dream:'Сон',epigraph:'Эпиграф',poem:'Стихотворение',chat:'Переписка',warning:'Предупреждение'}[block[1]]||''));
      if(['spoiler','choice'].includes(block[1]))out.push(`<details class="text-spoiler${block[1]==='choice'?' text-choice':''}"><summary>${title}</summary>${content}</details>`);
      else if(['left','center','right'].includes(block[1]))out.push(`<div class="text-align-${block[1]}">${content}</div>`);
      else out.push(`<aside class="text-${block[1]}"><div class="text-block-title">${title}</div>${content}</aside>`);
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
    while(i<lines.length&&lines[i].trim()&&!/^(:::|#{1,3} |> |- |\d+\. |---$)/.test(lines[i]))p.push(lines[i++]);
    out.push(`<p>${inline(p.join('\n')).replace(/\n/g,'<br>')}</p>`);
  }
  return out.join('');
}
const api={render,escape:esc};root.InkText=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
