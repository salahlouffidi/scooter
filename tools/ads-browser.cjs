const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game');
(async()=>{
 const server=http.createServer((q,r)=>{
  try { const file=path.join(root,q.url==='/'?'index.html':q.url);
   r.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
   r.end(fs.readFileSync(file));
  } catch {r.statusCode=404;r.end();}
 }).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.on('listening',resolve));let browser;
 try {
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.adRequests=[];
   const ready=()=>window.ScooterAds?.onStatus({available:true,rewardedReady:true,privacyRequired:true,testAds:true});
   window.ScooterAdsNative={requestStatus:ready,
    showRewarded:id=>window.adRequests.push({id,type:'rewarded'}),
    showInterstitial:id=>window.adRequests.push({id,type:'interstitial'}),
    showPrivacyOptions:id=>window.adRequests.push({id,type:'privacy'})};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length);
  await page.evaluate(()=>{const g=gameInstance;g.showMainMenu();g.startRound(1);g.cancelCountdown();g.triggerGameOver();ScooterAdsNative.requestStatus();});
  const button=page.locator('#game-over-modal .rewarded-ad-button');
  await button.click();assert.equal(await page.evaluate(()=>adRequests.length),1);
  assert.equal(await page.evaluate(()=>gameInstance.state),'GAME_OVER');
  await page.evaluate(()=>ScooterAds.onResult({id:adRequests.at(-1).id,status:'closed',earned:true}));
  await page.waitForFunction(()=>GameStorage.getWallet().totalCoins===50);
  assert(await button.isDisabled());
  await page.click('#btn-go-retry');
  assert.equal(await page.evaluate(()=>adRequests.at(-1).type),'interstitial');
  assert.equal(await page.evaluate(()=>gameInstance.state),'GAME_OVER');
  await page.evaluate(()=>ScooterAds.onResult({id:adRequests.at(-1).id,status:'skipped',earned:false}));
  await page.waitForFunction(()=>gameInstance.state==='COUNTDOWN');
  await page.evaluate(()=>{gameInstance.cancelCountdown();gameInstance.showMainMenu();gameInstance.showSettings();});
  await page.click('#btn-privacy-options');
  assert.equal(await page.evaluate(()=>adRequests.at(-1).type),'privacy');
  await page.evaluate(()=>ScooterAds.onResult({id:adRequests.at(-1).id,status:'closed'}));
  // New orientations remain usable with cutout/gesture insets.
  for(const viewport of [{width:412,height:915},{width:915,height:412},{width:800,height:1280},{width:1280,height:800}]){
   await page.setViewportSize(viewport);
   await page.evaluate(()=>ScooterAds.setInsets({top:24,left:12,right:12,bottom:24}));
   await page.locator('#btn-privacy-options').scrollIntoViewIfNeeded();
   const box=await page.locator('#btn-privacy-options').boundingBox();
   assert(box && box.x>=0 && box.y>=0 && box.x+box.width<=viewport.width+1 && box.y+box.height<=viewport.height+1,JSON.stringify({viewport,box}));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS browser ads UI: earned reward, transition wait/no-fill, privacy, phone/tablet portrait and landscape. Native SDK is mocked.');
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
