const fs=require('node:fs'),path=require('node:path');process.chdir(path.resolve(__dirname,'..'));
const v2=fs.readFileSync('supabase/migrations/20261102000400_story_design_v2.sql','utf8').match(/create or replace function public.valid_reader_style\(s jsonb\) returns boolean language sql immutable as \$\$([\s\S]*?)\$\$;/)[1];
const header=`-- Author-owned immutable raster/font files, custom genres and freeform typed design.\n-- No password, publication or existing RLS function is replaced.\nbegin;\ndo $$begin if to_regprocedure('public.story_studio_version()') is null then raise exception 'Сначала примените STORY_STUDIO_SETUP.sql';end if;end$$;\ncreate or replace function public.reader_style_v2_snapshot(s jsonb) returns boolean language sql immutable as $$${v2}$$;\n`;
const sql=header+fs.readFileSync('supabase/workshop-freedom-body.sql','utf8').trim()+'\ncommit;\n';
fs.writeFileSync('supabase/migrations/20261102000500_workshop_freedom.sql',sql);fs.writeFileSync('WORKSHOP_FREEDOM_UPGRADE.sql',sql);
require('./build-story-schema.cjs');
