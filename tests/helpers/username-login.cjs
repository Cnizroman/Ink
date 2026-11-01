const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../../supabase/functions/username-login/index.ts'),'utf8').replace(/^import .*;$/m,'');
function handler(options={}){
 let serve,lookups=0,requestedUsername;const attempts=[];
 const service={rpc:async(name,args)=>{attempts.push({name,args});return options.rpcError?{error:{message:'private failure'}}:{data:options.allowed!==false,error:null};},from:()=>({select:()=>({eq:(_,username)=>{requestedUsername=username;return ({maybeSingle:async()=>{lookups++;return {data:options.unknown||(options.dynamicCredentials&&requestedUsername!=='cnizroman')?null:{id:'owner'},error:null};}});}})}),auth:{admin:{getUserById:async()=>({data:{user:{email:'private@example.test'}}})}}};
 const auth={auth:{signInWithPassword:async({password})=>options.badPassword||(options.dynamicCredentials&&password!=='correct-password')?{data:{},error:{message:'private auth failure'}}:{data:{session:{access_token:'session-token',refresh_token:'refresh-token',expires_in:3600},user:{id:options.wrongIdentity?'other':'owner',email:'private@example.test',private_extra:'never-return'}},error:null}}};
 const ctx=vm.createContext({Response,TextEncoder,TextDecoder,Uint8Array,crypto:require('node:crypto').webcrypto,Deno:{env:{get:name=>name==='SUPABASE_SERVICE_ROLE_KEY'?'service':name==='SUPABASE_ANON_KEY'?'anon':'https://project.example.test'},serve:fn=>serve=fn},createClient:(_,key)=>key==='service'?service:auth});vm.runInContext(source,ctx);
 return {serve,call:(body,method='POST')=>serve(new Request('https://project.example.test/functions/v1/username-login',{method,...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body),headers:{'x-forwarded-for':'203.0.113.10'}}:{})})),attempts,get lookups(){return lookups;}};
}
module.exports={handler};
