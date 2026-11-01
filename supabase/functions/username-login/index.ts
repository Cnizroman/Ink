// Public password login: service credentials remain only in the Edge environment.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, prefer','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(message,status)=>new Response(JSON.stringify({message}),{status,headers});
async function readSmallBody(req){
  const reader=req.body?.getReader();if(!reader)return '';
  const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>3072){await reader.cancel();throw new Error('large body');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return new TextDecoder().decode(bytes);
}
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return reply('Method not allowed',405);
  const invalid=()=>reply('Неверный логин или пароль.',401);
  try{
    const {username,password}=JSON.parse(await readSmallBody(req));
    if(typeof username!=='string'||!/^[a-z0-9_]{3,30}$/.test(username)||typeof password!=='string'||password.length<6||password.length>1024)return invalid();
    const url=Deno.env.get('SUPABASE_URL'),service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
    // Per-account limiting cannot be bypassed just by forging an IP header.
    const ip=(req.headers.get('x-forwarded-for')||req.headers.get('x-real-ip')||'unknown').split(',')[0].trim().slice(0,128);
    for(const [scope,limit,seconds] of [['ip:'+ip,30,60],['username:'+username,10,600]]){
      const {data,error}=await service.rpc('consume_username_login_attempt',{p_key:await digest(scope),p_limit:limit,p_window_seconds:seconds});
      if(error)return reply('Сервис входа временно недоступен.',503);
      if(data!==true)return new Response(JSON.stringify({message:'Слишком много попыток. Подождите и повторите вход.'}),{status:429,headers:{...headers,'Retry-After':String(seconds)}});
    }
    const {data:profile,error:profileError}=await service.from('profiles').select('id').eq('username',username).maybeSingle();
    if(profileError)return reply('Сервис входа временно недоступен.',503);
    // Identical public failure; never return the email behind a username.
    let email='nonexistent-'+crypto.randomUUID()+'@invalid.example';
    if(profile){const {data}=await service.auth.admin.getUserById(profile.id);email=data.user?.email||email;}
    const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await auth.auth.signInWithPassword({email,password});
    if(error||!data.session||!profile||data.user?.id!==profile.id)return invalid();
    return new Response(JSON.stringify({access_token:data.session.access_token,refresh_token:data.session.refresh_token,expires_in:data.session.expires_in,user:{id:data.user.id,email:data.user.email}}),{headers});
  }catch(_){return invalid();}
});
