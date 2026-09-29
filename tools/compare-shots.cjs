// Deterministic gameplay frames for before/after visual comparison.
// Gameplay is frozen (no physics, collisions or pickups): the rider is placed kinematically,
// the camera, rider effects, sky, lights and post-fx are stepped at a fixed 60 Hz, then one
// frame is rendered and captured. Math.random is seeded, so two code versions produce the
// same world layout and the pictures differ only by rendering/camera changes.
// TWEAK='js using g' runs just before the capture (for A/B experiments).
// Usage: [GFX=high|medium|low] [DSF=2] [TWEAK=...] node tools/compare-shots.cjs <outDir> [gameRoot] [WxH=844x390] [names]
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const out=path.resolve(process.argv[2]||'shots-compare');
const root=path.resolve(process.argv[3]||path.join(__dirname,'../app/src/main/assets/game'));
const [W,H]=(process.argv[4]||'844x390').split('x').map(Number);
const wanted=(process.argv[5]||'').split(',').filter(Boolean);
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.glb':'model/gltf-binary'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((q,r)=>{try{const u=decodeURIComponent(q.url.split('?')[0]),f=path.join(root,u==='/'?'index.html':u);r.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:W,height:H},hasTouch:true,deviceScaleFactor:Number(process.env.DSF||1)});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(q=>{
  let s=0x9e3779b9;window.__reseed=n=>{s=n|0;};Math.random=()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
  try{localStorage.setItem('skyscooter_settings_v1',JSON.stringify({graphicsQuality:q,adaptiveResolution:false}));}catch{}
 },process.env.GFX||'high');
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length,null,{timeout:120000});
 await page.click('#intro-overlay').catch(()=>{});
 await page.waitForFunction(()=>gameInstance.state==='MENU',null,{timeout:60000});
 await page.evaluate(()=>{gameInstance.loop=()=>{};});
 await page.waitForTimeout(300);
 const scenes=[
  ['r1',1,{speed:16}],['r1_turbo',1,{speed:28,flags:{activeOverdrive:true}}],['r1_turn',1,{speed:18,lane:-2.0,lat:-3}],
  ['r1_jump',1,{speed:18,y:2.3,flags:{isGrounded:false}}],['r1_antigravity',1,{speed:18,y:6.2,flags:{activeAntigravity:true,isGrounded:false}}],
  ['r1_skyflight',1,{speed:28,y:5.0,flags:{activeSkyFlight:true,activeOverdrive:true,isGrounded:false}}],['r1_intro',1,{speed:10,intro:0.9}],
  ['r4',4,{speed:16}],['r6',6,{speed:16}],['r7',7,{speed:16}],['r8',8,{speed:16}],['r10',10,{speed:16}],['r12',12,{speed:16}],['r13',13,{speed:16}],['r14',14,{speed:16}],['r16',16,{speed:16}]
 ];
 for(const [name,round,st] of scenes){
  if(wanted.length&&!wanted.includes(name))continue;
  await page.evaluate(([round,st,tweak])=>{
   const g=gameInstance,rc=g.riderCtrl,tg=g.trackGen,gc=g.gameCam,dt=1/60,settings={...GameStorage.getSettings(),reducedMotion:false};
   window.__reseed(round*7919+13); // identical world layout regardless of what ran before
   g.startRound(round);g.cancelCountdown();g.state='PLAYING';g.hideAllScreens();
   document.getElementById('countdown-display')?.classList.add('hidden');document.getElementById('gameplay-hud')?.classList.remove('hidden');
   const place=s=>{rc.s=s;rc.laneX=st.lane||0;rc.y=st.y||0;rc.forwardSpeed=st.speed;rc.lateralVelocity=st.lat||0;
    rc.activeOverdrive=false;rc.activeSkyFlight=false;rc.activeAntigravity=false;rc.isGliding=false;rc.isGrounded=!(st.y>0);rc.invulnerabilityTimer=0;Object.assign(rc,st.flags||{});
    rc.updateProceduralAnimations(dt);rc.updateMeshTransform();tg.update(s,dt);};
   let s=60;place(s);gc.reset(rc.mesh,tg);
   const steps=st.intro?Math.round(st.intro*60):150;if(st.intro)gc.startIntro(2.6);
   for(let i=0;i<steps;i++){s+=st.speed*dt;place(s);
    gc.update(dt,rc.mesh,tg,rc.activeOverdrive,settings,rc);
    g.riderFx.update(dt,rc,tg,settings,true);g.sky?.update(rc.mesh.position,dt);
    g.updateLights(tg.getTrackPoint(rc.s));g.updatePostFx(dt,i*16.7,settings);}
   for(const item of tg.activeCollectibles||[]){const wp=item.getWorldPosition(new THREE.Vector3());if((item.userData&&item.userData.collected)||wp.distanceTo(rc.mesh.position)<3)item.visible=false;}
   if(tweak)(new Function('g',tweak))(g);
   g.hud?.update(0);g.gfx.render(g.scene,g.camera);
  },[round,st,process.env.TWEAK||'']);
  await page.screenshot({path:path.join(out,name+'.png'),timeout:300000});
  console.log('shot',name);
 }
 console.log('errors',errors.length?errors.slice(0,5):'none');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
