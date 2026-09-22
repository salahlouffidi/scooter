/* Original LOUFFI art kit. Shared by the offline GLB builder and fallback renderer. */
(function (root) {
  root.buildLouffiKit = function (T) {
    const kit = new T.Group(); kit.name = 'LOUFFI_Visual_Kit';
    const materials = {};
    function mat(color, metalness = 0, roughness = .78) {
      const key = color + ':' + metalness;
      return materials[key] || (materials[key] = new T.MeshStandardMaterial({color, metalness, roughness}));
    }
    function mesh(g, geometry, color, pos, scale, name) {
      const m = new T.Mesh(geometry, typeof color === 'number' ? mat(color) : color);
      if (pos) m.position.set(...pos); if (scale) m.scale.set(...scale);
      m.castShadow = true; m.receiveShadow = true; if(name)m.name=name; g.add(m); return m;
    }
    const sphere = new T.SphereGeometry(1, 16, 12), box = new T.BoxGeometry(1,1,1);
    const ball = (g,c,p,s,n)=>mesh(g,sphere,c,p,s,n);
    const block = (g,c,p,s,n)=>mesh(g,box,c,p,s,n);
    function bone(g,a,b,r,c,name) {
      const av=new T.Vector3(...a), bv=new T.Vector3(...b), d=bv.clone().sub(av);
      const m=mesh(g,new T.CylinderGeometry(r*.9,r,d.length(),12),c,av.clone().add(bv).multiplyScalar(.5).toArray(),null,name);
      m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
      ball(g,c,a,[r,r,r]);ball(g,c,b,[r*.9,r*.9,r*.9]);return m;
    }
    function group(name,parent=kit){const g=new T.Group();g.name=name;parent.add(g);return g;}
    const riderRoot=group('RiderScooter'), scooter=group('scooter',riderRoot), rider=group('rider',riderRoot);
    const red=0xe95142, denim=0x365f91, skin=0xe9ac83, metal=mat(0xa8bfcb,.72,.3);
    block(scooter,0x30b7e3,[0,.24,0],[.43,.12,1.48]);
    block(scooter,0x273c48,[0,.309,0],[.34,.025,1.15]);
    for(const z of [-.65,.65]){
      const wheel=group(z>0?'frontWheel':'backWheel',scooter);wheel.position.set(0,.19,z);
      const tire=mesh(wheel,new T.TorusGeometry(.145,.045,8,20),0x25313b);tire.rotation.y=Math.PI/2;
      const hub=mesh(wheel,new T.CylinderGeometry(.1,.1,.1,16),metal);hub.rotation.z=Math.PI/2;
      bone(scooter,[0,.22,z],[0,.43,z-.06],.045,metal);
    }
    bone(scooter,[0,.37,.65],[0,1.48,.51],.04,metal);
    bone(scooter,[-.44,1.48,.51],[.44,1.48,.51],.035,metal);
    bone(scooter,[-.44,1.48,.51],[-.27,1.48,.51],.055,0x24323e);
    bone(scooter,[.27,1.48,.51],[.44,1.48,.51],.055,0x24323e);
    block(scooter,0xff5555,[0,.29,-.73],[.12,.065,.035]);
    ball(rider,red,[0,1.31,.04],[.32,.43,.22]);
    ball(rider,0xc53e36,[0,1.6,-.13],[.235,.19,.115]); // folded hood
    ball(rider,0xef6350,[0,1.16,.218],[.19,.12,.04]);
    bone(rider,[-.12,.98,.03],[-.16,.64,.12],.115,denim,'leftLeg');
    bone(rider,[-.16,.64,.12],[-.13,.39,.27],.085,denim);
    bone(rider,[.13,.98,.02],[.16,.68,-.17],.115,denim,'rightLeg');
    bone(rider,[.16,.68,-.17],[.14,.4,-.39],.08,denim);
    for(const [x,z] of [[-.13,.3],[.14,-.37]]){
      ball(rider,0xf5f0e6,[x,.37,z],[.115,.09,.22]);block(rider,0xffffff,[x,.31,z],[.21,.045,.38]);
    }
    for(const side of [-1,1]){
      bone(rider,[side*.26,1.55,.03],[side*.42,1.28,.2],.1,red);
      bone(rider,[side*.42,1.28,.2],[side*.34,1.48,.51],.08,red);
      ball(rider,skin,[side*.34,1.48,.52],[.067,.07,.07]);
    }
    bone(rider,[0,1.63,.11],[0,1.76,.15],.085,skin);
    const head=group('headGroup',rider);head.position.set(0,1.86,.16);
    ball(head,skin,[0,-.025,.015],[.18,.21,.175]);
    ball(head,0x51372c,[0,.015,-.11],[.18,.155,.08]);
    ball(head,0x475767,[0,.09,0],[.226,.2,.216]);
    for(const x of [-.1,0,.1]) ball(head,0x172630,[x,.245,-.065],[.024,.009,.052]);
    bone(head,[-.17,.02,.01],[-.09,-.19,.04],.012,0x28323c);
    bone(head,[.17,.02,.01],[.09,-.19,.04],.012,0x28323c);

    const tree=group('Tree');bone(tree,[0,0,0],[0,2.3,0],.18,0x865331);
    for(const [x,y,z,s] of [[0,2.5,0,1.25],[-.75,2.15,.05,.85],[.8,2.3,.15,.9],[.15,3.12,.03,.8]])ball(tree,0x56893a,[x,y,z],[s,s*.7,s*.82]);
    const island=group('Island');
    const rock=mesh(island,new T.DodecahedronGeometry(1,1),0xb09b80,[0,-2.1,0],[5.1,3.8,4.4]);
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ball(island,0xc0aa8a,[Math.cos(a)*3.4,-1.2,Math.sin(a)*2.8],[1.65,2,1.4]);}
    ball(island,0x79ad45,[0,.15,0],[5.15,.85,4.45]);
    ball(island,0x9bbe56,[-1,.54,-.4],[3.4,.45,2.9]);
    const t1=tree.clone(true);t1.position.set(-2,.75,0);t1.scale.setScalar(.8);island.add(t1);
    const t2=tree.clone(true);t2.position.set(2,.75,-1);t2.scale.setScalar(.65);island.add(t2);

    const tower=group('Castle');
    for(const [x,z,h,r] of [[0,0,9,1.8],[-3,1,6,1],[3,1,6.5,1]]){
      mesh(tower,new T.CylinderGeometry(r,r*1.08,h,16),0xe1cbaa,[x,h/2,z]);
      for(let i=0;i<4;i++)mesh(tower,new T.CylinderGeometry(r*1.05,r*1.05,.16,16),0xc9b393,[x,1+i*h/4,z]);
      mesh(tower,new T.ConeGeometry(r*1.3,3,16),0xc96c49,[x,h+1.4,z]);
      for(let y=2;y<h;y+=2)block(tower,0x5e716f,[x,y,z-r-.01],[.45,.85,.08]);
      bone(tower,[x,h+2.8,z],[x,h+3.65,z],.035,0xceab4f);
    }
    block(tower,0xdac09c,[0,2,1],[6,4,1.5]);
    for(let i=-3;i<=3;i++)block(tower,0xe1cbaa,[i,4.35,1],[.5,.7,1.5]);

    const cloud=group('Cloud');
    [[0,0,0,2],[-2,-.2,0,1.3],[2,-.1,0,1.5],[.7,.7,0,1.5]].forEach(([x,y,z,s])=>ball(cloud,0xffffff,[x,y,z],[s,s*.6,s*.75]));
    const waterfall=group('Waterfall');
    for(let i=0;i<7;i++){
      const water=mat(i%2?0xacebfa:0x58cde9,.08,.22);
      block(waterfall,water,[(i-3)*.34,-7.5,0],[.37,15,.18+(i%3)*.08]);
    }
    for(let i=0;i<4;i++)ball(waterfall,0xe2f8ff,[(i-1.5)*.7,-15,0],[.9,.3,.65]);

    const crate = group('Crate');
    // Main wooden cargo crate body
    block(crate, 0x8d5b32, [0, .6, 0], [1.14, 1.14, 1.14]);
    // Horizontal wood plank grooves and framing on front and back
    for (const z of [-.575, .575]) {
      for (const y of [.32, .6, .88]) {
        block(crate, 0x6e431f, [0, y, z], [1.02, .03, .02]);
      }
      // Top and bottom horizontal framing rails
      block(crate, 0x5a3617, [0, .07, z], [1.18, .13, .07]);
      block(crate, 0x5a3617, [0, 1.13, z], [1.18, .13, .07]);
      // Diagonal X-bracing timbers
      for (const a of [-.62, .62]) {
        const b = block(crate, 0x673e1c, [0, .6, z + (z > 0 ? .01 : -.01)], [.11, 1.16, .03]);
        b.rotation.z = a;
      }
      // High-visibility hazard caution plate
      block(crate, 0xffb300, [0, .6, z + (z > 0 ? .025 : -.025)], [.82, .2, .015]);
      // Diagonal caution hazard stripes
      for (const ox of [-.28, -.14, 0, .14, .28]) {
        const s = block(crate, 0x212121, [ox, .6, z + (z > 0 ? .032 : -.032)], [.05, .18, .01]);
        s.rotation.z = .45;
      }
    }
    // Side horizontal framing rails and X-braces along X
    for (const x of [-.575, .575]) {
      block(crate, 0x5a3617, [x, .07, 0], [.07, .13, 1.05]);
      block(crate, 0x5a3617, [x, 1.13, 0], [.07, .13, 1.05]);
      for (const a of [-.62, .62]) {
        const b = block(crate, 0x673e1c, [x + (x > 0 ? .01 : -.01), .6, 0], [.03, 1.16, .11]);
        b.rotation.x = a;
      }
    }
    // 4 vertical corner posts
    for (const x of [-.54, .54]) {
      for (const z of [-.54, .54]) {
        block(crate, 0x523013, [x, .6, z], [.13, 1.2, .13]);
      }
    }
    // Reinforced steel corner brackets
    for (const x of [-.55, .55]) {
      for (const y of [.07, 1.13]) {
        for (const z of [-.55, .55]) {
          block(crate, mat(0x2e3b44, .7, .4), [x, y, z], [.15, .15, .15]);
        }
      }
    }
    // Top caution hazard plate
    block(crate, 0xffb300, [0, 1.185, 0], [.65, .015, .65]);
    for (const ox of [-.18, 0, .18]) {
      const ts = block(crate, 0x212121, [ox, 1.192, 0], [.045, .01, .6]);
      ts.rotation.y = .45;
    }
    return kit;
  };
})(typeof window !== 'undefined' ? window : globalThis);

