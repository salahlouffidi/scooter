// Measures the gameplay follow-camera framing numerically (no screenshots needed):
// rider+scooter size on screen, both wheels inside the frame, the road ahead above the
// rider, and the camera clearance, across cruise / top speed / turbo / turns / jump /
// landing / antigravity / sky flight / intro run-in / world transitions.
// The camera is stepped at a fixed 60 Hz with kinematic rider states, so results are
// deterministic and independent of the software renderer's frame rate.
// Usage: node tools/camera-framing.cjs [gameRoot] [WxH=844x390] [--json]
const {chromium}=require('playwright'),http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../app/src/main/assets/game'));
const [W,H]=(process.argv[3]||'844x390').split('x').map(Number);
const asJson=process.argv.includes('--json');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.glb':'model/gltf-binary'};
(async()=>{
 const server=http.createServer((q,r)=>{try{const u=decodeURIComponent(q.url.split('?')[0]),f=path.join(root,u==='/'?'index.html':u);r.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.on('listening',r));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:W,height:H},hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{try{localStorage.setItem('skyscooter_settings_v1',JSON.stringify({graphicsQuality:'low'}));}catch{}});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.gameInstance?.trackGen?.activeSegments.length,null,{timeout:60000});
 await page.click('#intro-overlay').catch(()=>{});
 await page.waitForFunction(()=>gameInstance.state==='MENU',null,{timeout:10000});
 // Optional rig override for tuning experiments: CAM="height,distance,zoom[,lookUp]".
 const override=(process.env.CAM||'').split(',').filter(Boolean).map(Number);
 const res=await page.evaluate((override)=>{
  const g=gameInstance,T=g.THREE,cam=g.camera,rc=g.riderCtrl,tg=g.trackGen,gc=g.gameCam,tun=window.ScooterTuning;
  if(override.length>=3){[gc.heightOffset,gc.distanceBehind,gc.zoom]=override;gc.lookUpOffset=override[3]!==undefined?override[3]:gc.heightOffset-1.6*(gc.distanceBehind+gc.lookAheadDistance)/16.1;}
  g.state='PAUSED'; // the live loop must not touch the rig while we step it by hand
  const box=new T.Box3(),v=new T.Vector3(),dt=1/60;
  const settings={...window.GameStorage.getSettings(),reducedMotion:false};
  const project=p=>{v.copy(p).project(cam);return {x:v.x,y:v.y,z:v.z};};
  const measure=(label)=>{
   cam.updateMatrixWorld(true);
   // Screen extent from the actual visible rider + scooter vertices (no AABB inflation,
   // hidden hover ring excluded).
   let minX=9,maxX=-9,minY=9,maxY=-9;
   rc.mesh.updateMatrixWorld(true);
   rc.mesh.traverseVisible(o=>{if(!o.isMesh||o.material?.blending===T.AdditiveBlending)return;const pos=o.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld).project(cam);if(v.z>1)continue;minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}});
   const wheels=['frontWheel','backWheel'].map(k=>{const w=rc.mesh.userData[k];if(!w)return null;const p=new T.Vector3();w.getWorldPosition(p);const q=project(p);return q;}).filter(Boolean);
   const ahead=[25,45,70].map(d=>{const tp=tg.getTrackPoint(rc.s+d);return project(new T.Vector3(tp.x,tp.y,tp.z)).y;});
   // Road ahead: sample the full road width 12-70 m ahead; count samples that are on screen
   // and not hidden behind the rider's silhouette box.
   let seen=0,total=0;
   for(let d=12;d<=70;d+=4){const tp=tg.getTrackPoint(rc.s+d),tn=tg.getTrackTangent(rc.s+d);for(let l=-2.2;l<=2.21;l+=0.55){total++;const q=project(new T.Vector3(tp.x-tn.z*l,tp.y,tp.z+tn.x*l));
    const on=q.z<1&&Math.abs(q.x)<0.99&&Math.abs(q.y)<0.99;const hid=q.x>minX&&q.x<maxX&&q.y>minY&&q.y<maxY;if(on&&!hid)seen++;}}
   const camDist=cam.position.distanceTo(rc.mesh.position);
   const groundUnderCam=tg.getTrackPoint(cam.position.z).y;
   return {label,h:+(maxY-minY).toFixed(4),minY:+minY.toFixed(3),maxY:+maxY.toFixed(3),minX:+minX.toFixed(3),maxX:+maxX.toFixed(3),
    wheelsIn:wheels.length===2&&wheels.every(q=>Math.abs(q.x)<0.98&&Math.abs(q.y)<0.98&&q.z<1),
    bodyIn:minY>-0.99&&maxY<0.99&&minX>-0.99&&maxX<0.99,
    ahead:ahead.map(y=>+y.toFixed(3)),aheadVis:+(seen/total).toFixed(3),aheadClear:ahead.every(y=>y<0.99&&y>-0.99),
    camDist:+camDist.toFixed(3),camClear:+(cam.position.y-groundUnderCam).toFixed(3),fov:+cam.fov.toFixed(2)};
  };
  const setRider=(s,{lane=0,y=0,speed=16,lat=0,flags={}}={})=>{
   rc.s=s;rc.laneX=lane;rc.y=y;rc.forwardSpeed=speed;rc.lateralVelocity=lat;
   rc.activeOverdrive=false;rc.activeSkyFlight=false;rc.isGliding=false;rc.activeAntigravity=false;rc.isGrounded=y<=0.05;
   Object.assign(rc,flags);
   rc.updateProceduralAnimations(dt);rc.updateMeshTransform();tg.update(s,dt);
  };
  const run=(secs,fn)=>{let worst=null;const n=Math.round(secs*60);for(let i=0;i<n;i++){fn(i*dt,i);gc.update(dt,rc.mesh,tg,rc.activeOverdrive,settings,rc);const m=measure('');
   if(!worst)worst={...m,minYw:m.minY,maxYw:m.maxY,minXw:m.minX,maxXw:m.maxX,wheelsAll:m.wheelsIn,bodyAll:m.bodyIn,aheadAll:m.aheadClear,aheadMin:m.aheadVis,camClearMin:m.camClear,hMin:m.h,hMax:m.h};
   else{worst.minYw=Math.min(worst.minYw,m.minY);worst.maxYw=Math.max(worst.maxYw,m.maxY);worst.minXw=Math.min(worst.minXw,m.minX);worst.maxXw=Math.max(worst.maxXw,m.maxX);
    worst.wheelsAll=worst.wheelsAll&&m.wheelsIn;worst.bodyAll=worst.bodyAll&&m.bodyIn;worst.aheadAll=worst.aheadAll&&m.aheadClear;worst.aheadMin=Math.min(worst.aheadMin,m.aheadVis);worst.camClearMin=Math.min(worst.camClearMin,m.camClear);worst.hMin=Math.min(worst.hMin,m.h);worst.hMax=Math.max(worst.hMax,m.h);}
   worst.last=m;}
   return worst;};
  const out={};
  const scenario=(name,round,secs,fn,pre)=>{
   g.startRound(round);g.cancelCountdown();g.state='PAUSED';
   setRider(70,{});gc.reset(rc.mesh,tg);if(pre)pre();
   let s=70;const r=run(secs,(t,i)=>{const st=fn(t,i)||{};s+=(st.speed||16)*dt;setRider(s,st);});
   out[name]={steady:r.last,worst:{hMin:r.hMin,hMax:r.hMax,minY:+r.minYw.toFixed(3),maxY:+r.maxYw.toFixed(3),minX:+r.minXw.toFixed(3),maxX:+r.maxXw.toFixed(3),wheels:r.wheelsAll,body:r.bodyAll,ahead:r.aheadAll,aheadMin:r.aheadMin,camClear:r.camClearMin}};
  };
  const maxS=tun.maxSpeed;
  scenario('cruise',1,4,()=>({speed:16}));
  scenario('topSpeed',1,4,()=>({speed:maxS}));
  scenario('turbo',1,4,()=>({speed:maxS,flags:{activeOverdrive:true}}));
  scenario('turnLeftEdge',1,4,t=>{const lane=-2.2*Math.min(1,t/1.2);return {speed:18,lane,lat:t<1.2?-2.2/1.2:0};});
  scenario('slalom',1,5,t=>({speed:20,lane:2.2*Math.sin(t*2.6),lat:2.2*2.6*Math.cos(t*2.6)}));
  const V=10.5,G=22;
  scenario('jump',1,3,t=>{const tt=t-0.5;const y=tt>0?Math.max(0,V*tt-G*tt*tt/2):0;return {speed:18,y};});
  scenario('landing',1,2.2,t=>({speed:18}),()=>{gc.impact(1.0);});
  const ag=tun.antigravityGravity||0.35, gl=tun.glideFallSpeed||1.2;
  scenario('antigravity',1,5,t=>{const tt=t-0.3;let y=0;if(tt>0){const up=V/(G*ag);y=tt<up?V*tt-G*ag*tt*tt/2:Math.max(0,V*up-G*ag*up*up/2-gl*(tt-up));}return {speed:18,y,flags:{activeAntigravity:true,isGliding:tt>V/(G*ag)}};});
  scenario('skyFlight',1,4,t=>{const p=Math.min(1,t/3.6);return {speed:maxS,y:3.1+Math.sin(p*Math.PI)*2.1,flags:{activeSkyFlight:true,activeOverdrive:true}};});
  scenario('intro',1,3,()=>({speed:10}),()=>{gc.startIntro(2.6);});
  for(const id of [4,6,10,14]) scenario('world'+id,id,2.5,()=>({speed:16}));
  return out;
 },override);
 if(asJson)console.log(JSON.stringify(res));
 else for(const [k,r] of Object.entries(res))console.log(k.padEnd(13),'h',r.steady.h,'span',r.worst.hMin+'..'+r.worst.hMax,'y',r.worst.minY+'..'+r.worst.maxY,'x',r.worst.minX+'..'+r.worst.maxX,'wheels',r.worst.wheels,'body',r.worst.body,'roadAhead',r.steady.aheadVis+'(min '+r.worst.aheadMin+')','dist',r.steady.camDist,'camClear',r.worst.camClear,'fov',r.steady.fov);
 if(errors.length)console.log('errors',errors.slice(0,5));
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1);});
