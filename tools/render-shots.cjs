// Renders real game frames (menu, HUD, several worlds, turbo, flight) for visual review.
// Usage: [GFX=auto|high|medium|low] [JPEG=1] [DSF=2] [ADAPTIVE=0] node tools/render-shots.cjs <outDir> [viewport=1280x720] [shots=menu,r1,r8,...]
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../app/src/main/assets/game');
const out=path.resolve(process.argv[2]||path.join(__dirname,'../docs/shots'));
const [W,H]=(process.argv[3]||'1280x720').split('x').map(Number);
const wanted=(process.argv[4]||'').split(',').filter(Boolean);
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.glb':'model/gltf-binary'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((q,r)=>{try{const u=decodeURIComponent(q.url.split('?')[0]),f=path.join(root,u==='/'?'index.html':u);r.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:W,height:H},hasTouch:true,deviceScaleFactor:Number(process.env.DSF||1)});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'){const t=m.text();if(!/deprecated with r150/.test(t))errors.push('console:'+t);}});
 // GFX picks the tier; ADAPTIVE=0 pins the dynamic-resolution governor so shots compare at equal scale.
 if(process.env.GFX||process.env.ADAPTIVE==='0')await page.addInitScript(([q,a])=>{try{const s={};if(q)s.graphicsQuality=q;if(a)s.adaptiveResolution=false;localStorage.setItem('skyscooter_settings_v1',JSON.stringify(s));}catch{}},[process.env.GFX||'',process.env.ADAPTIVE==='0']);
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length,null,{timeout:60000});
 const frames=async n=>page.evaluate(n=>new Promise(res=>{let i=0;const f=()=>++i>=n?res():requestAnimationFrame(f);requestAnimationFrame(f);}),n);
 const shot=async name=>{if(wanted.length&&!wanted.includes(name))return;await frames(2);const jpeg=!!process.env.JPEG;await page.screenshot(jpeg?{path:path.join(out,name+'.jpg'),type:'jpeg',quality:90,timeout:240000}:{path:path.join(out,name+'.png'),timeout:240000});console.log('shot',name);};
 const play=async(id,s=60,speed=16,extra)=>{
  await page.evaluate(([id,s,speed])=>{const g=gameInstance;g.startRound(id);g.cancelCountdown();g.state='PLAYING';g.hideAllScreens();document.getElementById('countdown-display').classList.add('hidden');document.getElementById('gameplay-hud').classList.remove('hidden');
   g.riderCtrl.reset(s,speed);g.trackGen.update(s,0);g.gameCam.reset(g.riderCtrl.mesh,g.trackGen);g.lastTime=performance.now();},[id,s,speed]);
  if(extra)await page.evaluate(extra);
 };
 if(!wanted.length||wanted.includes('intro')){await frames(6);await shot('intro');}
 await page.click('#intro-overlay').catch(()=>{});
 await page.waitForFunction(()=>gameInstance.state==='MENU',null,{timeout:10000});
 const want=n=>!wanted.length||wanted.includes(n);
 const n0=Number(process.env.FRAMES||8);
 if(want('menu')){await frames(n0);await shot('menu');}
 if(want('r1')){await play(1,70,16);await frames(n0);await shot('r1');}
 if(want('r1_turbo')){await play(1,70,20,()=>{const g=gameInstance;g.riderCtrl.applyPowerup('overdrive',(e,p)=>g.onGameplayEvent(e,p));});await frames(n0*3);await shot('r1_turbo');}
 for(const id of [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])if(want('r'+id)){await play(id,110,15);await frames(n0);await shot('r'+id);}
 if(want('r1_antigravity')){await play(1,60,16,()=>{const g=gameInstance;g.riderCtrl.applyPowerup('antigravity',(e,p)=>g.onGameplayEvent(e,p));});await frames(n0*2);await shot('r1_antigravity');}
 if(want('pause')){await page.evaluate(()=>{const g=gameInstance;g.state='PLAYING';g.pause();});await frames(4);await shot('pause');}
 if(want('rounds')){await page.evaluate(()=>{gameInstance.showMainMenu();gameInstance.showRoundSelect();});await frames(4);await shot('rounds');}
 if(want('settings')){await page.evaluate(()=>{document.getElementById('round-select-modal')?.classList.add('hidden');gameInstance.showSettings();});await frames(4);await shot('settings');}
 if(want('howto')){await page.evaluate(()=>{gameInstance.hideAllScreens();document.getElementById('how-to-play-modal').classList.remove('hidden');});await frames(3);await shot('howto');}
 if(want('gameover')){await page.evaluate(()=>{const g=gameInstance;g.hideAllScreens();g.state='PLAYING';g.score=2450;g.triggerGameOver();});await frames(3);await shot('gameover');}
 if(want('complete')){await page.evaluate(()=>{const g=gameInstance;g.hideAllScreens();g.startRound(3);g.cancelCountdown();g.state='PLAYING';g.score=6120;g.coinsCollectedThisRun=40;g.triggerRoundComplete();});await frames(3);await shot('complete');}
 console.log('errors',errors.length?errors.slice(0,10):'none');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
