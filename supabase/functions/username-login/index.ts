// Deploy with: supabase functions deploy username-login --no-verify-jwt
// Service role stays ONLY in the Edge Function environment, never in the site.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return new Response('{}',{status:405,headers});
  const invalid=()=>new Response(JSON.stringify({message:'Неверный логин или пароль.'}),{status:401,headers});
  try{
    const raw=await req.text();if(raw.length>3000)return invalid();
    const {username,password}=JSON.parse(raw);
    if(typeof username!=='string'||! /^[a-z0-9_]{3,30}$/.test(username)||typeof password!=='string'||password.length<6||password.length>1024)return invalid();
    const url=Deno.env.get('SUPABASE_URL')!,service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:profile}=await service.from('profiles').select('id').eq('username',username).maybeSingle();
    // No public endpoint revealing the email behind a username.
    let email='nonexistent-'+crypto.randomUUID()+'@invalid.example';
    if(profile){const {data}=await service.auth.admin.getUserById(profile.id);email=data.user?.email||email;}
    const auth=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await auth.auth.signInWithPassword({email,password});
    if(error||!data.session||!profile)return invalid();
    return new Response(JSON.stringify({access_token:data.session.access_token,refresh_token:data.session.refresh_token,user:data.user}),{headers});
  }catch(_){return invalid();}
});
