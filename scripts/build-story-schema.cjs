// Rebuild the typed SQL validator and activation bundles from the shared style schema.
const fs=require('node:fs'),path=require('node:path'),story=require('../story-tools.js');
process.chdir(path.resolve(__dirname,'..'));
const quote=s=>"'"+s.replace(/'/g,"''")+"'";
const keys=Object.keys(story.defaults),checks=["octet_length(s::text)<12000",'not exists(select 1 from jsonb_object_keys(s) k where k not in ('+keys.map(quote).join(',')+'))'];
for(const [k,values] of Object.entries(story.options))checks.push(`(not s?${quote(k)} or s->>${quote(k)} in (${values.map(quote).join(',')}))`);
for(const [k,[min,max]] of Object.entries(story.ranges))checks.push(`(not s?${quote(k)} or case when jsonb_typeof(s->${quote(k)})='number' then (s->>${quote(k)})::numeric between ${min} and ${max} else false end)`);
for(const k of story.colorKeys)checks.push(`(not s?${quote(k)} or (s->>${quote(k)} ~ '^#[0-9a-fA-F]{6}$'))`);
checks.push("(not s?'dropcap' or jsonb_typeof(s->'dropcap')='boolean')","(not s?'customDivider' or (jsonb_typeof(s->'customDivider')='string' and char_length(s->>'customDivider')<=24 and s->>'customDivider' !~ '[[:cntrl:]]'))");
const sql=`-- Design v2 upgrade. Requires the existing story/password and moderation schema.\n-- Only expands typed design validation; does not change RLS, users, passwords or moderation.\nbegin;\ndo $$begin if to_regprocedure('public.story_studio_version()') is null then raise exception 'Сначала примените STORY_STUDIO_SETUP.sql';end if;end$$;\ncreate or replace function public.valid_reader_style(s jsonb) returns boolean language sql immutable as $$\n select case when jsonb_typeof(s)='object' then coalesce((\n ${checks.join('\n and ')}\n ),false) else false end\n$$;\ncreate or replace function public.story_studio_version() returns integer language sql stable as $$select 2$$;\ngrant execute on function public.story_studio_version() to anon,authenticated;\nnotify pgrst, 'reload schema';\ncommit;\n`;
const migration='supabase/migrations/20261102000400_story_design_v2.sql';fs.writeFileSync(migration,sql);fs.writeFileSync('STORY_DESIGN_UPGRADE.sql',sql);
const sources=['supabase/migrations/20261102000200_manual_publication_review.sql','supabase/migrations/20261102000300_story_design_passwords.sql',migration];
const pieces=sources.map(file=>'-- SOURCE: '+file+'\n'+fs.readFileSync(file,'utf8').trimEnd().split('\n').filter(line=>!['begin;','commit;'].includes(line.trim())).join('\n'));
fs.writeFileSync('STORY_STUDIO_SETUP.sql','-- Run this ENTIRE file in Supabase SQL Editor. Requires the existing platform base schema.\n-- Adds manual review, story design v2 and real password protection. Safe to rerun.\n-- Existing static HTML books are not migrated or secured by this file.\nbegin;\n\n'+pieces.join('\n\n')+'\n\ncommit;\n');
const marker='/* GENERATED DIVIDER RULES */',css=fs.readFileSync('story-designer.css','utf8').split(marker)[0].trimEnd();
const rules=story.dividers.map(([id])=>{const d=story.dividerCSS(id);if(id==='custom')d.symbol='var(--story-custom-divider-symbol)';return `hr[data-divider=${id}]{--divider-symbol:${d.symbol};--divider-rule:${d.rule};--divider-thickness:${d.thickness};}`;});
fs.writeFileSync('story-designer.css',css+'\n'+marker+'\n'+rules.join('\n')+'\n');
console.log('Built style v2 validator, upgrade/full SQL bundles and divider rules.');
