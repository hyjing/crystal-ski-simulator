import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {resortMaterials,mergeAssetGeometry} from './resort-assets.js';
import {createTerrain,lonLatToUTM,pointAlongRoute} from './terrain.js';
const specialNames=new Set(['Summit House','Campbell Basin Lodge','Green Valley Wheelhouse']);
export const isDetailedLodge=f=>specialNames.has(f.properties.name);
function project(terrain,ll){const p=lonLatToUTM(...ll);return{x:p.e-terrain.originUTM[0]-(terrain.width-1)*terrain.spacing/2,z:terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2-p.n};}

// Constructed station snow aprons are authored overlays on the measured bare-earth DEM.
// The same modified heights feed rendering, powder, collision and ski physics.
export function prepareStationTerrain(raw,routes,infrastructure){
  const heights=Float32Array.from(raw.heights),areas=[],seen=new Set();
  for(const route of routes){
    if(seen.has(route.liftId))continue;seen.add(route.liftId);
    const c=route.points[0],exit=pointAlongRoute(route,55),length=Math.hypot(exit.x-c.x,exit.z-c.z)||1;
    areas.push({role:'upper',name:route.lift,liftId:route.liftId,x:c.x,z:c.z,y:raw.sample(c.x,c.z),fx:(exit.x-c.x)/length,fz:(exit.z-c.z)/length,coreLength:58,coreWidth:38,outerLength:112,outerWidth:82,pitch:Math.tan(1.5*Math.PI/180)});
  }
  for(const route of routes){
    if(areas.some(a=>a.role==='lower'&&a.liftId===route.liftId))continue;
    const c=route.points.at(-1),prev=pointAlongRoute(route,route.length-40),length=Math.hypot(c.x-prev.x,c.z-prev.z)||1;
    areas.push({role:'lower',name:route.lift,liftId:route.liftId,x:c.x,z:c.z,y:raw.sample(c.x,c.z),fx:(c.x-prev.x)/length,fz:(c.z-prev.z)/length,coreLength:38,coreWidth:30,outerLength:80,outerWidth:65,pitch:Math.tan(1.0*Math.PI/180)});
  }
  function stamp(area){
    const radius=Math.max(area.outerLength,area.outerWidth),s=raw.spacing;
    const u0=Math.max(0,Math.floor((area.x-radius)/s+(raw.width-1)/2)),u1=Math.min(raw.width-1,Math.ceil((area.x+radius)/s+(raw.width-1)/2));
    const v0=Math.max(0,Math.floor((area.z-radius)/s+(raw.height-1)/2)),v1=Math.min(raw.height-1,Math.ceil((area.z+radius)/s+(raw.height-1)/2));
    for(let v=v0;v<=v1;v++)for(let u=u0;u<=u1;u++){
      const p=raw.world(u,v),dx=p.x-area.x,dz=p.z-area.z,along=dx*area.fx+dz*area.fz,across=dx*area.fz-dz*area.fx;
      const r=Math.hypot(along/area.coreLength,across/area.coreWidth);if(r>=2)continue;
      const outer=Math.hypot(along/area.outerLength,across/area.outerWidth);if(outer>=1)continue;
      const t=r<=1?1:1-THREE.MathUtils.smoothstep((r-1)/Math.max(.01,r-outer),0,1);
      const target=area.y-along*area.pitch,i=v*raw.width+u;heights[i]+= (target-heights[i])*t;
    }
  }
  areas.forEach(stamp);
  let terrain=createTerrain({...raw,heights});
  // Level named lodge foundations separately; these are not survey-accurate earthworks.
  for(const f of infrastructure.features.filter(isDetailedLodge)){
    const points=f.geometry.coordinates[0].map(ll=>project(raw,ll)),x=points.reduce((a,p)=>a+p.x,0)/points.length,z=points.reduce((a,p)=>a+p.z,0)/points.length;
    const radius=Math.max(...points.map(p=>Math.hypot(p.x-x,p.z-z)))+5;
    const area={x,z,y:terrain.sample(x,z),fx:1,fz:0,coreLength:radius,coreWidth:radius,outerLength:radius+18,outerWidth:radius+18,pitch:0};
    stamp(area);terrain=createTerrain({...raw,heights});
  }
  return{terrain,areas};
}

