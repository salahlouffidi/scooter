/* Loader for our documented uncompressed static GLB subset, not a general glTF loader. */
window.loadLouffiKit = async function () {
  const T=window.THREE;
  try {
    let buffer;
    if(window.AndroidBridge && window.AndroidBridge.readVisualKit){
      const raw=atob(window.AndroidBridge.readVisualKit());buffer=Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
    } else {const r=await fetch('models/louffi-world.glb');if(!r.ok)throw Error('GLB HTTP '+r.status);buffer=await r.arrayBuffer();}
    const v=new DataView(buffer);if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2)throw Error('Invalid GLB');
    const jl=v.getUint32(12,true),d=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jl))),base=28+jl;
    function attr(i){const a=d.accessors[i],b=d.bufferViews[a.bufferView],C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];if(!C)throw Error('Unsupported accessor');return new T.BufferAttribute(new C(buffer,base+(b.byteOffset||0)+(a.byteOffset||0),a.count*({VEC3:3,SCALAR:1}[a.type])),a.type==='VEC3'?3:1);}
    const mats=d.materials.map(m=>{const p=m.pbrMetallicRoughness;return new T.MeshStandardMaterial({color:new T.Color(...p.baseColorFactor.slice(0,3)),metalness:p.metallicFactor,roughness:p.roughnessFactor});});
    const meshes=d.meshes.map(m=>{const p=m.primitives[0],g=new T.BufferGeometry();g.setAttribute('position',attr(p.attributes.POSITION));g.setAttribute('normal',attr(p.attributes.NORMAL));if(p.indices!==undefined)g.setIndex(attr(p.indices));return {g,m:mats[p.material]};});
    function node(i){const n=d.nodes[i],a=n.mesh!==undefined?new T.Mesh(meshes[n.mesh].g,meshes[n.mesh].m):new T.Group();a.name=n.name;if(n.translation)a.position.fromArray(n.translation);if(n.rotation)a.quaternion.fromArray(n.rotation);if(n.scale)a.scale.fromArray(n.scale);a.castShadow=true;a.receiveShadow=true;(n.children||[]).forEach(c=>a.add(node(c)));return a;}
    const kit=new T.Group();d.scenes[d.scene||0].nodes.forEach(i=>kit.add(node(i)));window.louffiKit=kit;window.louffiAssetStatus='GLB loaded';
  } catch(e){console.warn('Visual kit fallback:',e);window.louffiKit=window.buildLouffiKit(T);window.louffiAssetStatus='procedural fallback';}
  // Merge static scenery by material once; preserve the articulated rider hierarchy.
  for(const original of [...window.louffiKit.children]){
    if(original.name==='RiderScooter')continue;
    original.updateMatrixWorld(true);const buckets=new Map();
    original.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrixWorld);const b=buckets.get(m.material)||[];b.push(g);buckets.set(m.material,b);});
    const merged=new T.Group();merged.name=original.name;
    for(const [material,geometries] of buckets){const g=new T.BufferGeometry();for(const key of ['position','normal']){const length=geometries.reduce((n,x)=>n+x.attributes[key].array.length,0),out=new Float32Array(length);let offset=0;for(const x of geometries){out.set(x.attributes[key].array,offset);offset+=x.attributes[key].array.length;}g.setAttribute(key,new T.BufferAttribute(out,3));}const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;merged.add(m);geometries.forEach(x=>x.dispose());}
    window.louffiKit.remove(original);window.louffiKit.add(merged);
  }
};
