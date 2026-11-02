"""Vendor OFL fonts from pinned public Fontsource npm packages, never from a runtime CDN."""
import concurrent.futures, hashlib, io, json, pathlib, re, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
FAMILIES=[('literata','Literata'),('lora','Lora'),('pt-serif','PT Serif'),('merriweather','Merriweather'),('noto-serif','Noto Serif'),('cormorant-garamond','Cormorant Garamond'),('eb-garamond','EB Garamond'),('playfair-display','Playfair Display'),('pt-sans','PT Sans'),('open-sans','Open Sans'),('roboto','Roboto'),('noto-sans','Noto Sans'),('rubik','Rubik'),('oswald','Oswald'),('pt-mono','PT Mono'),('roboto-slab','Roboto Slab'),('jetbrains-mono','JetBrains Mono'),('comfortaa','Comfortaa'),('caveat','Caveat'),('bad-script','Bad Script')]
DEST=ROOT/'assets/story-fonts';DEST.mkdir(parents=True,exist_ok=True)
old=json.loads((DEST/'manifest.json').read_text()) if (DEST/'manifest.json').exists() else []
pins={x['id']:x['version'] for x in old}
def get(url):
 with urllib.request.urlopen(url,timeout=45) as r:return r.read()
def build(entry):
 slug,name=entry;package='@fontsource/'+slug
 meta=json.loads(get('https://registry.npmjs.org/@fontsource%2F'+slug+'/'+pins.get(slug,'latest')))
 archive=tarfile.open(fileobj=io.BytesIO(get(meta['dist']['tarball'])),mode='r:gz');names=set(archive.getnames())
 css=[];files=[]
 for weight,style in [(400,'normal'),(700,'normal'),(400,'italic')]:
  for subset in ['cyrillic','latin']:
   filename=f'{slug}-{subset}-{weight}-{style}.woff2';member='package/files/'+filename
   if member not in names:
    if weight==400 and style=='normal':raise ValueError('Missing required Cyrillic/Latin font '+member)
    continue
   data=archive.extractfile(member).read();(DEST/filename).write_bytes(data);files.append({'file':filename,'sha256':hashlib.sha256(data).hexdigest()})
   source='package/'+(str(weight)+('' if style=='normal' else '-italic'))+'.css'
   source_css=archive.extractfile(source).read().decode()
   block=next(b for b in re.findall(r'@font-face\s*\{([^}]+)\}',source_css) if filename in b)
   unicode=re.search(r'unicode-range:\s*([^;]+)',block).group(1)
   css.append(f'@font-face{{font-family:"Ink {name}";font-style:{style};font-weight:{weight};font-display:swap;src:url("assets/story-fonts/{filename}") format("woff2");unicode-range:{unicode};}}')
 license_member=next(n for n in names if n.lower() in ['package/license','package/ofl.txt','package/license.txt'])
 (DEST/(slug+'-LICENSE.txt')).write_bytes(archive.extractfile(license_member).read())
 print(slug,len(files),flush=True)
 return {'id':slug,'family':name,'package':package,'version':meta['version'],'license':slug+'-LICENSE.txt','files':files},css
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(build,FAMILIES))
(DEST/'manifest.json').write_text(json.dumps([r[0] for r in results],ensure_ascii=False,indent=2)+'\n')
(ROOT/'story-fonts.css').write_text('/* Self-hosted Cyrillic/Latin OFL fonts. Sources and licenses: assets/story-fonts/manifest.json. */\n'+'\n'.join(c for r in results for c in r[1])+'\n')
# Separate ornament faces guarantee dividers do not depend on OS symbol fonts.
# These are auxiliary faces, NOT text-family choices and NOT counted in combinations.
# Deliberately use complete cmap coverage: upstream metadata labels the Math file
# "latin" although its actual cmap includes the full mathematical repertoire.
aux=[('noto-sans-symbols-2','Ink Symbols','symbols'),('noto-sans-symbols','Ink Marks','symbols'),('noto-sans-math','Ink Math','latin')]
extras=[];symbol_css=[]
for slug,family,subset in aux:
 version='5.3.0';meta=json.loads(get('https://registry.npmjs.org/@fontsource%2F'+slug+'/'+version))
 archive=tarfile.open(fileobj=io.BytesIO(get(meta['dist']['tarball'])),mode='r:gz')
 filename=f'{slug}-{subset}-400-normal.woff2';data=archive.extractfile('package/files/'+filename).read();(DEST/filename).write_bytes(data)
 (DEST/(slug+'-LICENSE.txt')).write_bytes(archive.extractfile('package/LICENSE').read())
 symbol_css.append(f'@font-face{{font-family:"{family}";font-style:normal;font-weight:400;font-display:swap;src:url("assets/story-fonts/{filename}") format("woff2");}}')
 extras.append({'package':'@fontsource/'+slug,'family':family,'version':version,'license':slug+'-LICENSE.txt','files':[{'file':filename,'sha256':hashlib.sha256(data).hexdigest()}]})
(DEST/'symbols-manifest.json').write_text(json.dumps(extras,indent=2)+'\n')
with (ROOT/'story-fonts.css').open('a') as out:out.write('\n'.join(symbol_css)+'\n')
