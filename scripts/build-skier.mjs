// Rebuild a complete, smoothly joined ski outfit in bind pose; bake it once, never at runtime.
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const npc=process.argv.includes('--npc');
const root=new URL('../',import.meta.url),bytes=fs.readFileSync(new URL('public/assets/skier-human.glb',root));
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');scene.updateMatrixWorld(true);
const body=scene.getObjectByName('SuperHero_Male'),source=body.geometry,p=source.attributes.position;
const smoothMin=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const smoothMax=(a,b,k)=>-smoothMin(-a,-b,k);
const ellipsoid=(x,y,z,rx,ry,rz)=>(Math.hypot(x/rx,y/ry,z/rz)-1)*Math.min(rx,ry,rz);
// Curated garment sections: a loose hem, a tucked waist, full chest and dropped shoulders.
// Interpolate with a smooth cubic so the silhouette has no straight-sided cylinder or flat shoulder cap.
function profile(y,sections){
 let i=0;while(i<sections.length-2&&y>sections[i+1][0])i++;
 const a=sections[i],b=sections[i+1],t=THREE.MathUtils.smoothstep(y,a[0],b[0]);return a.slice(1).map((v,j)=>THREE.MathUtils.lerp(v,b[j+1],t));
}
const jacketSections=[[.87,.272,.145],[.96,.280,.158],[1.08,.250,.149],[1.19,.251,.150],[1.32,.279,.158],[1.41,.273,.148],[1.50,.190,.110]];
const legSections=[[.19,.108,.098],[.29,.111,.103],[.37,.108,.100],[.49,.114,.112],[.60,.117,.115],[.74,.122,.126],[.87,.128,.133]];
const band=(value,width)=>Math.exp(-((value/width)**2));
function field(x,y,z){
 const ax=Math.abs(x),[rx,rz]=profile(y,jacketSections),centerZ=-.025+.009*band(y-1.32,.15);
 // Slightly flattened front/back panels read as draped clothing rather than a round tube.
 const n=2.65,side=(Math.pow(Math.pow(ax/rx,n)+Math.pow(Math.abs(z-centerZ)/rz,n),1/n)-1)*Math.min(rx,rz);
 const hem=.889+.010*Math.sin(x*13+z*9)+.005*Math.sin(x*29-z*17),shoulderTop=1.515-.095*Math.pow(Math.min(ax/.275,1.3),1.65);
 let jacket=smoothMax(side,smoothMax(hem-y,y-shoulderTop,.020),.018);
 const front=THREE.MathUtils.smoothstep(z,.03,.13),back=THREE.MathUtils.smoothstep(-z,.06,.16);
 // Local compression folds, not evenly spaced rings. A ridge and its adjacent hollow form each fold.
 const crease=(line,width,amount)=>amount*(band(y-line,width)-.52*band(y-line-width*1.1,width*.75));
 jacket-=front*.4*(crease(1.01+.22*ax+.014*Math.sin(x*19),.018,.009)+crease(1.235-.30*ax+.014*Math.sin(x*15),.015,.006)+crease(1.355-.42*ax,.018,.007));
 jacket-=back*.45*(crease(1.055+.13*x+.010*Math.sin(x*23),.022,.007)+crease(1.32-.07*Math.cos(x*10),.018,.005));
 // Sleeves have a full upper arm, elbow ease and gathered cuffs, instead of a linear tapered capsule.
 const [r]=profile(ax,[[.205,.112],[.30,.111],[.41,.107],[.47,.110],[.54,.102],[.61,.090],[.67,.082]]);
 const armY=1.455-.010*Math.sin((ax-.205)*8),armZ=-.065-.007*Math.sin(ax*9),armAngle=Math.atan2(z-armZ,y-armY);
 let sleeve=Math.hypot(ax-THREE.MathUtils.clamp(ax,.205,.665),y-armY,(z-armZ)*1.08)-r;
 sleeve-=.0016*band(ax-.465,.09)*Math.sin(ax*85+armAngle*2.2)+.0012*band(ax-.615,.045)*Math.sin(ax*116-armAngle*2.8);
 jacket=smoothMin(jacket,sleeve,.032);
 // Folded-down hood: low at the neck, draped over the upper back with an indented opening.
 const hoodOuter=ellipsoid(x,y-1.466,z+.135,.153,.085,.125),hoodInner=ellipsoid(x,y-1.523,z+.132,.108,.072,.091);
 jacket=smoothMin(jacket,Math.max(hoodOuter,-hoodInner),.025);
 const collar=Math.max((Math.hypot(x/.108,(z+.025)/.110)-1)*.108,1.46-y,y-1.565),collarHole=.078-Math.hypot(x,(z+.025)*.98);
 jacket=smoothMin(jacket,Math.max(collar,collarHole),.022);
 // A high crotch and two distinct leg volumes: never bridge the knees / thighs.
 let pants=ellipsoid(x,y-.912,z+.043,.225,.117,.150);
 for(const sign of [-1,1]){
  const yy=THREE.MathUtils.clamp(y,.205,.87),[w,d]=profile(yy,legSections),cx=sign*(.140-.006*band(yy-.28,.15)),cz=-.037-.035*(1-THREE.MathUtils.smoothstep(yy,.22,.46));
  const angle=Math.atan2(z-cz,x-cx),section=(Math.pow(Math.pow(Math.abs(x-cx)/w,2.25)+Math.pow(Math.abs(z-cz)/d,2.25),1/2.25)-1)*Math.min(w,d);
  let leg=Math.max(section,.176+.004*Math.sin(angle*3+sign)-y,y-.91);
  const fold=.0025*band(y-.49,.13)*Math.sin(y*82+angle*2.1+sign*.7)+.0017*band(y-.28,.07)*Math.sin(y*113-angle*3.4+sign);
  leg-=fold;pants=smoothMin(pants,leg,.012);
 }
 return smoothMin(jacket,pants,.020);
}
const resolution=npc?46:116,march=new MarchingCubes(resolution,new THREE.MeshStandardMaterial(),false,false,120000);march.isolation=0;
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
function nativeWeights(x,y,z){
 const cx=Math.floor(x/cell),cy=Math.floor(y/cell),cz=Math.floor(z/cell),nearest=[];
 for(let u=-3;u<=3;u++)for(let v=-3;v<=3;v++)for(let w=-3;w<=3;w++)for(const j of bins.get(key(cx+u,cy+v,cz+w))||[]){if(y<.84&&p.getX(j)*x<0)continue;const d=(p.getX(j)-x)**2+(p.getY(j)-y)**2+(p.getZ(j)-z)**2;nearest.push([d,j]);}
 nearest.sort((a,b)=>a[0]-b[0]);if(!nearest.length)throw Error('Unweighted outfit vertex');
 const influence=new Map();for(const [d,j] of nearest.slice(0,4))for(let c=0;c<4;c++){const bone=source.attributes.skinIndex.array[j*4+c],weight=source.attributes.skinWeight.array[j*4+c]/Math.max(d,.00001);influence.set(bone,(influence.get(bone)||0)+weight);}
 if(y<.80)for(const bone of influence.keys())if(body.skeleton.bones[bone].name.endsWith(x>0?'_r':'_l'))influence.delete(bone);
 // Torso panels should not follow the elbows or be pulled outward by arm weights.
 if(y>.90&&y<1.43&&Math.abs(x)<.22)for(const bone of influence.keys())if(/arm|hand|index|middle|ring|pinky|thumb/.test(body.skeleton.bones[bone].name))influence.delete(bone);
 // The lower trouser hem follows the boot so an edged ankle cannot open a gap.
 if(y<.34){
  const foot=body.skeleton.bones.findIndex(b=>b.name===`foot_${x>0?'l':'r'}`);
  const sum=[...influence.values()].reduce((a,b)=>a+b,0);
  const footWeight=1-THREE.MathUtils.smoothstep(y,.214,.34);
  for(const [bone,weight] of influence)influence.set(bone,weight*(1-footWeight));
  influence.set(foot,(influence.get(foot)||0)+sum*footWeight);
 }
 const top=[...influence].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((a,b)=>a+b[1],0);return{joints:Array.from({length:4},(_,c)=>top[c]?.[0]??0),weights:Array.from({length:4},(_,c)=>(top[c]?.[1]??0)/sum)};
}
const blue=new THREE.Color('#4088b4'),navy=new THREE.Color('#2a3945'),panel=new THREE.Color('#347698');
for(let i=0;i<q.count;i++){
 const x=q.getX(i),y=q.getY(i),z=q.getZ(i),skin=nativeWeights(x,y,z);joints.push(...skin.joints);weights.push(...skin.weights);
 let color=y<.900+.010*Math.sin(x*13+z*9)+.005*Math.sin(x*29-z*17)?navy:blue;if(y>.95&&y<1.36&&Math.abs(x)>.21&&Math.abs(x)<.30&&z<.035)color=panel;if(y>1.535&&Math.abs(x)<.12)color=navy;
 color.toArray(colors,i*3);uvs.push(x*3,y*3);
}
g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
const suit=new THREE.SkinnedMesh(g,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.88,sheen:.22,sheenRoughness:.85}));suit.name='Unified ski suit';suit.bind(body.skeleton,body.bindMatrix);body.parent.add(suit);
if(!npc){
// Clothing construction details follow the sculpted surface and the same native skin weights.
function onCloth(x,y,side=1){let lo=0,hi=.285;for(let i=0;i<20;i++){const z=(lo+hi)*.5;if(field(x,y,z*side)<0)lo=z;else hi=z;}return new THREE.Vector3(x,y,(hi+.0018)*side);}
const paths=[];
paths.push(Array.from({length:45},(_,i)=>{const y=.955+i/44*.55;return onCloth(.002+.002*Math.sin(y*10),y);}));
for(const sign of [-1,1])paths.push(Array.from({length:18},(_,i)=>{const t=i/17;return onCloth(sign*(.145+.032*t),1.145-.119*t);}));
paths.push(Array.from({length:35},(_,i)=>{const t=i/34;return onCloth(-.205+t*.41,1.39-.045*Math.sin(t*Math.PI),-1);}));
const seamGeometry=mergeGeometries(paths.map((points,i)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),points.length*2,i===0?.0021:.0015,5,false)));
const seamJoints=[],seamWeights=[],sp=seamGeometry.attributes.position;for(let i=0;i<sp.count;i++){const skin=nativeWeights(sp.getX(i),sp.getY(i),sp.getZ(i));seamJoints.push(...skin.joints);seamWeights.push(...skin.weights);}
seamGeometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(seamJoints,4));seamGeometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(seamWeights,4));
const seams=new THREE.SkinnedMesh(seamGeometry,new THREE.MeshStandardMaterial({color:'#29495d',roughness:.94}));seams.name='Jacket seams and pockets';seams.bind(body.skeleton,body.bindMatrix);body.parent.add(seams);
}
// Keep the native human head and fingers. The whole covered body is removed from the render mesh.
const exposed=[];for(let i=0;i<source.index.count;i+=3){const tri=[source.index.getX(i),source.index.getX(i+1),source.index.getX(i+2)];if(tri.every(j=>(p.getY(j)>1.55&&Math.abs(p.getX(j))<.15)||Math.abs(p.getX(j))>.685))exposed.push(...tri);}source.setIndex(exposed);
const bodyColors=[];for(let i=0;i<p.count;i++)(Math.abs(p.getX(i))>.67||p.getY(i)<1.64?navy:new THREE.Color('#c49376')).toArray(bodyColors,i*3);source.setAttribute('color',new THREE.Float32BufferAttribute(bodyColors,3));body.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83});
const rubber=new THREE.MeshStandardMaterial({color:'#202b34',roughness:.85}),buckle=new THREE.MeshStandardMaterial({color:'#9dabb4',roughness:.32,metalness:.65});
function attach(name,center){const bone=scene.getObjectByName(name),group=new THREE.Group();group.position.copy(center).sub(bone.getWorldPosition(new THREE.Vector3())).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());group.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion())).invert();bone.add(group);return group;}
function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
const head=attach('Head',new THREE.Vector3(0,1.725,0));head.name='Integrated beanie and goggles';
const knit=new THREE.MeshPhysicalMaterial({color:'#e5e8e9',roughness:1,metalness:0,sheen:.6,sheenRoughness:.95});
const capShape=[[.124,-.005],[.130,.016],[.128,.050],[.117,.095],[.093,.128],[.060,.148],[.025,.156],[0,.158]].map(([r,y])=>new THREE.Vector2(r,y));
const capGeometry=new THREE.LatheGeometry(capShape,npc?24:64),cp=capGeometry.attributes.position;
// Tiny longitudinal ribs suggest knit without hard-shell panels or straps.
for(let i=0;i<cp.count;i++){const x=cp.getX(i),z=cp.getZ(i),r=Math.hypot(x,z);if(r>.001){const rib=1+.006*Math.cos(Math.atan2(x,z)*36);cp.setXYZ(i,x*rib,cp.getY(i),z*rib);}}capGeometry.computeVertexNormals();
const crown=mesh(head,capGeometry,knit);crown.name='Beanie crown';crown.userData.headwear=true;
const cuff=mesh(head,new THREE.TorusGeometry(.123,.018,npc?6:12,npc?24:64),knit,0,.004,0);cuff.rotation.x=Math.PI/2;cuff.name='Folded knit cuff';cuff.userData.headwear=true;
mesh(head,new THREE.SphereGeometry(.136,npc?14:40,npc?10:24,Math.PI*.10,Math.PI*.80,Math.PI*.39,Math.PI*.22),rubber,0,-.015,.01).scale.x=.90;
mesh(head,new THREE.SphereGeometry(.139,npc?14:40,npc?10:24,Math.PI*.13,Math.PI*.74,Math.PI*.41,Math.PI*.17),new THREE.MeshPhysicalMaterial({color:'#77a9c9',metalness:.35,roughness:.16,clearcoat:.8}),0,-.015,.013).scale.x=.90;
function sculptBoot(){
 const n=npc?18:40,m=new MarchingCubes(n,rubber,false,false,10000);m.isolation=0;
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
 if(!npc)for(let j=0;j<3;j++)mesh(boot,new RoundedBoxGeometry(.13,.012,.021,2,.004),buckle,0,-.025+j*.047,.106-j*.019);

}
scene.getObjectByName('Eyes').material=new THREE.MeshStandardMaterial({color:'#deded8',roughness:.4});scene.getObjectByName('Eyebrows').material=rubber;
// Shorten the exposed neck chain; inherited skin bind matrices move the face and cap together.
scene.getObjectByName('neck_01').position.multiplyScalar(.96);scene.getObjectByName('Head').position.multiplyScalar(.55);scene.updateMatrixWorld(true);
scene.name='Complete winter skier';scene.userData={source:'CC0 Quaternius head, hands and 65-bone skeleton; authored continuous ski suit and equipment',generator:'scripts/build-skier.mjs'};
// Node's Blob is available; GLTFExporter only needs these two FileReader methods.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.();});}};
const output=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true});fs.writeFileSync(new URL(npc?'public/assets/skier-npc.glb':'public/assets/skier-complete.glb',root),Buffer.from(output));
console.log(JSON.stringify({vertices:q.count,triangles:g.index.count/3,bytes:output.byteLength}));
