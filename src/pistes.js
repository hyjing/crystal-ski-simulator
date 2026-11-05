import * as THREE from 'three';
import {createTerrain,lonLatToUTM} from './terrain.js';

export const pisteHalfWidth=(name,difficulty)=>/road|traverse|otto|13-f|i-5/i.test(name)?6:name==='Green Valley'?22:difficulty==='easy'?12:13;

export function preparePisteTerrain(raw,network){
  const heights=Float32Array.from(raw.heights),best=new Float32Array(heights.length).fill(Infinity),footH=new Float32Array(heights.length),signed=new Float32Array(heights.length),widths=new Float32Array(heights.length),groomed=new Uint8Array(heights.length);
  const ce=raw.originUTM[0]+(raw.width-1)*raw.spacing/2,cn=raw.originUTM[1]-(raw.height-1)*raw.spacing/2;
  for(const feature of network.features){
    const name=feature.properties.name||'',road=/road|traverse|otto|13-f|i-5/i.test(name),halfWidth=pisteHalfWidth(name,feature.properties['piste:difficulty']);
    const points=feature.geometry.coordinates.map(ll=>{const p=lonLatToUTM(...ll);return{x:p.e-ce,z:cn-p.n};});
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(l2<.1)continue;
      const radius=halfWidth+7,s=raw.spacing,u0=Math.max(0,Math.floor((Math.min(a.x,b.x)-radius)/s+(raw.width-1)/2)),u1=Math.min(raw.width-1,Math.ceil((Math.max(a.x,b.x)+radius)/s+(raw.width-1)/2));
      const v0=Math.max(0,Math.floor((Math.min(a.z,b.z)-radius)/s+(raw.height-1)/2)),v1=Math.min(raw.height-1,Math.ceil((Math.max(a.z,b.z)+radius)/s+(raw.height-1)/2));
      for(let v=v0;v<=v1;v++)for(let u=u0;u<=u1;u++){
        const p=raw.world(u,v),t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,0,1),x=a.x+t*dx,z=a.z+t*dz,distance=Math.hypot(p.x-x,p.z-z),ratio=distance/halfWidth,index=v*raw.width+u;
        if(ratio>=best[index]||distance>radius)continue;best[index]=ratio;footH[index]=raw.sample(x,z);signed[index]=distance;widths[index]=halfWidth;groomed[index]=feature.properties['piste:difficulty']==='advanced'&&!road?0:1;
      }
    }
  }
  for(let i=0;i<heights.length;i++)if(Number.isFinite(best[i])){
    const interior=1-THREE.MathUtils.smoothstep(best[i],.55,1),bench=THREE.MathUtils.clamp(footH[i]-heights[i],-3,3)*interior*.8*groomed[i];
    const u=i%raw.width,v=Math.floor(i/raw.width),p=raw.world(u,v);
    const drift=.72+.22*Math.sin(p.x*.035+p.z*.017)+.10*Math.sin(p.z*.095);
    const d=(signed[i]-widths[i])/5.5,berm=Math.exp(-d*d*2)*1.15*drift;
    heights[i]+=bench+berm;
  }
  return createTerrain({...raw,heights});
}

export function addBoundaryPosts(scene,terrain,route){
  const points=route.points,markers=[];let carry=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.1)continue;
    for(let d=carry;d<length;d+=36){const t=d/length,x=a.x+dx*t,z=a.z+dz*t;if(Math.hypot(x-points[0].x,z-points[0].z)<80||Math.hypot(x-points.at(-1).x,z-points.at(-1).z)<55)continue;
      const halfWidth=route.id==='green-valley'?22:13;for(const sign of [-1,1])markers.push({x:x+dz/length*halfWidth*sign,z:z-dx/length*halfWidth*sign});}
    carry=(carry-length)%36;if(carry<0)carry+=36;
  }
  const group=new THREE.Group(),dummy=new THREE.Object3D(),poles=new THREE.InstancedMesh(new THREE.CylinderGeometry(.045,.055,1.7,6),new THREE.MeshStandardMaterial({color:'#d9e0dc',roughness:.8}),markers.length),tips=new THREE.InstancedMesh(new THREE.CylinderGeometry(.064,.064,.5,6),new THREE.MeshStandardMaterial({color:route.difficulty==='advanced'?'#283d4a':'#2d8ca8',roughness:.7}),markers.length);
  markers.forEach((p,i)=>{dummy.position.set(p.x,terrain.surface(p.x,p.z)-1200+.85,p.z);dummy.updateMatrix();poles.setMatrixAt(i,dummy.matrix);dummy.position.y+=.58;dummy.updateMatrix();tips.setMatrixAt(i,dummy.matrix);});group.add(poles,tips);scene.add(group);return group;
}

export function createArrivalZone(scene,terrain,route){
  const goal=route.points.at(-1),group=new THREE.Group();
  for(const [inner,outer,opacity] of [[16,18,.65],[18,22,.12],[0,16,.07]]){
    const geometry=new THREE.RingGeometry(inner,outer,72,2);geometry.rotateX(-Math.PI/2);const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i)+goal.x,z=p.getZ(i)+goal.z;p.setXYZ(i,x,terrain.surface(x,z)-1200+.10,z);}geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#b9ef79',transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide})));
  }
  group.name=`Arrival / ${route.lift}`;scene.add(group);return group;
}
