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
  console.log('jump input sent');
  await page.waitForFunction(()=>gameInstance.riderCtrl.jumpAttempts>0,null,{timeout:3000});
  await page.click('#btn-hud-pause');console.log('pause clicked');const s=await page.evaluate(()=>gameInstance.riderCtrl.s);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>gameInstance.riderCtrl.s),s);
  await page.click('#btn-pause-resume');console.log('resume clicked');await page.waitForFunction(()=>gameInstance.state==='PLAYING',{timeout:5000}).catch(async e=>{console.log('resume state',await page.evaluate(()=>({state:gameInstance.state,bg:gameInstance.backgrounded,hidden:document.hidden,count:gameInstance.countdownSeconds,timer:!!gameInstance.countdownTimer})));throw e;});
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
  assert(await page.evaluate(()=>gameInstance.arcadeEffects.flames.every(f=>f.visible)),'turbo exhaust is visible');
  assert(await page.evaluate(()=>gameInstance.gfx.postActive&&gameInstance.post.enabled),'HDR post-processing (bloom, colour grade, speed blur) enabled');
  assert(await page.evaluate(()=>gameInstance.post.rtType===THREE.HalfFloatType||gameInstance.post.rtType===THREE.UnsignedByteType),'scene renders into an offscreen target');
  await page.click('#btn-hud-pause');
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('hud-speed')).animationPlayState==='paused');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#hud-speed').evaluate(e=>getComputedStyle(e).animationName),'none','OS reduced motion disables pulse');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.click('#btn-pause-menu');await page.click('#btn-menu-settings');
  await page.selectOption('#set-graphics','low');
  assert.equal(await page.evaluate(()=>gameInstance.gfx.postActive),false,'low quality renders directly without post-processing');
  await page.check('#set-reduced-motion');
  assert.equal(await page.locator('#hud-speed').evaluate(e=>getComputedStyle(e).animationName),'none','in-game reduced motion disables pulse');
  await page.selectOption('#set-graphics','medium');
  assert.equal(await page.evaluate(()=>gameInstance.gfx.postActive),true,'medium quality restores post-processing');
  await page.click('#btn-close-settings');await page.click('#btn-menu-continue');
  await page.waitForFunction(()=>gameInstance.state==='PLAYING');
  assert(await page.evaluate(()=>gameInstance.arcadeEffects.flames.every(f=>!f.visible)&&!gameInstance.arcadeEffects.pool.some(p=>p.trail&&p.life>0)),'reduced motion disables exhaust and continuous trail during play');
  assert.deepEqual(errors,[]);console.log('PASS browser: real GLB, all 16 rounds open, controls/jump/pause/resume, turbo flames/trail, quality switching (post-fx on/off), Reduced Motion and paused HUD, finite sky transforms, no page errors.',stats);
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
