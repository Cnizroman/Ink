-- Design v2 upgrade. Requires the existing story/password and moderation schema.
-- Only expands typed design validation; does not change RLS, users, passwords or moderation.
begin;
do $$begin if to_regprocedure('public.story_studio_version()') is null then raise exception 'Сначала примените STORY_STUDIO_SETUP.sql';end if;end$$;
create or replace function public.valid_reader_style(s jsonb) returns boolean language sql immutable as $$
 select case when jsonb_typeof(s)='object' then coalesce((
 octet_length(s::text)<12000
 and not exists(select 1 from jsonb_object_keys(s) k where k not in ('palette','font','headingFont','align','dropcap','headings','divider','pageLayout','texture','border','shadow','backgroundMode','blockStyle','customBg','customText','customAccent','borderColor','gradientEnd','customDivider','size','leading','width','weight','letterSpacing','paragraphGap','indent','headingScale','pagePaddingX','pagePaddingY','radius','textureStrength','gradientAngle','dividerSize','dividerGap','dividerWidth'))
 and (not s?'palette' or s->>'palette' in ('paper','ink','midnight','forest','plum','terminal','ice','rose','sand','wine','ocean','graphite','custom'))
 and (not s?'font' or s->>'font' in ('serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'headingFont' or s->>'headingFont' in ('inherit','serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'align' or s->>'align' in ('left','justify','center','right'))
 and (not s?'headings' or s->>'headings' in ('classic','minimal','caps','serifline','centered','boxed','underlined','numbered'))
 and (not s?'divider' or s->>'divider' in ('stars','line','diamond','dots','asterisk','flourish','leaf','moon','sun','snow','heart','wave','zigzag','plus','arrow','quill','book','squares','circles','cross','double','dashed','dotted','custom'))
 and (not s?'pageLayout' or s->>'pageLayout' in ('sheet','book','scroll','manuscript','notebook','terminal','letter','archive','poetry','magazine','screenplay','custom'))
 and (not s?'texture' or s->>'texture' in ('none','paper','lines','grid','dots','diagonal','linen','night'))
 and (not s?'border' or s->>'border' in ('none','solid','double','dashed','dotted','accent','corner','inset'))
 and (not s?'shadow' or s->>'shadow' in ('none','soft','deep','flat'))
 and (not s?'backgroundMode' or s->>'backgroundMode' in ('solid','gradient'))
 and (not s?'blockStyle' or s->>'blockStyle' in ('classic','flat','outline','soft','leftbar','rounded'))
 and (not s?'size' or case when jsonb_typeof(s->'size')='number' then (s->>'size')::numeric between 16 and 40 else false end)
 and (not s?'leading' or case when jsonb_typeof(s->'leading')='number' then (s->>'leading')::numeric between 1.2 and 2.4 else false end)
 and (not s?'width' or case when jsonb_typeof(s->'width')='number' then (s->>'width')::numeric between 480 and 1440 else false end)
 and (not s?'weight' or case when jsonb_typeof(s->'weight')='number' then (s->>'weight')::numeric between 400 and 700 else false end)
 and (not s?'letterSpacing' or case when jsonb_typeof(s->'letterSpacing')='number' then (s->>'letterSpacing')::numeric between -0.5 and 1.5 else false end)
 and (not s?'paragraphGap' or case when jsonb_typeof(s->'paragraphGap')='number' then (s->>'paragraphGap')::numeric between 0 and 32 else false end)
 and (not s?'indent' or case when jsonb_typeof(s->'indent')='number' then (s->>'indent')::numeric between 0 and 64 else false end)
 and (not s?'headingScale' or case when jsonb_typeof(s->'headingScale')='number' then (s->>'headingScale')::numeric between 1 and 2.4 else false end)
 and (not s?'pagePaddingX' or case when jsonb_typeof(s->'pagePaddingX')='number' then (s->>'pagePaddingX')::numeric between 12 and 100 else false end)
 and (not s?'pagePaddingY' or case when jsonb_typeof(s->'pagePaddingY')='number' then (s->>'pagePaddingY')::numeric between 12 and 100 else false end)
 and (not s?'radius' or case when jsonb_typeof(s->'radius')='number' then (s->>'radius')::numeric between 0 and 48 else false end)
 and (not s?'textureStrength' or case when jsonb_typeof(s->'textureStrength')='number' then (s->>'textureStrength')::numeric between 0 and 30 else false end)
 and (not s?'gradientAngle' or case when jsonb_typeof(s->'gradientAngle')='number' then (s->>'gradientAngle')::numeric between 0 and 360 else false end)
 and (not s?'dividerSize' or case when jsonb_typeof(s->'dividerSize')='number' then (s->>'dividerSize')::numeric between 12 and 44 else false end)
 and (not s?'dividerGap' or case when jsonb_typeof(s->'dividerGap')='number' then (s->>'dividerGap')::numeric between 12 and 96 else false end)
 and (not s?'dividerWidth' or case when jsonb_typeof(s->'dividerWidth')='number' then (s->>'dividerWidth')::numeric between 40 and 480 else false end)
 and (not s?'customBg' or (s->>'customBg' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customText' or (s->>'customText' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customAccent' or (s->>'customAccent' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'borderColor' or (s->>'borderColor' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'gradientEnd' or (s->>'gradientEnd' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'dropcap' or jsonb_typeof(s->'dropcap')='boolean')
 and (not s?'customDivider' or (jsonb_typeof(s->'customDivider')='string' and char_length(s->>'customDivider')<=24 and s->>'customDivider' !~ '[[:cntrl:]]'))
 ),false) else false end
$$;
create or replace function public.story_studio_version() returns integer language sql stable as $$select 2$$;
grant execute on function public.story_studio_version() to anon,authenticated;
notify pgrst, 'reload schema';
commit;
