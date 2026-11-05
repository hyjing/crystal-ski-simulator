// Rebuild a complete, smoothly joined ski outfit in bind pose; bake it once, never at runtime.
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const root=new URL('../',import.meta.url),bytes=fs.readFileSync(new URL('public/assets/skier-human.glb',root));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.updateMatrixWorld(true);
const body=scene.getObjectByName('SuperHero_Male'),source=body.geometry,p=source.attributes.position;
const smoothMin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const ellipsoid=(x,y,z,rx,ry,rz)=>(Math.hypot(x/rx,y/ry,z/rz)-1)*Math.min(rx,ry,rz);
function field(x,y,z){
 const waist=THREE.MathUtils.smoothstep(y,1.0,1.39),rx=.239+.023*waist,rz=.151+.010*waist;
 const side=(Math.hypot(x/rx,(z+.022)/rz)-1)*rz;
 let jacket=Math.max(side,.905-y,y-1.474);
 // Rounded shoulder / sleeve junctions; cuffs taper towards the actual wrists.
 const ax=Math.abs(x),t=THREE.MathUtils.clamp((ax-.235)/.44,0,1),r=THREE.MathUtils.lerp(.109,.072,t);
 const sleeve=Math.hypot(ax-THREE.MathUtils.clamp(ax,.205,.665),y-1.455,(z+.065)*1.05)-r;
 jacket=smoothMin(jacket,sleeve,.074);
 const collar=Math.max((Math.hypot(x/.117,(z+.025)/.12)-1)*.117,1.45-y,y-1.585);
 const collarHole=(.083-Math.hypot(x,(z+.025)*.97));
 jacket=smoothMin(jacket,Math.max(collar,collarHole),.025);
 // Seat and crotch blend into two distinct trouser legs, preserving a natural gap.
 let pants=ellipsoid(x,y-.864,z+.037,.224,.176,.159);
 for(const sign of [-1,1]){
  const yy=THREE.MathUtils.clamp(y,.235,.85),t=(yy-.235)/.615,r=THREE.MathUtils.lerp(.087,.118,t),cx=sign*(.119+.006*(1-t));
  let leg=Math.hypot(x-cx,y-yy,(z+.063-.027*t)*1.08)-r;
  const angle=Math.atan2(z+.05,x-cx),fold=.0035*Math.exp(-(((y-.53)/.12)**2))*Math.sin(y*72+angle*2.7)+.003*Math.exp(-(((y-.29)/.07)**2))*Math.sin(y*105-angle*3);
  leg-=fold;pants=smoothMin(pants,leg,.035);
 }
 return smoothMin(jacket,pants,.025);
}
const resolution=100,march=new MarchingCubes(resolution,new THREE.MeshStandardMaterial(),false,false,65000);march.isolation=0;
const min=new THREE.Vector3(-.84,.10,-.29),span=new THREE.Vector3(1.68,1.56,.58);
for(let k=0;k<resolution;k++)for(let j=0;j<resolution;j++)for(let i=0;i<resolution;i++)march.field[i+j*resolution+k*resolution*resolution]=-field(min.x+i/resolution*span.x,min.y+j/resolution*span.y,min.z+k/resolution*span.z);
march.update();
const positions=march.geometry.attributes.position.array.slice(0,march.count*3);
for(let i=0;i<positions.length;i+=3){positions[i]=min.x+(positions[i]+1)*.5*span.x;positions[i+1]=min.y+(positions[i+1]+1)*.5*span.y;positions[i+2]=min.z+(positions[i+2]+1)*.5*span.z;}
let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g=mergeVertices(g,1e-5);
const clean=[];for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2);if(a!==b&&b!==c&&a!==c)clean.push(a,b,c);}g.setIndex(clean);g.computeVertexNormals();
const q=g.attributes.position,weights=[],joints=[],uvs=[],colors=[],bins=new Map(),cell=.07;
const key=(x,y,z)=>`${x},${y},${z}`;
for(let i=0;i<p.count;i++){const k=key(Math.floor(p.getX(i)/cell),Math.floor(p.getY(i)/cell),Math.floor(p.getZ(i)/cell));if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);}
const blue=new THREE.Color('#377fa9'),navy=new THREE.Color('#253440'),panel=new THREE.Color('#2c617e'),zip=new THREE.Color('#b0bac0');
for(let i=0;i<q.count;i++){
 const x=q.getX(i),y=q.getY(i),z=q.getZ(i),cx=Math.floor(x/cell),cy=Math.floor(y/cell),cz=Math.floor(z/cell),nearest=[];
 for(let u=-3;u<=3;u++)for(let v=-3;v<=3;v++)for(let w=-3;w<=3;w++)for(const j of bins.get(key(cx+u,cy+v,cz+w))||[]){if(y<.77&&p.getX(j)*x<0)continue;const d=(p.getX(j)-x)**2+(p.getY(j)-y)**2+(p.getZ(j)-z)**2;nearest.push([d,j]);}
 nearest.sort((a,b)=>a[0]-b[0]);if(!nearest.length)throw Error('Unweighted outfit vertex');
 const influence=new Map();for(const [d,j] of nearest.slice(0,4))for(let c=0;c<4;c++){const bone=source.attributes.skinIndex.array[j*4+c],weight=source.attributes.skinWeight.array[j*4+c]/Math.max(d,.00001);influence.set(bone,(influence.get(bone)||0)+weight);}
 const top=[...influence].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((a,b)=>a+b[1],0);for(let c=0;c<4;c++){joints.push(top[c]?.[0]??0);weights.push((top[c]?.[1]??0)/sum);}
 let color=y<.946?navy:blue;if(y>.946&&Math.abs(x)>.19&&y<1.38)color=panel;if(y>1.49&&Math.abs(x)<.145)color=navy;if(y>.97&&y<1.47&&Math.abs(x)<.005&&z>.08)color=zip;
 color.toArray(colors,i*3);uvs.push(x*3,y*3);
}
g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
const suit=new THREE.SkinnedMesh(g,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.88,sheen:.22,sheenRoughness:.85}));suit.name='Unified ski suit';suit.bind(body.skeleton,body.bindMatrix);body.parent.add(suit);
// Keep the native human head and fingers. The whole covered body is removed from the render mesh.
const exposed=[];for(let i=0;i<source.index.count;i+=3){const tri=[source.index.getX(i),source.index.getX(i+1),source.index.getX(i+2)];if(tri.every(j=>(p.getY(j)>1.55&&Math.abs(p.getX(j))<.15)||Math.abs(p.getX(j))>.685))exposed.push(...tri);}source.setIndex(exposed);
const bodyColors=[];for(let i=0;i<p.count;i++)(Math.abs(p.getX(i))>.67?navy:new THREE.Color('#c49376')).toArray(bodyColors,i*3);source.setAttribute('color',new THREE.Float32BufferAttribute(bodyColors,3));body.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83});
const hard=new THREE.MeshStandardMaterial({color:'#e5e8e9',roughness:.38,metalness:.12}),rubber=new THREE.MeshStandardMaterial({color:'#202b34',roughness:.85}),buckle=new THREE.MeshStandardMaterial({color:'#9dabb4',roughness:.32,metalness:.65});
function attach(name,center){const bone=scene.getObjectByName(name),group=new THREE.Group();group.position.copy(center).sub(bone.getWorldPosition(new THREE.Vector3())).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());group.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion())).invert();bone.add(group);return group;}
function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
const head=attach('Head',new THREE.Vector3(0,1.725,0));head.name='Integrated helmet and goggles';
mesh(head,new THREE.SphereGeometry(.137,40,28,0,Math.PI*2,0,Math.PI*.64),hard);
mesh(head,new THREE.SphereGeometry(.141,40,24,Math.PI*.10,Math.PI*.80,Math.PI*.38,Math.PI*.25),rubber,0,-.01,.01);
mesh(head,new THREE.SphereGeometry(.145,40,24,Math.PI*.13,Math.PI*.74,Math.PI*.40,Math.PI*.20),new THREE.MeshPhysicalMaterial({color:'#77a9c9',metalness:.45,roughness:.12,clearcoat:.9}),0,-.01,.013);
function sculptBoot(){
 const n=40,m=new MarchingCubes(n,rubber,false,false,10000);m.isolation=0;
 for(let k=0;k<n;k++)for(let j=0;j<n;j++)for(let i=0;i<n;i++){
  const x=-.105+i/n*.21,y=-.13+j/n*.36,z=-.15+k/n*.38;
  const foot=ellipsoid(x,y+.037,z-.045,.078,.076,.149),cuff=ellipsoid(x,y-.048,z+.036,.074,.125,.085);
  m.field[i+j*n+k*n*n]=-smoothMin(foot,cuff,.04);
 }
 m.update();const a=m.geometry.attributes.position.array.slice(0,m.count*3);for(let i=0;i<a.length;i+=3){a[i]=-.105+(a[i]+1)*.105;a[i+1]=-.13+(a[i+1]+1)*.18;a[i+2]=-.15+(a[i+2]+1)*.19;}
 let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(a,3));g=mergeVertices(g,1e-5);const clean=[];for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2);if(a!==b&&a!==c&&b!==c)clean.push(a,b,c);}g.setIndex(clean);g.computeVertexNormals();return g;
}
const bootShape=sculptBoot();
for(const sign of [-1,1]){
 const boot=attach(`foot_${sign>0?'l':'r'}`,new THREE.Vector3(sign*.114,.13,-.05));boot.name='Articulated ski boot';
 mesh(boot,bootShape,rubber);
 for(let j=0;j<3;j++)mesh(boot,new RoundedBoxGeometry(.13,.012,.021,2,.004),buckle,0,-.025+j*.047,.106-j*.019);
 const points=[-.065,-.035,0,.035,.065].map(z=>new THREE.Vector3(sign*.05,Math.sqrt(.137*.137-.05*.05-z*z)+.002,z));mesh(head,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.0027,6,false),rubber);
}
scene.getObjectByName('Eyes').material=new THREE.MeshStandardMaterial({color:'#deded8',roughness:.4});scene.getObjectByName('Eyebrows').material=rubber;
scene.name='Complete winter skier';scene.userData={source:'CC0 Quaternius head, hands and 65-bone skeleton; authored continuous ski suit and equipment',generator:'scripts/build-skier.mjs'};
// Node's Blob is available; GLTFExporter only needs these two FileReader methods.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.();});}};
const output=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});fs.writeFileSync(new URL('public/assets/skier-complete.glb',root),Buffer.from(output));
console.log(JSON.stringify({vertices:q.count,triangles:g.index.count/3,bytes:output.byteLength}));
