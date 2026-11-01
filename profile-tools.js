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
// Brand paths: Simple Icons (CC0); see SOCIAL_ICONS.md. Never interpolate user SVG.
const socialPaths={"telegram":"M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z","vk":"m9.489.004.729-.003h3.564l.73.003.914.01.433.007.418.011.403.014.388.016.374.021.36.025.345.03.333.033c1.74.196 2.933.616 3.833 1.516.9.9 1.32 2.092 1.516 3.833l.034.333.029.346.025.36.02.373.025.588.012.41.013.644.009.915.004.98-.001 3.313-.003.73-.01.914-.007.433-.011.418-.014.403-.016.388-.021.374-.025.36-.03.345-.033.333c-.196 1.74-.616 2.933-1.516 3.833-.9.9-2.092 1.32-3.833 1.516l-.333.034-.346.029-.36.025-.373.02-.588.025-.41.012-.644.013-.915.009-.98.004-3.313-.001-.73-.003-.914-.01-.433-.007-.418-.011-.403-.014-.388-.016-.374-.021-.36-.025-.345-.03-.333-.033c-1.74-.196-2.933-.616-3.833-1.516-.9-.9-1.32-2.092-1.516-3.833l-.034-.333-.029-.346-.025-.36-.02-.373-.025-.588-.012-.41-.013-.644-.009-.915-.004-.98.001-3.313.003-.73.01-.914.007-.433.011-.418.014-.403.016-.388.021-.374.025-.36.03-.345.033-.333c.196-1.74.616-2.933 1.516-3.833.9-.9 2.092-1.32 3.833-1.516l.333-.034.346-.029.36-.025.373-.02.588-.025.41-.012.644-.013.915-.009ZM6.79 7.3H4.05c.13 6.24 3.25 9.99 8.72 9.99h.31v-3.57c2.01.2 3.53 1.67 4.14 3.57h2.84c-.78-2.84-2.83-4.41-4.11-5.01 1.28-.74 3.08-2.54 3.51-4.98h-2.58c-.56 1.98-2.22 3.78-3.8 3.95V7.3H10.5v6.92c-1.6-.4-3.62-2.34-3.71-6.92Z","youtube":"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z","instagram":"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077","github":"M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12","discord":"M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z","twitch":"M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z","twitter":"M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z","facebook":"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z","linkedin":"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"};
function socialIcon(network){
  const known=Object.hasOwn(socialPaths,network),id=known?network:'website';
  const content=known?`<path d="${socialPaths[network]}"/>`:'<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></g>';
  return `<svg class="social-icon" data-social-icon="${id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${content}</svg>`;
}
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
const api={networks,socialIcon,providers,identityLink,socialLink,cleanSocialLinks,validateImage,cropRect,mountMedia};root.InkProfileTools=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