function label(text,width=512){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#193b3b';ctx.fillRect(0,0,width,128);ctx.strokeStyle='#dfe7cd';ctx.lineWidth=5;ctx.strokeRect(5,5,width-10,118);
  ctx.fillStyle='#eff5e7';ctx.font=`600 ${Math.min(40,720/text.length)}px system-ui`;ctx.textAlign='center';ctx.fillText(text,width/2,77);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map:texture,side:THREE.DoubleSide,roughness:.8});
}

export function addStationStructures(scene,terrain,infrastructure,areas){
  const groups=[];
  const {metal,wood,snow,glass,stone,dark,paint}=resortMaterials();
  const box=(group,w,h,d,x,y,z,mat)=>{const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;for(let f=0;f<6;f++){const [u,v]=f<2?[d,h]:f<4?[w,d]:[w,h];for(let k=0;k<4;k++){const i=f*4+k;uv.setXY(i,uv.getX(i)*u/2,uv.getY(i)*v/2);}}const mesh=new THREE.Mesh(g,mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const terminals=infrastructure.features.filter(f=>f.geometry.type==='LineString'&&(areas.some(a=>a.liftId===String(f.id))||f.properties.name==='Mt. Rainier Gondola'));
  for(const lift of terminals)for(const role of ['upper','lower']){
    let pts=lift.geometry.coordinates.map(ll=>project(terrain,ll));if(terrain.sample(pts[0].x,pts[0].z)>terrain.sample(pts.at(-1).x,pts.at(-1).z))pts.reverse();
    if(role==='lower')pts.reverse();
    const p=pts.at(-1),prev=pts.at(-2),heading=Math.atan2(p.x-prev.x,p.z-prev.z),group=new THREE.Group();
    group.position.set(p.x,terrain.surface(p.x,p.z)-1200,p.z);group.rotation.y=heading;scene.add(group);groups.push(group);
    group.name=`${lift.properties.name} ${role} terminal`;
    for(const side of [-1,1])for(const z of [-5,5])box(group,.42,5.2,.48,side*3,2.6,z,metal);
    const housing=new THREE.Mesh(new RoundedBoxGeometry(7.5,1.4,15,4,.45),paint);housing.position.set(0,5.6,0);group.add(housing);const cover=new THREE.Mesh(new RoundedBoxGeometry(8,.30,16,3,.14),snow);cover.position.set(0,6.46,0);group.add(cover);
    for(const side of [-1,1]){box(group,.05,.14,12,side*3.76,5.34,0,dark);for(let z=-5.8;z<5.9;z+=.55)box(group,.08,.43,.08,side*3.78,5.69,z,dark);}
    for(const z of [-6,6])for(const side of [-1,1])box(group,.08,.13,.12,side*2.9,5.1,z,metal);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(2.6,.2,8,32),metal);wheel.rotation.x=Math.PI/2;wheel.position.set(0,4.7,3.2);group.add(wheel);
    for(let i=0;i<8;i++){const spoke=box(group,5.1,.08,.10,0,4.7,3.2,metal);spoke.rotation.y=i*Math.PI/4;}
    for(const side of [-1,1])for(let z=-6;z<=5;z+=2){const roller=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.22,12),metal);roller.rotation.z=Math.PI/2;roller.position.set(side*2.6,4.8,z);group.add(roller);}
    // A shallow unloading ramp and guide rails, with open snow exit beyond the canopy.
    const ramp=box(group,5,.32,12,0,.10,8,snow);ramp.rotation.x=.025;
    for(const side of [-1,1]){box(group,.10,.10,16,side*3.4,.9,9,wood);for(let z=2;z<18;z+=4)box(group,.12,1.1,.12,side*3.4,.55,z,wood);}
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,.9),label(lift.properties.name.toUpperCase()));sign.position.set(0,5.3,7.58);group.add(sign);
    const exit=new THREE.Mesh(new THREE.PlaneGeometry(3,.65),label(role==='upper'?'UNLOAD / EXIT':'LOAD / ENTRANCE'));exit.position.set(5,1.9,11);exit.rotation.y=-Math.PI/5;group.add(exit);
    // A small operator hut beside the terminal.
    box(group,3.2,2.7,3.5,6.8,1.35,-2,wood);box(group,3.5,.3,3.8,6.8,2.85,-2,snow);box(group,2.3,1.2,.04,6.8,1.8,-.23,glass);box(group,.12,1.3,.06,6.8,1.8,-.19,metal);box(group,.9,2.05,.08,8.43,1.05,-2,glass);box(group,.045,.15,.06,8.49,1,-1.8,metal);box(group,1.1,.15,1.2,8.9,.07,-2,stone);
  }
  for(const f of infrastructure.features.filter(isDetailedLodge)){
    const points=f.geometry.coordinates[0].map(ll=>project(terrain,ll));let longest={length:0,angle:0};
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length>longest.length)longest={length,angle:Math.atan2(b.z-a.z,b.x-a.x)};}
    const angle=longest.angle,c=Math.cos(angle),s=Math.sin(angle),us=points.map(p=>p.x*c+p.z*s),vs=points.map(p=>-p.x*s+p.z*c),u=(Math.min(...us)+Math.max(...us))/2,v=(Math.min(...vs)+Math.max(...vs))/2;
    const width=Math.max(...us)-Math.min(...us),depth=Math.max(...vs)-Math.min(...vs),x=u*c-v*s,z=u*s+v*c;
    const group=new THREE.Group();group.position.set(x,terrain.surface(x,z)-1200,z);group.rotation.y=-angle;group.name=f.properties.name;scene.add(group);groups.push(group);
    const height=f.properties.name==='Summit House'?6:4.6;
    box(group,width,1.1,depth,0,.5,0,stone);box(group,width,height-1,depth,0,(height+1)/2,0,wood);
    for(const side of [-1,1]){
      box(group,width*.90,2,.08,0,height*.58,side*(depth/2+.06),glass);
      for(let u=-width*.44;u<width*.45;u+=2.5)box(group,.16,2.2,.14,u,height*.58,side*(depth/2+.13),wood);
      const pitch=Math.atan2(2.8,depth/2+1),roof=box(group,width+2,.30,Math.hypot(depth/2+1,2.8),0,height+1.4,side*(depth/4+.5),snow);roof.rotation.x=side*pitch;
      box(group,width+2,.22,.20,0,height,side*(depth/2+1),wood);box(group,width,.12,.09,0,height*.58-1.05,side*(depth/2+.14),metal);
    }
    for(const side of [-1,1]){
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*width/2,height,-depth/2,side*width/2,height,depth/2,side*width/2,height+2.8,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,depth/2,0,depth/4,1.4],2));g.setIndex(side>0?[0,2,1]:[0,1,2]);g.computeVertexNormals();group.add(new THREE.Mesh(g,wood));
      for(let z=-depth*.40;z<depth*.45;z+=2.7){box(group,.08,1.7,1.6,side*(width/2+.05),height*.58,z,glass);box(group,.12,1.8,.08,side*(width/2+.12),height*.58,z,wood);}
      box(group,.16,2.2,.16,side*(width/2+1),height-1.1,depth/2+.6,metal);
    }
    box(group,width+2,.20,.18,0,height+2.9,0,snow);box(group,.75,2.4,.7,width*.30,height+2,0,stone);box(group,1,.14,.9,width*.30,height+3.3,0,metal);
    box(group,1.4,2.5,.12,width*.25,1.3,depth/2+.16,glass);box(group,.08,2.6,.16,width*.25-.74,1.3,depth/2+.19,metal);box(group,.08,2.6,.16,width*.25+.74,1.3,depth/2+.19,metal);box(group,.08,.20,.08,width*.25+.5,1.3,depth/2+.27,metal);
    const front=depth/2+5;box(group,width+3,.5,9,0,.1,front,wood);
    for(let u=-width/2;u<=width/2;u+=3)box(group,.13,1.1,.13,u,.8,depth/2+9,wood);box(group,width,.12,.13,0,1.3,depth/2+9,wood);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width*.7,12),1.3),label(f.properties.name.toUpperCase()));sign.position.set(0,height-.8,depth/2+.15);group.add(sign);
    for(let u=-width*.3;u<width*.4;u+=6){box(group,2.2,.14,.9,u,.7,front,wood);for(const dx of [-.8,.8])box(group,.12,.7,.55,u+dx,.35,front,metal);}
  }
  // Static station buildings share a handful of draw calls rather than one per beam.
  scene.updateMatrixWorld(true);const batches=new Map();
  for(const group of groups){group.traverse(object=>{if(!object.isMesh)return;const key=object.material.uuid;if(!batches.has(key))batches.set(key,{material:object.material,geometries:[]});batches.get(key).geometries.push(object.geometry.clone().applyMatrix4(object.matrixWorld));});scene.remove(group);group.traverse(o=>o.geometry?.dispose());}
  for(const {material,geometries} of batches.values()){const geometry=mergeAssetGeometry(geometries),mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);geometries.forEach(g=>g.dispose());}

}
