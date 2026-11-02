const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('single SQL activation file is exactly all canonical migrations in one transaction',()=>{
 const paths=['supabase/migrations/20261102000200_manual_publication_review.sql','supabase/migrations/20261102000300_story_design_passwords.sql','supabase/migrations/20261102000400_story_design_v2.sql','supabase/migrations/20261102000500_workshop_freedom.sql'];
 const pieces=paths.map(file=>'-- SOURCE: '+file+'\n'+fs.readFileSync(file,'utf8').trimEnd().split('\n').filter(line=>!['begin;','commit;'].includes(line.trim())).join('\n'));
 const bundled=fs.readFileSync('STORY_STUDIO_SETUP.sql','utf8');assert.equal(bundled.slice(bundled.indexOf('-- SOURCE:')),pieces.join('\n\n')+'\n\ncommit;\n');assert.equal((bundled.match(/^begin;$/gm)||[]).length,1);assert.equal((bundled.match(/^commit;$/gm)||[]).length,1);
});

test('v2-only upgrade equals the canonical non-destructive migration',()=>{assert.equal(fs.readFileSync('STORY_DESIGN_UPGRADE.sql','utf8'),fs.readFileSync('supabase/migrations/20261102000400_story_design_v2.sql','utf8'));});

test('freedom-only upgrade equals canonical migration',()=>assert.equal(fs.readFileSync('WORKSHOP_FREEDOM_UPGRADE.sql','utf8'),fs.readFileSync('supabase/migrations/20261102000500_workshop_freedom.sql','utf8')));
