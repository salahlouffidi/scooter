// Reproducible, dependency-free GLB 2.0 export using the project's bundled Three.js.
const fs=require('fs'),path=require('path');
const T=require('../app/src/main/assets/game/lib/three.min.js');
require('../app/src/main/assets/game/js/visualKit.js');
const root=globalThis.buildLouffiKit(T);
const doc={asset:{version:'2.0',generator:'LOUFFI original modular art kit'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
let chunks=[],offset=0;const geometries=new Map(),materials=new Map();
function accessor(array,type,target){
 const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
 const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=doc.bufferViews.length;
 doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});chunks.push(bytes);offset+=bytes.length;
 const n={SCALAR:1,VEC3:3}[type],a={bufferView:view,componentType:array instanceof Float32Array?5126:array instanceof Uint32Array?5125:5123,count:array.length/n,type};
 if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++) {let k=i%3;a.min[k]=Math.min(a.min[k],array[i]);a.max[k]=Math.max(a.max[k],array[i]);}}
 return doc.accessors.push(a)-1;
}
function material(m){if(materials.has(m.uuid))return materials.get(m.uuid);const i=doc.materials.length;doc.materials.push({name:'material_'+i,pbrMetallicRoughness:{baseColorFactor:[m.color.r,m.color.g,m.color.b,1],metallicFactor:m.metalness||0,roughnessFactor:m.roughness??.8}});materials.set(m.uuid,i);return i;}
function node(o){const n={name:o.name||'part',translation:o.position.toArray(),rotation:o.quaternion.toArray(),scale:o.scale.toArray()},i=doc.nodes.push(n)-1;
 if(o.isMesh){const key=o.geometry.uuid+o.material.uuid;if(!geometries.has(key)){const g=o.geometry,p={attributes:{POSITION:accessor(g.attributes.position.array,'VEC3',34962),NORMAL:accessor(g.attributes.normal.array,'VEC3',34962)},material:material(o.material)};if(g.index)p.indices=accessor(g.index.array,'SCALAR',34963);geometries.set(key,doc.meshes.push({primitives:[p]})-1);}n.mesh=geometries.get(key);}
 if(o.children.length)n.children=o.children.map(node);return i;}
doc.scenes[0].nodes=root.children.map(node);doc.buffers=[{byteLength:offset}];
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
let bin=Buffer.concat(chunks);bin=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]);
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
function chunk(b,t){const h=Buffer.alloc(8);h.writeUInt32LE(b.length);h.writeUInt32LE(t,4);return Buffer.concat([h,b]);}
const out=path.resolve(__dirname,'../app/src/main/assets/game/models/louffi-world.glb');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,Buffer.concat([header,chunk(json,0x4e4f534a),chunk(bin,0x004e4942)]));console.log(out,fs.statSync(out).size,'bytes',doc.nodes.length,'nodes');
