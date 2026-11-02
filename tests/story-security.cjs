process.chdir(require('node:path').resolve(__dirname,'..'));
const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite({extensions:{pgcrypto}});await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz,updated_at timestamptz);`);
 const base=fs.readFileSync('supabase-platform-schema.sql','utf8'),mod=fs.readFileSync('supabase/migrations/20261102000200_manual_publication_review.sql','utf8'),studio=fs.readFileSync('supabase/migrations/20261102000300_story_design_passwords.sql','utf8');
 await db.exec(base);const combined=fs.readFileSync('STORY_STUDIO_SETUP.sql','utf8');await db.exec(combined);await db.exec(combined);
 const owner='11111111-1111-4111-8111-111111111111',writer='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',wid='44444444-4444-4444-8444-444444444444';
 await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','owner@example.com','{"username":"owner"}'),('${writer}','writer@example.com','{"username":"writer"}'),('${other}','other@example.com','{"username":"other"}');update profiles set role='admin' where id='${owner}';grant usage on schema public,auth to anon,authenticated;grant select on all tables in schema public to anon;grant select,insert,update,delete on works,chapters,profiles to authenticated;`);
 const as=async(role,id='')=>db.exec(`reset role;select set_config('test.uid','${id}',false);set role ${role};`),q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const unlock=async password=>(await q('select public.read_locked_story($1,$2) as result',[wid,password]))[0].result;
 const set=async password=>q('select public.set_story_password($1,$2)',[wid,password]);
 const approve=async()=>{await as('authenticated',writer);if((await q(`select moderation_status from works where id='${wid}'`))[0].moderation_status==='approved')return;await q(`select public.submit_work_for_review('${wid}',(select moderation_revision from works where id='${wid}'))`);await as('authenticated',owner);await q(`select public.review_publication('${wid}',(select moderation_revision from works where id='${wid}'),'approved','')`);};
 await as('authenticated',writer);await db.exec(`insert into works(id,author_id,title,type,genre) values('${wid}','${writer}','Secret story','story','Драма');insert into chapters(work_id,title,body,status) values('${wid}','First chapter','TOP SECRET BODY','published'),('${wid}','Private chapter','PRIVATE DRAFT','draft');`);
 await assert.rejects(set('short'),/минимум/);await assert.rejects(set('я'.repeat(37)),/байт/);
 await set('friends-only-123');await assert.rejects(q(`update works set password_protected=false where id='${wid}'`),/настройки доступа/);
 assert.equal((await q(`select password_protected from works where id='${wid}'`))[0].password_protected,true);
 assert.equal((await q('select body from chapters')).length,2);
 await as('anon');assert.equal((await q(`select story_has_password('${wid}') as locked`))[0].locked,false);assert.equal((await unlock('friends-only-123')).error,'not_found');
 await approve();await as('anon');assert.equal((await q('select * from chapters')).length,0);assert.equal((await q('select publication_snapshot() as s'))[0].s.chapters.length,0);
 await assert.rejects(q('select * from ink_private.story_passwords'),/permission denied/);await assert.rejects(set('stolen-password'),/permission denied/);
 assert.equal((await unlock('wrong')).error,'incorrect_password');const opened=await unlock('friends-only-123');assert.equal(opened.chapters.length,1);assert.equal(opened.chapters[0].body,'TOP SECRET BODY');assert.ok(!JSON.stringify(opened).includes('password_hash'));assert.equal((await q('select * from chapters')).length,0);
 // Another authenticated author gets no more permissions than an anonymous reader.
 await as('authenticated',other);assert.equal((await q('select * from chapters')).length,0);await assert.rejects(set('stolen-password'),/только автор/);
 await as('anon');for(let i=0;i<60;i++)assert.equal((await unlock('wrong')).error,'incorrect_password');assert.equal((await unlock('friends-only-123')).error,'rate_limit');
 await db.exec('reset role');assert.equal((await q(`select attempts from ink_private.story_attempts where work_id='${wid}'`))[0].attempts,61);await db.exec(`update ink_private.story_attempts set reset_at=now()-interval '1 second'`);
 await as('anon');assert.equal((await unlock('friends-only-123')).chapters[0].body,'TOP SECRET BODY');
 // Rerunning the base schema / older moderation migration must not reopen bodies.
 await db.exec('reset role');await db.exec(base);await db.exec(mod);await as('anon');assert.equal((await q('select * from chapters')).length,0);await db.exec('reset role');await db.exec(studio);
 await as('authenticated',writer);await set('replacement-123');await approve();await as('anon');assert.equal((await unlock('friends-only-123')).error,'incorrect_password');assert.equal((await unlock('replacement-123')).chapters.length,1);
 await as('authenticated',writer);await db.exec(`update works set reader_style='{"palette":"midnight","dropcap":true}' where id='${wid}'`);await as('anon');assert.equal((await unlock('replacement-123')).error,'not_found');
 await as('authenticated',writer);for(const invalid of [{palette:null},{font:'url(evil)'},{size:99},{leading:1},{width:'900px'},[],null,{arbitrary:'css'}])await assert.rejects(q(`update works set reader_style=$1 where id='${wid}'`,[JSON.stringify(invalid)]),/works_reader_style_check|cannot call jsonb_object_keys/);
 await approve();await as('authenticated',owner);assert.equal((await q('select body from chapters')).length,2);const bypass=await unlock('');assert.equal(bypass.chapters.length,1);
 // Apply only v2 over a v1 install: auth/password functions and RLS policies must be unchanged.
 await db.exec('reset role');const upgrade=fs.readFileSync('STORY_DESIGN_UPGRADE.sql','utf8'),design=require('../story-tools.js');
 const guards=()=>q("select proname,pg_get_functiondef(oid) as definition from pg_proc where pronamespace='public'::regnamespace and proname in ('read_locked_story','set_story_password','publication_snapshot','review_publication') order by proname");
 const policies=()=>q("select tablename,policyname,qual,with_check from pg_policies order by tablename,policyname");const before=await guards(),beforePolicies=await policies();await db.exec(upgrade);await db.exec(upgrade);assert.deepEqual(await guards(),before);assert.deepEqual(await policies(),beforePolicies);assert.equal((await q('select story_studio_version() as version'))[0].version,2);
 const valid=async style=>(await q('select valid_reader_style($1) as valid',[JSON.stringify(style)]))[0].valid;
 assert.equal(await valid({}),true);assert.equal(await valid(design.v2()),true);
 for(const [key,values] of Object.entries(design.options)){for(const value of values)assert.equal(await valid({[key]:value}),true,key+':'+value);assert.equal(await valid({[key]:'url(evil)'}),false,key);assert.equal(await valid({[key]:null}),false,key+' null');}
 for(const [key,[min,max]] of Object.entries(design.ranges)){assert.equal(await valid({[key]:min}),true,key);assert.equal(await valid({[key]:max}),true,key);assert.equal(await valid({[key]:max+1}),false,key);assert.equal(await valid({[key]:min-1}),false,key);assert.equal(await valid({[key]:String(min)}),false,key);}
 for(const invalid of [null,[],{arbitrary:'css'},{customBg:'url(x)'},{customText:null},{customDivider:'a'.repeat(25)},{customDivider:'newline\n'},{dropcap:'true'}])assert.equal(await valid(invalid),false,JSON.stringify(invalid));
 assert.equal(await valid({palette:'custom',customBg:'#111111',customText:'#111111',customAccent:'#111111',customDivider:'😀'.repeat(24)}),true);
 const styled=design.v2({font:'caveat',headingFont:'pt-serif',pageLayout:'custom',palette:'custom',customBg:'#14212a',customText:'#dce9ec',texture:'grid',divider:'moon',indent:16,size:32});
 await as('authenticated',writer);await q(`update works set reader_style=$1 where id='${wid}'`,[JSON.stringify(styled)]);await as('anon');assert.equal((await unlock('replacement-123')).error,'not_found');await approve();await as('anon');assert.deepEqual((await unlock('replacement-123')).work.reader_style,styled);
 await as('authenticated',writer);await set(null);await approve();await as('anon');assert.equal((await q('select body from chapters')).length,1);assert.equal((await unlock('replacement-123')).error,'not_locked');
 await as('authenticated',writer);await q(`delete from works where id='${wid}'`);await db.exec('reset role');assert.equal((await q('select * from ink_private.story_passwords')).length,0);assert.equal((await q('select * from ink_private.story_attempts')).length,0);
 await db.close();console.log('PASS story SQL: real bcrypt, private hashes, raw REST/snapshot denial, owner/admin access, non-owner denial, unpublished/draft protection, persistent throttle, reset/rotation/removal, style v2 enums/ranges/custom colors, non-destructive v1 upgrade, moderation/locked-style roundtrip, rerun security and cascade');
})().catch(e=>{console.error(e);process.exit(1)});
