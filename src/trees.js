import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function hitsTreeTrunk(a,b,tree,riderRadius=.36){
  const radius=(tree.trunkRadius||.22*(tree.size||1))+riderRadius,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  const t=l2?THREE.MathUtils.clamp(((tree.x-a.x)*dx+(tree.z-a.z)*dz)/l2,0,1):0;
  return (a.x+t*dx-tree.x)**2+(a.z+t*dz-tree.z)**2<radius*radius;
}

function branchTexture(){
  const w=256,h=192,bytes=new Uint8Array(w*h*4);let state=32;
  const rng=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
  function line(x0,y0,x1,y1,color,radius=0){const steps=Math.ceil(Math.hypot(x1-x0,y1-y0)*1.5);for(let k=0;k<=steps;k++){const x=Math.round(x0+(x1-x0)*k/steps),y=Math.round(y0+(y1-y0)*k/steps);for(let dx=-radius;dx<=radius;dx++)for(let dy=-radius;dy<=radius;dy++){const u=x+dx,v=y+dy;if(u<0||v<0||u>=w||v>=h)continue;bytes.set([...color,255],(v*w+u)*4);}}}
  line(2,96,252,96,[69,69,48],1);
  for(let i=0;i<24;i++)for(const sign of [-1,1]){
    const x=12+i*9.4,endX=Math.min(254,x+34+rng()*18),endY=96+sign*(12+60*Math.pow(1-x/270,.7))*(.6+rng()*.4);
    line(x,96,endX,endY,[23,59,37]);
    for(let k=0;k<20;k++){const t=k/20,bx=x+(endX-x)*t,by=96+(endY-96)*t;for(const side of [-1,1]){const length=4+rng()*10,shade=.7+rng()*.7;line(bx,by,bx+length*.75,by+side*length,[24*shade,66*shade,43*shade]);}}
    if(rng()>.32)line(x+4,94,endX-3,endY-2,[211+rng()*23,225+rng()*20,235+rng()*19],1);
  }
  const texture=new THREE.DataTexture(bytes,w,h,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}
// Fine needle cutouts on bent branch meshes keep a porous, irregular silhouette.
function treePrototype(seed,detail=true){
  let state=seed;const rng=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
  const wood=[],foliage=[],snow=[];
  function branch(a,b,r){const direction=new THREE.Vector3().subVectors(b,a),g=new THREE.CylinderGeometry(r*.3,r,direction.length(),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);wood.push(g);}
  branch(new THREE.Vector3(),new THREE.Vector3(.12,20,0),.22);
  const count=detail?105:38;
  for(let i=0;i<count;i++){
    const h=1.1+i/count*18.5+(rng()-.5)*.55,angle=i*2.39996+rng()*.5;
    const length=(.25+3.4*Math.pow(1-h/21,.78))*(.72+rng()*.5),a=new THREE.Vector3(0,h,0),b=new THREE.Vector3(Math.cos(angle)*length,h-.25-length*.13,Math.sin(angle)*length);
    if(detail)branch(a,b,.025+length*.017);
    for(const tilt of [0,.45]){
      const leaf=new THREE.PlaneGeometry(length,length*.8,detail?4:2,2);leaf.translate(length/2,0,0);leaf.rotateX(-Math.PI/2+tilt);const p=leaf.attributes.position;
      for(let j=0;j<p.count;j++)p.setY(j,p.getY(j)-p.getX(j)*.20+Math.sin(p.getX(j)*1.7)*.07);
      leaf.rotateY(-angle);leaf.translate(0,h,0);leaf.computeVertexNormals();foliage.push(leaf);
    }
    const p=a.clone().lerp(b,.57),size=length*.57;
    if(rng()<.8){const cap=new THREE.SphereGeometry(1,detail?7:5,3,0,Math.PI*2,0,Math.PI*.57),v=cap.attributes.position;for(let k=0;k<v.count;k++){const f=.80+rng()*.35;v.setXYZ(k,v.getX(k)*f,v.getY(k),v.getZ(k)*f);}cap.scale(size,.08+size*.10,.15+size*.18);cap.rotateY(-angle);cap.translate(p.x,p.y+.10,p.z);cap.computeVertexNormals();snow.push(cap);}
  }
  const merge=list=>{const g=mergeGeometries(list);list.forEach(x=>x.dispose());return g;};
  return [merge(wood),merge(foliage),merge(snow)];
}

export function installDetailedTrees(scene,farForest,trees){
  const materials=[new THREE.MeshStandardMaterial({color:'#63574b',roughness:1}),new THREE.MeshStandardMaterial({color:'#ffffff',map:branchTexture(),alphaTest:.38,side:THREE.DoubleSide,roughness:.96}),new THREE.MeshStandardMaterial({color:'#f0f4f8',roughness:.92})];
  const levels=[{distance:125,capacity:16,detail:true},{distance:480,capacity:48,detail:false}];
  const pools=levels.map(level=>Array.from({length:3},(_,variant)=>treePrototype(71+variant*29,level.detail).map((g,i)=>{const m=new THREE.InstancedMesh(g,materials[i],level.capacity);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.castShadow=m.receiveShadow=true;m.frustumCulled=false;m.count=0;scene.add(m);return m;})));
  const dummy=new THREE.Object3D(),hidden=new Set();let last=-Infinity;
  const cells=new Map();for(const tree of trees){tree.trunkRadius=.22*tree.size;const key=`${Math.floor(tree.x/16)},${Math.floor(tree.z/16)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(tree);}
  trees.nearby=(x,z)=>{const out=[],u=Math.floor(x/16),v=Math.floor(z/16);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)out.push(...cells.get(`${u+a},${v+b}`)||[]);return out;};
  trees.updateLOD=(point,time)=>{
    if(time-last<500)return;last=time;
    const candidates=[];for(let index=0;index<trees.length;index++){const tree=trees[index],d=(tree.x-point.x)**2+(tree.z-point.z)**2;if(d<480**2)candidates.push({tree,index,d});}candidates.sort((a,b)=>a.d-b.d);
    const counts=levels.map(()=>[0,0,0]),active=new Set();
    for(const item of candidates){const {tree,index,d}=item,variant=index%3;let level=d<125**2?0:1;if(counts[level][variant]>=levels[level].capacity){if(level===0)level=1;else continue;}if(counts[level][variant]>=levels[level].capacity)continue;
      const slot=counts[level][variant]++;active.add(index);dummy.position.set(tree.x,tree.y,tree.z);dummy.rotation.set(0,tree.rotation,0);dummy.scale.set(tree.scaleX,tree.size,tree.size);dummy.updateMatrix();pools[level][variant].forEach(m=>m.setMatrixAt(slot,dummy.matrix));
    }
    let changed=false;
    for(const index of new Set([...hidden,...active])){if(hidden.has(index)===active.has(index))continue;const p=trees[index];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(active.has(index)?0:p.scaleX,active.has(index)?0:p.size,active.has(index)?0:p.size);dummy.updateMatrix();farForest.setMatrixAt(index,dummy.matrix);farForest.instanceMatrix.addUpdateRange(index*16,16);changed=true;}
    if(changed)farForest.instanceMatrix.needsUpdate=true;hidden.clear();active.forEach(i=>hidden.add(i));
    pools.forEach((variants,l)=>variants.forEach((parts,v)=>parts.forEach(m=>{m.count=counts[l][v];m.instanceMatrix.needsUpdate=true;})));
  };
}
