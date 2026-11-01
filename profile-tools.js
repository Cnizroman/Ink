/* Profile media and social-network helpers. URLs are generated internally. */
(function(root){
'use strict';
const networks=[
  {id:'telegram',label:'Telegram',hosts:['t.me','telegram.me'],base:'https://t.me/',hint:'@username',provider:null},
  {id:'vk',label:'ВКонтакте',hosts:['vk.com','vk.ru'],base:'https://vk.com/',hint:'Короткое имя или id',provider:null},
  {id:'youtube',label:'YouTube',hosts:['youtube.com','youtu.be'],base:'https://www.youtube.com/@',hint:'@канал',provider:null},
  {id:'instagram',label:'Instagram',hosts:['instagram.com'],base:'https://www.instagram.com/',hint:'@username',provider:null},
  {id:'github',label:'GitHub',hosts:['github.com'],base:'https://github.com/',hint:'username',provider:'github'},
  {id:'discord',label:'Discord',hosts:['discord.com'],base:'https://discord.com/users/',hint:'Числовой ID пользователя',provider:'discord'},
  {id:'twitch',label:'Twitch',hosts:['twitch.tv'],base:'https://www.twitch.tv/',hint:'username',provider:'twitch'},
  {id:'twitter',label:'X / Twitter',hosts:['x.com','twitter.com'],base:'https://x.com/',hint:'@username',provider:'twitter'},
  {id:'facebook',label:'Facebook',hosts:['facebook.com'],base:'https://www.facebook.com/',hint:'Имя страницы',provider:'facebook'},
  {id:'linkedin',label:'LinkedIn',hosts:['linkedin.com'],base:'https://www.linkedin.com/in/',hint:'Имя профиля',provider:'linkedin_oidc'}
];
const providers=n=>n.provider==='twitter'?['twitter','x']:n.provider?[n.provider]:[];
function identityLink(n,identity){
  const data=identity?.identity_data||{};let value='';
  if(['github','twitch','twitter'].includes(n.id))value=data.user_name||data.preferred_username||'';
  if(n.id==='discord'){const id=String(data.provider_id||data.sub||data.id||'');if(/^\d{15,22}$/.test(id))value=id;}
  if(n.id==='facebook'){const id=String(data.provider_id||data.sub||data.id||'');if(/^\d+$/.test(id))value='https://www.facebook.com/profile.php?id='+id;}
  if(n.id==='linkedin')value=data.vanity_name||data.public_profile_url||'';
  try{return value?socialLink(n.id,value):null;}catch(_){return null;}
}
function socialLink(network,value){
  const n=networks.find(n=>n.id===network);if(!n)throw new Error('Выберите соцсеть из списка.');
  value=String(value||'').trim();if(!value)throw new Error('Укажите имя профиля или ссылку.');
  let url;
  if(/^https:\/\//i.test(value)){try{url=new URL(value);}catch(_){throw new Error('Некорректная ссылка.');}}
  else{const handle=value.replace(/^@/,'');if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(handle))throw new Error('Укажите короткое имя профиля или полную HTTPS-ссылку.');url=new URL(n.base+encodeURIComponent(handle));}
  if(url.username||url.password||url.port||!n.hosts.some(h=>url.hostname===h||url.hostname.endsWith('.'+h))||url.href.length>1000)throw new Error('Ссылка должна вести на выбранную соцсеть.');
  return {network:n.id,url:url.href};
}
function cleanSocialLinks(list){
  if(!Array.isArray(list))return [];
  if(list.length>10)throw new Error('Можно добавить до 10 соцсетей.');
  const seen=new Set();return list.map(x=>{const r=socialLink(x.network,x.url);if(seen.has(r.network))throw new Error('Эта соцсеть уже добавлена.');seen.add(r.network);return r;});
}
function validateImage(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Выберите PNG, JPEG или WebP. SVG и другие форматы не принимаются.');
  if(!file.size||file.size>12*1024*1024)throw new Error('Размер исходного файла — от 1 байта до 12 МБ.');
}
function cropRect(width,height,targetWidth,targetHeight,x=50,y=50,zoom=1){
  if(![width,height,targetWidth,targetHeight].every(n=>Number.isFinite(n)&&n>0))throw new Error('Не удалось прочитать размеры изображения.');
  const cover=Math.max(targetWidth/width,targetHeight/height)*Math.min(3,Math.max(1,Number(zoom)||1));
  const w=targetWidth/cover,h=targetHeight/cover;
  return {sx:(width-w)*Math.max(0,Math.min(100,x))/100,sy:(height-h)*Math.max(0,Math.min(100,y))/100,sw:w,sh:h};
}
async function decode(file){
  validateImage(file);const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const matches=file.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  if(!matches)throw new Error('Содержимое файла не соответствует формату изображения.');
  let image;
  if(typeof createImageBitmap==='function')image=await createImageBitmap(file);
  else{const url=URL.createObjectURL(file);try{image=new Image();image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}}
  if(!image.width||!image.height||image.width*image.height>24000000){image.close?.();throw new Error('Изображение слишком большое: не более 24 мегапикселей.');}
  return image;
}
function mountMedia(host,slot,existing,onChange,onError){
  const avatar=slot==='avatarUrl',label=avatar?'Аватар':'Обложка профиля';
  host.innerHTML=`<div class="media-picker"><div class="media-picker-heading"><b>${label}</b><button type="button" class="btn ghost sm" data-remove>Удалить изображение</button></div><label class="field">Выбрать файл с устройства<input class="input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="${label}: выбрать файл"></label><canvas width="${avatar?512:1600}" height="${avatar?512:500}" class="media-canvas ${avatar?'avatar-crop':'banner-crop'}" aria-label="Предпросмотр кадрирования" hidden></canvas><div class="media-crop-controls" hidden><label class="field">Горизонталь<input type="range" data-crop="x" min="0" max="100" value="50"></label><label class="field">Вертикаль<input type="range" data-crop="y" min="0" max="100" value="50"></label><label class="field">Масштаб<input type="range" data-crop="zoom" min="1" max="3" step="0.05" value="1"></label></div><p class="small muted" role="status">PNG, JPEG или WebP · до 12 МБ. Кадрирование и сжатие выполняются перед сохранением.</p></div>`;
  const canvas=host.querySelector('canvas'),status=host.querySelector('[role=status]'),input=host.querySelector('input[type=file]'),controls=host.querySelector('.media-crop-controls');
  let image=null,removed=false,current=existing||'',busy=false,revision=0,disposed=false,dirty=false;
  const draw=()=>{if(!image)return;const values=Object.fromEntries([...host.querySelectorAll('[data-crop]')].map(el=>[el.dataset.crop,+el.value]));const r=cropRect(image.width,image.height,canvas.width,canvas.height,values.x,values.y,values.zoom),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,r.sx,r.sy,r.sw,r.sh,0,0,canvas.width,canvas.height);dirty=true;removed=false;onChange();};
  input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;const version=++revision;busy=true;status.textContent='Проверка изображения…';
    try{const decoded=await decode(file);if(disposed||version!==revision){decoded.close?.();return;}image?.close?.();image=decoded;host.querySelectorAll('[data-crop]').forEach(el=>el.value=el.dataset.crop==='zoom'?'1':'50');canvas.hidden=false;controls.hidden=false;draw();status.textContent=`${file.name} · ${image.width} × ${image.height}. Изменения ещё не сохранены.`;}
    catch(e){if(!disposed&&version===revision){input.value='';status.textContent=e.message;onError(e.message);}}finally{if(version===revision)busy=false;}
  });
  host.querySelectorAll('[data-crop]').forEach(el=>el.addEventListener('input',draw));
  const remove=()=>{revision++;busy=false;image?.close?.();image=null;input.value='';canvas.hidden=true;controls.hidden=true;removed=true;dirty=true;status.textContent='Изображение будет удалено после сохранения профиля.';onChange();};
  host.querySelector('[data-remove]').addEventListener('click',remove);
  return {get dirty(){return dirty;},get busy(){return busy;},preview:()=>removed?'':image?canvas.toDataURL('image/webp',.82):current,
    async blob(){if(busy)throw new Error('Подождите завершения обработки изображения.');if(!image||removed)return null;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(!blob||blob.size>1024*1024)throw new Error('Не удалось сжать изображение до 1 МБ. Выберите другое.');return blob;},
    get removed(){return removed;},remove,
    committed(url){current=url;dirty=false;removed=false;image?.close?.();image=null;input.value='';canvas.hidden=true;controls.hidden=true;status.textContent=url?'Изображение сохранено.':'Используется цветное оформление.';},
    dispose(){disposed=true;revision++;image?.close?.();}
  };
}
const api={networks,providers,identityLink,socialLink,cleanSocialLinks,validateImage,cropRect,mountMedia};root.InkProfileTools=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
