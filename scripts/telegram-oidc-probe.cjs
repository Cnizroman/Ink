// Anonymous, read-only HTTP diagnosis. Does NOT sign in, exchange codes, or link users.
// Only oauth.telegram.org is contacted. Never supply a bot token or client secret.
const https=require('node:https'),crypto=require('node:crypto'),fs=require('node:fs');
const ORIGIN='https://oauth.telegram.org';
const CALLBACK='https://ydxnhdbuxjrrpypkgkee.supabase.co/auth/v1/callback';
function probeRequests(clientId='9174402790',callback=CALLBACK){
 if(!/^\d{1,20}$/.test(clientId))throw new Error('Expected a public numeric Client ID, NOT a secret');
 const back=new URL(callback);if(back.protocol!=='https:'||back.username||back.password||back.search||back.hash||back.pathname!=='/auth/v1/callback')throw new Error('Expected the public HTTPS Auth callback');
 // These belong to an isolated diagnostic, NOT any user's Supabase flow.
 // No consent is submitted, callback followed, or token exchange attempted.
 const state=crypto.randomUUID(),verifier=crypto.randomBytes(32).toString('base64url');
 const values={client_id:clientId,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',redirect_uri:callback,response_type:'code',scope:'openid profile',state};
 const sorted=Object.keys(values).sort(),canonical=['client_id','redirect_uri','response_type','scope','state','code_challenge','code_challenge_method'];
 const result=[{label:'discovery',url:ORIGIN+'/.well-known/openid-configuration'}];
 for(const [label,keys,percentSpaces] of [['supabase_order_form_spaces',sorted,false],['supabase_order_percent_spaces',sorted,true],['documented_order_form_spaces',canonical,false],['documented_order_percent_spaces',canonical,true],['negative_control_missing_redirect_uri',canonical.filter(k=>k!=='redirect_uri'),true]]){
  const pairs=keys.map(k=>[k,values[k]]);
  const query=percentSpaces?pairs.map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'):new URLSearchParams(pairs).toString();
  result.push({label,url:ORIGIN+'/auth?'+query});
 }
 // Additional anonymous controls. These are NOT viable linking URLs and must
 // never be fed back into the site's identity-link flow.
 const base=new URL(result[4].url);
 const onlyOpenid=new URL(base);onlyOpenid.searchParams.set('scope','openid');result.push({label:'control_openid_only',url:onlyOpenid.href});
 result.push({label:'control_unescaped_callback',url:base.href.replace(encodeURIComponent(callback),callback)});
 const doubleEncoded=new URL(base);doubleEncoded.searchParams.set('redirect_uri',encodeURIComponent(callback));result.push({label:'control_double_encoded_callback',url:doubleEncoded.href});
 const websiteRoot=new URL(base);websiteRoot.searchParams.set('redirect_uri','https://cnizroman.github.io/');result.push({label:'control_website_origin_callback_not_a_link_flow',url:websiteRoot.href});
 result.push({label:'control_with_site_referrer',url:base.href,referrer:'https://cnizroman.github.io/'});
 const noClient=new URL(base);noClient.searchParams.delete('client_id');result.push({label:'negative_control_missing_client_id',url:noClient.href});
 return result;
}
function summarize(label,status,headers,body){
 const report={probe:label,http_status:status,bytes:Buffer.byteLength(body),body_sha256:crypto.createHash('sha256').update(body).digest('hex')};
 const contentType=String(headers['content-type']||'').split(';')[0];
 report.content_type=/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(contentType)?contentType:'unknown';
 const plain=body.replace(/<[^>]*>/g,'').trim().toLowerCase();
 const errors=['redirect_uri required','origin required','client_id required','bot_id required','invalid client_id','invalid redirect_uri'];
 const known=errors.find(e=>plain===e);
 report.response_kind=known?'telegram_error':report.content_type==='application/json'?'json_document':report.content_type==='text/html'?'html_document':'unclassified_response';
 if(known)report.error_text=known; // Fixed allowlist only; never log arbitrary response text.
 if(label==='discovery'){
  try{const d=JSON.parse(body);report.expected_issuer=d.issuer===ORIGIN;report.expected_authorization_endpoint=d.authorization_endpoint===ORIGIN+'/auth';report.expected_token_endpoint=d.token_endpoint===ORIGIN+'/token';}catch(_){report.discovery_json_valid=false;}
 }
 if(headers.location){try{const next=new URL(headers.location,ORIGIN);report.redirect={origin:next.origin,query_keys:[...new Set(next.searchParams.keys())].filter(k=>/^[a-z_]{1,40}$/i.test(k))};}catch(_){report.redirect='unparseable';}}
 return report;
}
function get(url,referrer){
 const target=new URL(url);
 if(target.origin!==ORIGIN||!['/auth','/.well-known/openid-configuration'].includes(target.pathname))throw new Error('Probe destination not allowed');
 return new Promise((resolve,reject)=>{
  // No Cookie, Authorization, API key, browser session, or redirect following.
  const req=https.get(target,{headers:{'User-Agent':'Mozilla/5.0 (compatible; InkOIDCDiagnostics/1.0)','Accept':'text/html,application/json','Cache-Control':'no-cache',...(referrer?{'Referer':referrer}:{})}},res=>{
   let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>2*1024*1024)req.destroy(new Error('Response too large'));});res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));res.on('error',reject);
  });
  req.setTimeout(15000,()=>req.destroy(new Error('Request timed out')));req.on('error',reject);
 });
}
async function main(){
 const reports=[];
 for(const p of probeRequests()){
  try{const r=await get(p.url,p.referrer);reports.push(summarize(p.label,r.status,r.headers,r.body));}
  catch(e){reports.push({probe:p.label,transport_error:/^[A-Z_0-9]{1,40}$/.test(e.code||'')?e.code:'request_failed'});}
 }
 const report={notice:'Anonymous HTTP diagnosis only. HTTP 200 or HTML is NOT proof of successful Telegram login. No token exchange, consent submission, or Supabase callback is performed.',results:reports};
 fs.mkdirSync('.cache',{recursive:true});fs.writeFileSync('.cache/telegram-oidc-report.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 // Surface the same sanitized observations through GitHub's Check annotations API.
 // This avoids needing access to the separate Actions log-storage host.
 if(process.env.GITHUB_ACTIONS==='true')for(const r of reports)console.log('::notice title=Telegram HTTP observation::'+JSON.stringify(r).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
 if(reports.some(r=>r.transport_error))process.exitCode=1;
}
module.exports={probeRequests,summarize};
if(require.main===module)main().catch(()=>{console.error('Diagnostic setup failed; no raw request or credentials logged.');process.exitCode=1;});
