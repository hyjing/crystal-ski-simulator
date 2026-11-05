import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export function mergeAssetGeometry(list){
  const mixed=list.some(g=>g.index)&&list.some(g=>!g.index),normalized=mixed?list.map(g=>g.index?g.toNonIndexed():g):list;
  const merged=mergeGeometries(normalized);if(mixed)normalized.forEach((g,i)=>{if(g!==list[i])g.dispose();});return merged;
}
function surfaceTexture(kind){
  const size=256,data=new Uint8Array(size*size*4);let state=71;const rng=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let color;if(kind==='wood'){const seam=x%32<2,grain=Math.sin(x*.9+Math.sin(y*.018)*2)*4+Math.sin(x*.23+y*.004)*7+rng()*7;const board=Math.sin(Math.floor(x/32)*13)*8;color=seam?[53,42,34]:[112+grain+board,83+grain*.75+board,59+grain*.5+board];}
    else{const seam=(y%64<3)||((x+(Math.floor(y/64)%2)*32)%64<3),grain=rng()*18+Math.sin(x*.7+y*.5)*5;color=seam?[84,86,84]:[126+grain,130+grain,128+grain];}
    data.set([...color,255],(y*size+x)*4);
  }
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;return t;
}
export function resortMaterials(){
  const wood=surfaceTexture('wood'),stone=surfaceTexture('stone');
  return{metal:new THREE.MeshStandardMaterial({color:'#52636c',roughness:.36,metalness:.72}),dark:new THREE.MeshStandardMaterial({color:'#26343a',roughness:.5,metalness:.45}),wood:new THREE.MeshStandardMaterial({map:wood,bumpMap:wood,bumpScale:.015,roughness:.92}),stone:new THREE.MeshStandardMaterial({map:stone,bumpMap:stone,bumpScale:.04,roughness:.97}),snow:new THREE.MeshStandardMaterial({color:'#edf2f6',roughness:.96}),glass:new THREE.MeshPhysicalMaterial({color:'#91b1c0',metalness:.22,roughness:.16,clearcoat:1,emissive:'#ddc2a0',emissiveIntensity:.06}),seat:new THREE.MeshStandardMaterial({color:'#385568',roughness:.87}),paint:new THREE.MeshStandardMaterial({color:'#d0d8d8',metalness:.35,roughness:.4})};
}
export function detailedChair(){
  const parts=[[],[],[]];
  const box=(g,w,h,d,x,y,z)=>{const m=new THREE.BoxGeometry(w,h,d);m.translate(x,y,z);parts[g].push(m);};
  function pipe(g,points,r=.035){const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,r,6,false);parts[g].push(geometry);}
  pipe(0,[[0,2.85,0],[0,1.8,0],[-.3,.75,-.4],[-1.15,.15,-.4]],.065);
  for(const s of [-1,1]){pipe(0,[[s*1.20,.7,-.42],[s*1.20,.1,-.45],[s*1.20,-.1,.36],[s*1.20,.25,.5]],.045);pipe(0,[[s*1.12,.55,.65],[s*1.12,.12,.8],[s*.9,-.65,.8]],.032);}
  pipe(0,[[-1.18,.55,.65],[0,.55,.65],[1.18,.55,.65]],.036);
  box(0,2.5,.08,1.02,0,-.08,0);box(0,2,.05,.20,0,-.65,.8);box(0,.38,.16,.26,0,2.80,0);
  for(let i=0;i<4;i++){const x=-.91+i*.60;const seat=new RoundedBoxGeometry(.56,.13,.78,2,.045);seat.translate(x,.03,.01);parts[1].push(seat);const back=new RoundedBoxGeometry(.56,.57,.13,2,.04);back.translate(x,.35,-.40);parts[1].push(back);}
  box(2,.32,.18,.04,0,.70,-.44);
  return parts.map(list=>{const g=mergeAssetGeometry(list);list.forEach(x=>x.dispose());return g;});
}
export function detailedCabin(){
  const parts=[[],[],[]],box=(group,w,h,d,x,y,z)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts[group].push(g);};
  const shell=new RoundedBoxGeometry(2.35,1.75,1.95,4,.26);shell.translate(0,.52,0);parts[0].push(shell);
  const roof=new RoundedBoxGeometry(2.6,.20,2.16,3,.09);roof.translate(0,1.48,0);parts[0].push(roof);
  for(const side of [-1,1]){box(1,2.0,.94,.04,0,.80,side*.985);box(1,.04,.94,1.5,side*1.18,.80,0);for(const x of [-.60,0,.60])box(0,.035,1.1,.065,x,.80,side*1.015);box(0,2.1,.045,.075,0,.30,side*1.01);box(2,.09,.25,.09,side*.12,.64,1.05);for(const x of [-.75,-.35,.35,.75])box(2,.18,.35,.28,x,-.24,-1.12);}
  box(2,.16,1.1,.16,0,2.05,0);box(2,.44,.14,.29,0,2.62,0);
  return parts.map(list=>{const g=mergeAssetGeometry(list);list.forEach(x=>x.dispose());return g;});
}
export function towerAccessories(){
  const parts=[];const box=(w,h,d,x,y,z)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(g);};
  for(const x of [-.24,.24])box(.045,14,.05,x,.4,.63);for(let y=-6.5;y<7.4;y+=.45)box(.53,.035,.06,0,y,.66);
  box(2.0,.10,1.25,0,6.8,0);for(const x of [-.95,.95]){box(.035,1.05,.035,x,7.35,.58);box(.035,.035,1.2,x,7.85,0);}box(2,.035,.035,0,7.85,.58);
  for(const x of [-2.5,2.5])for(let z=-.85;z<=.85;z+=.42){const g=new THREE.CylinderGeometry(.23,.23,.15,12);g.rotateZ(Math.PI/2);g.translate(x,7.6,z);parts.push(g);}const g=mergeAssetGeometry(parts);parts.forEach(p=>p.dispose());return g;
}
