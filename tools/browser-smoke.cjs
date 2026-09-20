// Optional: requires Playwright and a locally installed Chromium.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game');
(async()=>{
 const server=http.createServer((q,r)=>{try{const f=path.join(root,q.url==='/'?'index.html':q.url);r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:720},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length);
  assert.equal(await page.evaluate(()=>louffiAssetStatus),'GLB loaded');
  // Test access applies to fresh and existing saves without granting stars.
  await page.evaluate(()=>gameInstance.showRoundSelect());
  assert.equal(await page.locator('.round-card.unlocked').count(),16);
  await page.evaluate(()=>{GameStorage.saveProgress({...GameStorage.getProgress(),highestUnlockedRound:3,stars:{2:2},bestScores:{2:1234}});gameInstance.showRoundSelect();});
  assert.equal(await page.locator('.round-card.locked').count(),0);
  assert.equal(await page.evaluate(()=>GameStorage.getProgress().bestScores[2]),1234);
  await page.locator('.round-card').last().click();await page.waitForFunction(()=>gameInstance.state==='PLAYING');
  assert.equal(await page.evaluate(()=>gameInstance.currentRoundId),16);
  await page.evaluate(()=>{gameInstance.showMainMenu();GameStorage.resetProgress();});
  await page.click('#btn-menu-play');await page.waitForFunction(()=>gameInstance.state==='PLAYING');
  assert(await page.locator('#joystick-zone').isVisible());assert(await page.locator('#btn-hud-pause').isVisible());
  assert(await page.evaluate(()=>{const e=document.getElementById('joystick-zone'),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'joystick above canvas');
  await page.keyboard.down('ArrowRight');await page.waitForFunction(()=>gameInstance.riderCtrl.laneX>.1);await page.keyboard.up('ArrowRight');
  const steerState=await page.evaluate(()=>({lane:gameInstance.riderCtrl.laneX,state:gameInstance.state,keys:gameInstance.input.keys}));console.log('steer',steerState);assert(Math.abs(steerState.lane)>.01);
  await page.keyboard.down('Space');await page.waitForTimeout(120);await page.keyboard.up('Space');
  await page.waitForFunction(()=>gameInstance.riderCtrl.jumpAttempts>0,null,{timeout:3000});
  await page.click('#btn-hud-pause');const s=await page.evaluate(()=>gameInstance.riderCtrl.s);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),s);
  await page.click('#btn-pause-resume');await page.waitForFunction(()=>gameInstance.state==='PLAYING');
  const joystick=await page.locator('#joystick-zone').boundingBox();
  await page.mouse.move(joystick.x+joystick.width/2,joystick.y+joystick.height/2);await page.mouse.down();
  await page.mouse.move(joystick.x+joystick.width/2-50,joystick.y+joystick.height/2);
  await page.waitForFunction(()=>gameInstance.riderCtrl.lateralVelocity < -3);await page.mouse.up();
  await page.waitForFunction(()=>Math.abs(gameInstance.riderCtrl.lateralVelocity)<.1);
  assert.equal(await page.evaluate(()=>gameInstance.input.joystickPointerId),null);
  await page.evaluate(()=>{const g=gameInstance;g.riderCtrl.reset(40,18);g.riderCtrl.applyPowerup('overdrive',(e,p)=>g.onGameplayEvent(e,p));g.gameCam.reset(g.riderCtrl.mesh,g.trackGen);});
  await page.waitForFunction(()=>gameInstance.arcadeEffects.stars.count>0&&document.getElementById('hud-speed').textContent.includes('TURBO'));
  assert(await page.evaluate(()=>gameInstance.sky.distantItems.every(o=>o.position.toArray().every(Number.isFinite))));
  // Take an actual rendered frame with the player centered, without altering asset visibility.
  await page.evaluate(()=>{gameInstance.riderCtrl.laneX=0;gameInstance.riderCtrl.lateralVelocity=0;gameInstance.riderCtrl.updateMeshTransform();});
  fs.mkdirSync(path.resolve(__dirname,'../docs'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../docs/gameplay.png')});
  const stats=await page.evaluate(()=>({asset:louffiAssetStatus,calls:gameInstance.renderer.info.render.calls,triangles:gameInstance.renderer.info.render.triangles}));
  assert.deepEqual(errors,[]);console.log('PASS browser: real GLB, all 16 rounds open on fresh/existing saves, round 16 launch, pointer joystick/release, steering, jump, pause/resume, turbo HUD/particles, finite sky transforms, no page errors.',stats);
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
