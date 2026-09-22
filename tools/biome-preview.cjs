// Render all 16 actual game worlds and verify theme changes/reset behavior.
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game');
(async()=>{
 const server=http.createServer((q,r)=>{try{const f=path.join(root,q.url==='/'?'index.html':q.url);r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:800,height:450}}),errors=[],shots=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length);
  for(let id=1;id<=16;id++){
   const result=await page.evaluate(id=>{
    const g=gameInstance;g.startRound(id);clearInterval(g.countdownTimer);g.state='PREVIEW';
    document.getElementById('countdown-display').classList.add('hidden');document.getElementById('gameplay-hud').classList.remove('hidden');
    g.riderCtrl.reset(40,0);g.trackGen.update(40);g.gameCam.reset(g.riderCtrl.mesh,g.trackGen);
    g.worldMagic.update(0,40,g.trackGen,GameStorage.getSettings());g.sky.update(g.riderCtrl.mesh.position,0);g.updateHUD();
    g.renderer.render(g.scene,g.camera);
    const themes=g.trackGen.sceneryObjects.filter(o=>o.name.startsWith('world_')).map(o=>o.userData.biome);
    const districts=g.trackGen.sceneryObjects.filter(o=>o.name.startsWith('city_street_')).length;
    const landmark=g.trackGen.sceneryObjects.some(o=>o.name.startsWith('world_'));
    const finite=g.sky.distantItems.every(o=>o.position.toArray().every(Number.isFinite));
    return {id,name:g.trackGen.roundData.name,theme:g.trackGen.roundData.theme,themes,districts,landmark,finite,calls:g.renderer.info.render.calls};
   },id);
   assert(result.finite);assert(result.themes.length>0);assert(result.themes.every(t=>t===result.theme));assert.equal(result.districts,0);assert(result.landmark);
   const png=await page.screenshot();shots.push({name:result.name,id,png:png.toString('base64')});console.log(JSON.stringify(result));
  }
  // Settings and repeated world changes must keep distant objects hidden at low quality.
  assert(await page.evaluate(()=>{const g=gameInstance;g.sky.setQuality('low');g.startRound(1);clearInterval(g.countdownTimer);g.state='PREVIEW';return g.sky.distantItems.every(o=>!o.visible)&&g.trackGen.sceneryObjects.filter(o=>o.name.startsWith('world_')).every(o=>o.userData.biome==='garden');}));
  assert.deepEqual(errors,[]);
  const sheet=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
  await sheet.setContent(`<style>body{margin:0;background:#111d37;color:white;font:16px system-ui}h1{font-size:24px;margin:16px 20px 4px}p{margin:0 20px 16px;color:#cbd9f2}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 16px 16px}.card{background:#203252;border-radius:10px;overflow:hidden}.card img{width:100%;display:block}.card b{display:block;padding:7px 10px;font-size:14px}</style><h1>SKY SCOOTER — 16 magical places</h1><p>Actual game renders · LOUFFI EDITION</p><div class="grid">${shots.map(s=>`<div class="card"><img src="data:image/png;base64,${s.png}"><b>${s.id}. ${s.name}</b></div>`).join('')}</div>`);
  await sheet.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  fs.mkdirSync(path.resolve(__dirname,'../docs'),{recursive:true});await sheet.screenshot({path:path.resolve(__dirname,'../docs/worlds-overview.png'),fullPage:true});
  console.log('PASS: 16 rendered magical worlds, matching biome scenery, finite sky positions, low-quality reset, no page errors.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
