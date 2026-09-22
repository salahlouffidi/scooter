// Capture a short, actual game run for delivery QA (round 16).
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),child=require('node:child_process');
const root=path.resolve(__dirname,'../app/src/main/assets/game'),out=path.resolve(__dirname,'../docs'),frames=path.join(out,'gameplay-frames');
(async()=>{
  const server=http.createServer((q,r)=>{try{const f=path.join(root,q.url==='/'?'index.html':q.url);r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.html')?'text/html':'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
  let browser,context;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
    context=await browser.newContext({viewport:{width:800,height:450}});fs.rmSync(frames,{recursive:true,force:true});fs.mkdirSync(frames,{recursive:true});
    const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length);
    await page.evaluate(()=>{gameInstance.startRound(16);clearInterval(gameInstance.countdownTimer);gameInstance.state='PLAYING';document.getElementById('countdown-display').classList.add('hidden');document.getElementById('gameplay-hud').classList.remove('hidden');});
    await page.keyboard.down('ArrowRight');await page.waitForTimeout(420);await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Space');
    for(let i=0;i<8;i++){if(i===2)await page.keyboard.down('ArrowLeft');if(i===5)await page.keyboard.up('ArrowLeft');await page.screenshot({path:path.join(frames,`frame-${String(i).padStart(3,'0')}.png`)});await page.waitForTimeout(60);}
    await context.close();child.execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-framerate','2','-i',path.join(frames,'frame-%03d.png'),'-c:v','libvpx-vp9','-pix_fmt','yuv420p',path.join(out,'gameplay-short.webm')]);fs.rmSync(frames,{recursive:true,force:true});console.log('WROTE',path.join(out,'gameplay-short.webm'));
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
