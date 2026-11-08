// Bake named, editable ski key-pose clips on the existing native skeleton.
// The runtime plays full-body clips; it does not run this authoring sampler.
import fs from 'node:fs';import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {clone} from 'three/addons/utils/SkeletonUtils.js';import {createAthleteRig,updateAthletePose} from '../src/athlete.js';import {attachHumanoid} from '../src/humanoid.js';
const root=new URL('../',import.meta.url);async function read(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const source=await read(new URL('public/assets/skier-complete.glb',root)),names=['pelvis','spine_01','spine_02','spine_03','neck_01','Head',...['l','r'].flatMap(s=>[`clavicle_${s}`,`upperarm_${s}`,`lowerarm_${s}`,`hand_${s}`,`thigh_${s}`,`calf_${s}`,`foot_${s}`])];
const plant=t=>THREE.MathUtils.smoothstep(t,0,.2)*(1-THREE.MathUtils.smoothstep(t,.32,1));
// Each key is an anatomical pose, not a per-frame sine wave. Smooth key
// interpolation provides deliberate load / release and absorption timing.
const shapeKeys=(keys,t)=>{let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;const [a,p]=keys[i],[b,q]=keys[i+1],u=THREE.MathUtils.smoothstep(t,a,b);return Object.fromEntries([...new Set([...Object.keys(p),...Object.keys(q)])].map(k=>[k,THREE.MathUtils.lerp(p[k]||0,q[k]||0,u)]));};
const held=poseShape=>()=>({poseShape});
const definitions=[
 ['ski-plant-left',.5,t=>({plantPose:{side:1,amount:plant(t)}})],
 ['ski-plant-right',.5,t=>({plantPose:{side:-1,amount:plant(t)}})],
 ['ski-glide',2,held({})],['ski-tuck',2,()=>({tuck:1})],
 ['ski-carve-left',2,()=>({edgeRoll:-.9,edgeAngle:.9,poseShape:{hipForward:.02,knee:.06}})],
 ['ski-carve-right',2,()=>({edgeRoll:.9,edgeAngle:.9,poseShape:{hipForward:.02,knee:.06}})],
 ['ski-pole-push',1/1.35,t=>({poling:1,polePhase:t})],
 ['ski-release',2,held({flex:-.11,bend:-.025,hipForward:.015,knee:.02})],
 ['ski-absorb',2,held({flex:.30,bend:.045,knee:.16,hipForward:.04})],
 ['ski-preload',2,held({flex:.33,bend:.08,knee:.16,armLift:-.04})],
 ['ski-air-rise',2,held({flex:-.05,bend:-.06,fold:.06,armLift:.04,armSpread:.12})],
 ['ski-air-float',2,held({flex:.16,bend:.03,fold:.40,knee:.12,armLift:.12,armSpread:.18})],
 ['ski-air-prepare',2,held({flex:.04,bend:.025,fold:.04,stance:1.08,armLift:.04,armSpread:.10})],
 ['ski-landing-soft',.55,t=>({poseShape:shapeKeys([[0,{flex:.04}],[.27,{flex:.24,bend:.035,knee:.12}],[1,{}]],t)})],
 ['ski-landing-hard',.75,t=>({poseShape:shapeKeys([[0,{flex:.07}],[.22,{flex:.43,bend:.10,knee:.24,hipForward:.04}],[.6,{flex:.20,bend:.04,knee:.10}],[1,{}]],t)})],
 ['ski-fall-brace',2,held({flex:.18,bend:.05,brace:.8,knee:.08})],
 ['ski-fall-down',2,held({flex:.40,bend:.18,fold:.22,brace:1,knee:.16})],
 ['ski-fall-rise',2,held({flex:.56,bend:.28,brace:.9,knee:.28,hipForward:.07})],
];
const clips=[];for(const [name,duration,sample] of definitions){const a=createAthleteRig(new THREE.Scene()),r=attachHumanoid(a,clone(source.scene)),frames=Math.round(duration*30),times=Array.from({length:frames+1},(_,i)=>i/frames*duration),values=new Map(names.map(n=>[n,[]])),positions=[];
 for(let i=0;i<=frames;i++){const t=i/frames,s={poseAuthoring:true,speed:12,heading:0,downhillHeading:0,...sample(t)};a.userData.plant={};updateAthletePose(a,s,0,()=>0);if(duration===2)r.bones.pelvis.position.z+=.002*Math.sin(t*Math.PI*2);for(const n of names)values.get(n).push(...r.bones[n].quaternion.toArray());positions.push(...r.bones.pelvis.position.toArray());}
 const tracks=names.map(n=>new THREE.QuaternionKeyframeTrack(`${n}.quaternion`,times,values.get(n)));tracks.push(new THREE.VectorKeyframeTrack('pelvis.position',times,positions));const clip=new THREE.AnimationClip(name,duration,tracks);clips.push(duration===2?clip.optimize():clip);}
const vendorPath=process.argv[2];if(vendorPath){const vendor=await read(vendorPath),rest=new Map();vendor.scene.traverse(o=>{if(o.isBone)rest.set(o.name,{q:o.quaternion.clone(),p:o.position.clone()});});const targetRest=new Map();source.scene.traverse(o=>{if(o.isBone)targetRest.set(o.name,{q:o.quaternion.clone(),p:o.position.clone()});});
 for(const [original,name] of [['Walk_Loop','visitor-walk'],['Idle_Loop','visitor-idle']]){const clip=vendor.animations.find(c=>c.name===original);if(!clip)throw Error(`missing ${original}`);const tracks=[];for(const t of clip.tracks){const [n,property]=t.name.split('.');if(!names.includes(n)||!rest.has(n)||!targetRest.has(n))continue;const v=t.values.slice(),from=rest.get(n),to=targetRest.get(n);if(property==='quaternion'){for(let i=0;i<v.length;i+=4){const q=to.q.clone().multiply(from.q.clone().invert()).multiply(new THREE.Quaternion().fromArray(v,i)).normalize();q.toArray(v,i);}tracks.push(new THREE.QuaternionKeyframeTrack(t.name,t.times,v));}else if(n==='pelvis'&&property==='position'){const ratio=to.p.z/from.p.z;for(let i=0;i<v.length;i+=3){v[i]=to.p.x+(v[i]-from.p.x)*ratio;v[i+1]=to.p.y+(v[i+1]-from.p.y)*ratio;v[i+2]=to.p.z+(v[i+2]-from.p.z)*ratio;}tracks.push(new THREE.VectorKeyframeTrack(t.name,t.times,v));}}
 clips.push(new THREE.AnimationClip(name,clip.duration,tracks));}
}
const json={schema:1,source:'Eighteen authored ski clips on native skeleton; visitor walk/idle from Quaternius Universal Animation Library Standard, CC0',vendorSource:'https://quaternius.itch.io/universal-animation-library',clips:clips.map(THREE.AnimationClip.toJSON)};fs.writeFileSync(new URL('public/assets/skier-motion.json',root),JSON.stringify(json));console.log(clips.map(c=>`${c.name}: ${c.duration.toFixed(2)}s / ${c.tracks.length} tracks`).join('\n'));

const previewIndex=process.argv.indexOf('--preview');if(previewIndex>=0){const output=process.argv[previewIndex+1];if(!output)throw Error('Pass --preview output.glb');const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.();});}};const preview=clone(source.scene);preview.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();o.material.map=null;o.material.bumpMap=null;}});const bytes=await new GLTFExporter().parseAsync(preview,{binary:true,animations:clips});fs.writeFileSync(output,Buffer.from(bytes));console.log(`Editable preview GLB: ${bytes.byteLength} bytes`);}
