/* Personal interface palettes, scoped to the signed-in account in this browser. */
(function(root){
'use strict';
const presets=[
 {id:'ink',label:'Чернила',background:'#0a0908',panel:'#161310',text:'#ece5d8',accent:'#c8a96e'},
 {id:'paper',label:'Бумага',background:'#f4efe5',panel:'#ffffff',text:'#29251f',accent:'#79551d'},
 {id:'ocean',label:'Ночной океан',background:'#081520',panel:'#102332',text:'#e2eff8',accent:'#78c9eb'},
 {id:'forest',label:'Лес',background:'#0b1711',panel:'#14281e',text:'#e7f0df',accent:'#9bce9f'},
 {id:'plum',label:'Слива',background:'#190f22',panel:'#291b35',text:'#f2e8fa',accent:'#cba2e5'}
];
const fields={background:'Фон сайта',panel:'Карточки и панели',text:'Основной текст',accent:'Кнопки и акценты'};
const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
const mix=(a,b,t)=>'#'+rgb(a).map((x,i)=>Math.round(x*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');
function luminance(hex){return rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function clean(input={}){return Object.fromEntries(Object.keys(fields).map(k=>{const v=input[k];if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw new Error('Используйте цвета в формате #RRGGBB.');return [k,v.toLowerCase()];}));}
function validate(input){const p=clean(input);if(contrast(p.text,p.background)<4.5||contrast(p.text,p.panel)<4.5)throw new Error('Текст сливается с фоном. Увеличьте контраст текста и панелей.');if(contrast(p.accent,p.background)<4.5||contrast(p.accent,p.panel)<4.5)throw new Error('Акцент сливается с фоном. Выберите более контрастный цвет.');return p;}
function variables(input){const p=validate(input),readable=c=>Math.min(contrast(c,p.background),contrast(c,p.panel))>=4.5?c:p.text;return {'--bg':p.background,'--bg2':mix(p.background,p.panel,.4),'--panel':p.panel,'--panel2':mix(p.panel,p.text,.06),'--text':p.text,'--muted':readable(mix(p.background,p.text,.72)),'--faint':readable(mix(p.background,p.text,.58)),'--gold':p.accent,'--gold2':readable(mix(p.accent,p.text,.2)),'--ink':contrast(p.accent,'#000000')>=contrast(p.accent,'#ffffff')?'#000000':'#ffffff','--line':mix(p.panel,p.text,.16),'--line2':mix(p.panel,p.text,.28),'--site-bg-rgb':rgb(p.background).join(','),'--site-accent-rgb':rgb(p.accent).join(',')};}
let activeId;
const key=id=>'chernila_site_theme_'+encodeURIComponent(id||'guest');
function load(id){try{const saved=localStorage.getItem(key(id));if(saved)return validate(JSON.parse(saved));}catch(_){}return clean(presets[0]);}
function apply(input){const p=validate(input);if(typeof document!=='undefined'){for(const [k,v] of Object.entries(variables(p)))document.documentElement.style.setProperty(k,v);document.documentElement.dataset.siteTheme='personal';document.documentElement.style.colorScheme=luminance(p.background)>.4?'light':'dark';}return p;}
function activate(id){id=id||null;if(id===activeId)return;activeId=id;apply(load(id));}
function save(input,id){const p=validate(input);localStorage.setItem(key(id),JSON.stringify(p));activeId=id||null;apply(p);if(typeof document!=='undefined'&&typeof CustomEvent!=='undefined')document.dispatchEvent(new CustomEvent('ink-theme-saved',{detail:{id:activeId,palette:p}}));return p;}
function mount(host,id,notify){
 id=id||null;
 let disposed=false,saved=load(id);activate(id);
 host.innerHTML=`<section class="panel personal-theme"><div class="kicker">Только для вас</div><h2>Цвета сайта</h2><p class="muted">Меняют весь интерфейс только у вас. Сохраняются отдельно для каждого аккаунта в этом браузере; оформление публичного профиля других посетителей не меняется.</p><div class="theme-presets" role="group" aria-label="Готовые темы">${presets.map(p=>`<button type="button" class="btn ghost sm" data-theme-preset="${p.id}" aria-pressed="false"><span class="theme-swatch" style="background:${p.background};border-color:${p.accent}"></span>${p.label}</button>`).join('')}</div><form id="siteThemeForm"><div class="grid two">${Object.entries(fields).map(([name,label])=>`<label class="field">${label}<input type="color" name="${name}" value="${saved[name]}"></label>`).join('')}</div><div class="action-row"><button class="btn" type="submit">Сохранить цвета сайта</button><button class="btn ghost" type="button" id="cancelSiteTheme">Отменить изменения</button><button class="btn dark" type="button" id="resetSiteTheme">Стандартные цвета</button></div><p id="siteThemeStatus" class="small muted" role="status"></p></form></section>`;
 const form=host.querySelector('form'),status=host.querySelector('[role=status]');
 const read=()=>Object.fromEntries(Object.keys(fields).map(k=>[k,form.elements[k].value]));
 const mark=p=>host.querySelectorAll('[data-theme-preset]').forEach(b=>b.setAttribute('aria-pressed',String(Object.keys(fields).every(k=>presets.find(x=>x.id===b.dataset.themePreset)[k]===p[k]))));
 const fill=p=>{for(const k of Object.keys(fields))form.elements[k].value=p[k];mark(p);};
 const preview=()=>{try{const p=apply(read());mark(p);status.textContent='Предпросмотр всего сайта. Нажмите «Сохранить цвета сайта».';}catch(e){status.textContent=e.message;}};
 form.addEventListener('input',preview);form.addEventListener('change',preview);
 host.addEventListener('click',e=>{const b=e.target.closest('[data-theme-preset]');if(!b)return;try{saved=save(presets.find(p=>p.id===b.dataset.themePreset),id);fill(saved);status.textContent='Тема применена и сохранена.';}catch(err){fill(saved);apply(saved);status.textContent='Не удалось сохранить тему: '+err.message;notify(status.textContent,true);}});
 form.addEventListener('submit',e=>{e.preventDefault();try{if(activeId!==id)throw new Error('Аккаунт изменился. Откройте настройки заново.');const p=validate(read());saved=save(p,id);status.textContent='Цвета сайта сохранены для этого аккаунта.';notify('Личная тема сохранена');}catch(err){status.textContent=err.message;notify('Тема не сохранена: '+err.message,true);}});
 host.querySelector('#cancelSiteTheme').addEventListener('click',()=>{fill(saved);apply(saved);status.textContent='Несохранённые изменения отменены.';});
 host.querySelector('#resetSiteTheme').addEventListener('click',()=>{fill(presets[0]);preview();});fill(saved);
 const external=e=>{if(e.detail.id===id){saved=e.detail.palette;fill(saved);status.textContent='Тема применена и сохранена.';}};document.addEventListener?.('ink-theme-saved',external);
 return {dispose(){document.removeEventListener?.('ink-theme-saved',external);if(disposed)return;disposed=true;if(activeId===id)apply(load(id));}};
}
const api={presets,clean,validate,contrast,variables,load,apply,activate,save,mount};root.InkTheme=api;if(typeof module!=='undefined')module.exports=api;
if(typeof document!=='undefined'){try{activate(JSON.parse(localStorage.getItem('chernila_session_v2')||'null')?.authorId);}catch(_){activate(null);}}
})(typeof window!=='undefined'?window:globalThis);
