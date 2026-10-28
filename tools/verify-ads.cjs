const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const base = 'app/src/main/assets/game/js/';
function fixture(withNative = true) {
  const requests = [], listeners = {}, properties = {};
  const makeElement = () => ({classList:{toggle(){}}, disabled:false, textContent:'', addEventListener(){}});
  const reward = makeElement(), privacy = makeElement(), msg = makeElement();
  const data = new Map();
  const context = {
    console, Date, Promise, setInterval(){},
    localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},
    document:{hidden:false,querySelectorAll:selector=>selector==='.rewarded-ad-button'?[reward]:[msg],
      getElementById:id=>id==='btn-privacy-options'?privacy:msg,
      addEventListener:(name,fn)=>{listeners[name]=fn;},removeEventListener:name=>delete listeners[name],
      body:{classList:{toggle(){}}},documentElement:{style:{setProperty:(k,v)=>properties[k]=v}}},
    gameInstance:{state:'GAME_OVER',currentRunTxId:'run_1',input:{resetAll(){}}}
  };
  context.window = context;
  if (withNative) context.ScooterAdsNative = Object.fromEntries(['showRewarded','showInterstitial','showPrivacyOptions','requestStatus'].map(name=>[name,id=>requests.push({name,id})]));
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(base+'storage.js','utf8'),context);
  vm.runInContext(fs.readFileSync(base+'ads.js','utf8'),context);
  const api=context.ScooterAds;
  const ready=()=>api.onStatus({available:withNative,rewardedReady:true,privacyRequired:true});
  const reply=(earned,status='closed')=>api.onResult({id:requests.at(-1).id,earned,status});
  ready();
  return {context,api,requests,reply,ready,reward,privacy,listeners,properties};
}
(async()=>{
  const f=fixture();
  f.context.gameInstance.state='PLAYING'; await f.api.reward(); assert.equal(f.requests.length,0);
  f.context.gameInstance.state='GAME_OVER';
  const reward=f.api.reward(); await f.api.reward(); assert.equal(f.requests.length,1,'double tap requests one ad');
  f.api.onResult({id:'wrong_request',earned:true}); assert.equal(f.context.GameStorage.getWallet().totalCoins,0);
  f.reply(true); await reward;
  f.reply(true); assert.equal(f.context.GameStorage.getWallet().totalCoins,50,'duplicate callback cannot duplicate reward');
  await f.api.reward(); assert.equal(f.requests.length,1,'one reward per run');
  f.context.gameInstance.currentRunTxId='run_2';f.ready();
  const cancel=f.api.reward();f.reply(false);await cancel;assert.equal(f.context.GameStorage.getWallet().totalCoins,50);
  const fail=f.api.reward();f.reply(false,'failed');await fail;assert.equal(f.context.GameStorage.getWallet().totalCoins,50);
  let continued=0;
  const transition=f.api.transition(()=>continued++);assert.equal(continued,0);f.reply(false,'skipped');await transition;assert.equal(continued,1);
  const background=f.api.transition(()=>continued++);f.context.document.hidden=true;f.reply(false);await background;assert.equal(continued,1);
  f.context.document.hidden=false;f.listeners.visibilitychange();assert.equal(continued,2);
  const privacy=f.api.privacy();assert.equal(f.requests.at(-1).name,'showPrivacyOptions');f.reply(false);await privacy;
  f.api.setInsets({top:24,bottom:18,left:-4,right:12});assert.equal(f.properties['--native-safe-t'],'24px');assert.equal(f.properties['--native-safe-l'],'0px');
  const web=fixture(false); await web.api.transition(()=>continued++);assert.equal(continued,3);await web.api.reward();assert.equal(web.context.GameStorage.getWallet().totalCoins,0);
  console.log('PASS ads: voluntary result-screen reward, duplicate/stale callbacks, cancellation/failure, no fill, background transition, privacy entry, safe insets, browser fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
