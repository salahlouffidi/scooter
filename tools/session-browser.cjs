// Regression checks for the user's menu/app-switch/reload resume bug.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game');
(async()=>{
 const server=http.createServer((q,r)=>{try{const f=path.join(root,q.url==='/'?'index.html':q.url);r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.gameInstance?.state==='MENU');
  await page.evaluate(()=>{gameInstance.startRound(2);gameInstance.pause();const g=gameInstance;
   g.riderCtrl.reset(105,16);g.riderCtrl.laneX=2;g.riderCtrl.applyPowerup('magic_fruit');g.score=872;g.hearts=2;g.coinsCollectedThisRun=17;
   g.riderCtrl.furthestS=105;g.distanceScore=105;g.riderCtrl.updateMeshTransform();g.gameCam.reset(g.riderCtrl.mesh,g.trackGen);g.saveActiveRun();});
  const original=await page.evaluate(()=>GameStorage.getRun());
  await page.click('#btn-pause-menu');assert(await page.locator('#btn-menu-continue').isVisible());
  await page.click('#btn-menu-continue');
  assert.equal(await page.evaluate(()=>gameInstance.currentRunTxId),original.runId);
  assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),105);assert.equal(await page.evaluate(()=>gameInstance.score),872);
  assert.equal(await page.evaluate(()=>gameInstance.hearts),2);assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.faultGuardCharges),2);
  // App switching during the resume countdown must cancel it and freeze all timers.
  await page.evaluate(()=>gameInstance.onAppBackground());await page.waitForTimeout(3500);
  assert.equal(await page.evaluate(()=>gameInstance.state),'PAUSED');assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),105);
  assert.equal(await page.evaluate(()=>gameInstance.countdownTimer),null);
  await page.evaluate(()=>gameInstance.onAppForeground());await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>gameInstance.state),'PAUSED','foreground must not auto-play');
  await page.click('#btn-pause-resume');await page.waitForFunction(()=>gameInstance.state==='PLAYING');
  await page.waitForFunction(()=>gameInstance.riderCtrl.s>107);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const paused=await page.evaluate(()=>GameStorage.getRun());
  await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),paused.rider.s);
  // Reload represents a destroyed WebView; same run ID and exact state rehydrate.
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.gameInstance?.state==='MENU',{timeout:60000});
  assert(await page.locator('#btn-menu-continue').isVisible());await page.click('#btn-menu-continue');
  assert.equal(await page.evaluate(()=>gameInstance.currentRunTxId),paused.runId);
  assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),paused.rider.s);
  assert.equal(await page.evaluate(()=>gameInstance.score),paused.stats.score);
  assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.overdriveTimer),paused.rider.overdriveTimer);
  await page.evaluate(()=>gameInstance.pause());await page.click('#btn-pause-menu');await page.click('#btn-menu-settings');await page.click('#btn-close-settings');
  assert(await page.locator('#btn-menu-continue').isVisible());
  await page.click('#btn-menu-continue');await page.evaluate(()=>{gameInstance.pause();gameInstance.triggerGameOver();gameInstance.showMainMenu();});
  assert.equal(await page.evaluate(()=>GameStorage.getRun()),null,'completed/dead runs cannot resurrect');
  assert(!(await page.locator('#btn-menu-continue').isVisible()));assert.deepEqual(errors,[]);
  console.log('PASS browser: menu resume preserves score/hearts/position/powerups, app switching cancels countdown, foreground waits for explicit Resume, WebView reload recovers exact run, settings preserve save, game over clears it.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
