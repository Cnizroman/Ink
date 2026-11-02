// Rebuild the committed PNG from its local SVG source; no external images/fonts.
// Run: npm ci && npm run assets:social-card (DejaVu fonts must be installed).
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium:pw}=require('playwright-core'),cp=require('@sparticuz/chromium');
(async()=>{
 const libs=await cp.inflate(path.resolve(require.resolve('@sparticuz/chromium'),'../../bin/al2023.tar.br'));
 cp.setupLambdaEnvironment(libs+'/lib');
 // Use installed system fonts, not the Lambda bundle's minimal fallback fonts.
 process.env.FONTCONFIG_PATH='/etc/fonts';
 const browser=await pw.launch({executablePath:await cp.default.executablePath(),args:cp.default.args.filter(a=>a!=='--disable-web-security'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../assets/ink-social-card-v1.svg')).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.resolve(__dirname,'../assets/ink-social-card-v1.png'),type:'png',animations:'disabled'});
 }finally{await browser.close();}
 console.log('Built assets/ink-social-card-v1.png (1200 × 630)');
})().catch(e=>{console.error(e);process.exitCode=1;});
