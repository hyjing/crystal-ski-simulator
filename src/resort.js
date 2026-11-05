import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {lonLatToUTM,pointAlongRoute} from './terrain.js';
import {isDetailedLodge} from './stations.js';
import {installDetailedTrees} from './trees.js';
import {pisteHalfWidth} from './pistes.js';

export function geographicPoint(terrain,[lon,lat]){
  const p=lonLatToUTM(lon,lat);
  return {x:p.e-terrain.originUTM[0]-(terrain.width-1)*terrain.spacing/2,z:terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2-p.n};
}
export function forestLikelihood(terrain,landcover,x,z){
  const ce=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,cn=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  const extent=landcover.extent;
  const u=extent?Math.floor((ce+x-extent.xmin)/(extent.xmax-extent.xmin)*landcover.width):Math.round(x/terrain.spacing+(terrain.width-1)/2);
  const v=extent?Math.floor((extent.ymax-cn+z)/(extent.ymax-extent.ymin)*landcover.height):Math.round(z/terrain.spacing+(terrain.height-1)/2);
  if(u<0||v<0||u>=landcover.width||v>=landcover.height)return 0;
  return landcover.values[v*landcover.width+u];
}

export function addForest(scene,terrain,routes,landcover,texture,vegetation,stationAreas=[]){
  let seed=84;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const candidates=[];
  // Index all route segments once; hundreds of ways should not multiply forest startup work.
  const cells=new Map(),cellSize=100;
  for(const route of routes)for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],width=Math.max(5,pisteHalfWidth(route.name,route.difficulty)-2),segment={a,b,width};
    for(let x=Math.floor((Math.min(a.x,b.x)-width)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+width)/cellSize);x++)
      for(let z=Math.floor((Math.min(a.z,b.z)-width)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+width)/cellSize);z++){
        const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
      }
  }
  const ce=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,cn=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  const source=vegetation?vegetation.pixels.map(([u,v,size])=>{
    const {extent,imageSize:[w,h]}=vegetation;
    return {x:extent.xmin+(u+.5)/w*(extent.xmax-extent.xmin)-ce,z:cn-extent.ymax+(v+.5)/h*(extent.ymax-extent.ymin),size};
  }):Array.from({length:14000},()=>terrain.world(8+rng()*(terrain.width-16),8+rng()*(terrain.height-16)));
  for(const p of source){
    if(!vegetation&&rng()>forestLikelihood(terrain,landcover,p.x,p.z)*.85)continue;
    if(terrain.sample(p.x,p.z)<1180)continue;
    if(stationAreas.some(a=>Math.hypot(((p.x-a.x)*a.fx+(p.z-a.z)*a.fz)/a.coreLength,((p.x-a.x)*a.fz-(p.z-a.z)*a.fx)/a.coreWidth)<1.04))continue;
    // Keep inferred tree trunks outside the authored piste corridor.
    let clear=false;
    for(const {a,b,width} of cells.get(`${Math.floor(p.x/cellSize)},${Math.floor(p.z/cellSize)}`)||[]){
      const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
      const t=l2?THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,0,1):0;
      if(Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<width){clear=true;break;}
    }
    if(clear)continue;
    candidates.push({...p,size:p.size||.65+rng()*.8,rotation:rng()*Math.PI});
  }
  const cards=[];
  for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(8,21);g.translate(0,10.5,0);g.rotateY(i*Math.PI/3);cards.push(g);}
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:texture,alphaTest:.35,side:THREE.DoubleSide,roughness:1});
  // Spatial batches let the frustum discard forest behind / beside the camera.
  const geometry=mergeGeometries(cards),tiles=new Map(),slots=[],dirty=new Set();
  candidates.forEach((p,index)=>{const key=`${Math.floor(p.x/384)},${Math.floor(p.z/384)}`;if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push({p,index});});
  const dummy=new THREE.Object3D();
  for(const members of tiles.values()){
    const mesh=new THREE.InstancedMesh(geometry,material,members.length);mesh.castShadow=false;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    members.forEach(({p,index},slot)=>{p.y=terrain.surface(p.x,p.z)-1200-.2;p.scaleX=p.size*(.88+rng()*.24);dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.scaleX,p.size,p.size);dummy.rotation.y=p.rotation;dummy.updateMatrix();mesh.setMatrixAt(slot,dummy.matrix);slots[index]={mesh,slot};});
    mesh.computeBoundingSphere();scene.add(mesh);
  }
  const forest={setMatrixAt(index,matrix){const {mesh,slot}=slots[index];mesh.setMatrixAt(slot,matrix);dirty.add(mesh);},instanceMatrix:{addUpdateRange(start,count){const {mesh,slot}=slots[start/16];mesh.instanceMatrix.addUpdateRange(slot*16,count);},set needsUpdate(value){if(value){for(const mesh of dirty)mesh.instanceMatrix.needsUpdate=true;dirty.clear();}}}};
  cards.forEach(g=>g.dispose());installDetailedTrees(scene,forest,candidates);return candidates;
}

export function addResort(scene,terrain,data){
  const towers=[],chairs=[],cables=[],walls=[],roofs=[],windows=[];
  const height=(x,z)=>terrain.surface(x,z)-1200;
  const inside=p=>Math.abs(p.x)<(terrain.width-2)*terrain.spacing/2&&Math.abs(p.z)<(terrain.height-2)*terrain.spacing/2;
  for(const feature of data.features){
    if(feature.geometry.type==='LineString'){
      const points=feature.geometry.coordinates.map(p=>geographicPoint(terrain,p));if(points.some(p=>!inside(p)))continue;
      const path=points.map((p,i)=>new THREE.Vector3(p.x,height(p.x,p.z)+(i===0||i===points.length-1?4.8:16),p.z));
      path.forEach((p,i)=>{if(i===0||i===path.length-1)return;const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];towers.push({x:p.x,y:p.y-8,z:p.z,heading:Math.atan2(b.x-a.x,b.z-a.z)});});
      for(const side of [-1,1]){
        const cable=[];let total=0,segments=[];
        for(let i=0;i<path.length-1;i++){
          const a=path[i],b=path[i+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),rx=dz/l*side*2.5,rz=-dx/l*side*2.5;
          segments.push({a,b,l,start:total,rx,rz});total+=l;
          for(let j=0;j<8;j++){const t=j/7;cable.push(new THREE.Vector3(a.x+dx*t+rx,a.y+(b.y-a.y)*t-Math.sin(Math.PI*t)*1.1,a.z+dz*t+rz));}
        }
        cables.push(new THREE.BufferGeometry().setFromPoints(cable));
        const count=Math.floor(total/38);
        for(let i=0;i<count;i++)chairs.push({segments,total,offset:i/count*total,side,cabin:feature.properties.aerialway==='gondola'});
      }
    }else if(feature.geometry.type==='Polygon'){
      if(isDetailedLodge(feature))continue;
      const points=feature.geometry.coordinates[0].map(p=>geographicPoint(terrain,p));if(points.length<4||points.some(p=>!inside(p)))continue;
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,-p.z)));
      const y=Math.min(...points.map(p=>height(p.x,p.z)))-.5;
      const h=Number(feature.properties.height)||Number(feature.properties['building:levels']||2)*3;
      walls.push(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1}).rotateX(-Math.PI/2).translate(0,y,0));
      roofs.push(new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,y+h+.25,0));
      for(let j=0;j<points.length-1;j++){
        const a=points[j],b=points[j+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<4)continue;
        const g=new THREE.PlaneGeometry(l*.72,Math.min(1.4,h*.3));g.rotateY(-Math.atan2(dz,dx));g.translate((a.x+b.x)/2+dz/l*.06,y+h*.56,(a.z+b.z)/2-dx/l*.06);windows.push(g);
      }
    }
  }
  const addMerged=(geometries,material)=>{if(!geometries.length)return;const g=mergeGeometries(geometries);const m=new THREE.Mesh(g,material);m.castShadow=m.receiveShadow=true;scene.add(m);geometries.forEach(g=>g.dispose());};
  addMerged(walls,new THREE.MeshStandardMaterial({color:'#776c5b',roughness:.9}));
  addMerged(roofs,new THREE.MeshStandardMaterial({color:'#edf0f2',roughness:1,side:THREE.DoubleSide}));
  addMerged(windows,new THREE.MeshStandardMaterial({color:'#314d61',roughness:.3,metalness:.2,side:THREE.DoubleSide}));
  for(const geometry of cables)scene.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#36434b'})));
  const dummy=new THREE.Object3D();
  const pylons=new THREE.InstancedMesh(new THREE.CylinderGeometry(.38,.55,16,8),new THREE.MeshStandardMaterial({color:'#68787d',metalness:.6,roughness:.5}),towers.length);
  const crossbars=new THREE.InstancedMesh(new THREE.BoxGeometry(6,.45,.6),new THREE.MeshStandardMaterial({color:'#3b5058',metalness:.4,roughness:.5}),towers.length);
  towers.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.heading;dummy.updateMatrix();pylons.setMatrixAt(i,dummy.matrix);dummy.position.y+=7.6;dummy.updateMatrix();crossbars.setMatrixAt(i,dummy.matrix);});
  pylons.castShadow=crossbars.castShadow=true;scene.add(pylons,crossbars);
  const frameParts=[new THREE.BoxGeometry(.12,2.8,.12).translate(0,1.4,0),new THREE.BoxGeometry(2.4,.10,.9),new THREE.BoxGeometry(2.4,.65,.10).translate(0,.4,-.4),new THREE.BoxGeometry(2.4,.07,.07).translate(0,-.65,.8)];
  const chairGeometry=mergeGeometries(frameParts);frameParts.forEach(g=>g.dispose());
  const openChairs=chairs.filter(c=>!c.cabin),closedCabins=chairs.filter(c=>c.cabin);
  const seats=new THREE.InstancedMesh(chairGeometry,new THREE.MeshStandardMaterial({color:'#35444c',metalness:.3,roughness:.6}),openChairs.length);seats.castShadow=true;scene.add(seats);
  const cabinParts=[new THREE.BoxGeometry(2.4,1.8,2).translate(0,.6,0),new THREE.BoxGeometry(2.7,.18,2.2).translate(0,1.6,0),new THREE.BoxGeometry(.16,1.2,.16).translate(0,2.2,0)];
  const cabins=new THREE.InstancedMesh(mergeGeometries(cabinParts),new THREE.MeshStandardMaterial({color:'#3a5965',metalness:.35,roughness:.32}),closedCabins.length);cabins.castShadow=true;scene.add(cabins);cabinParts.forEach(g=>g.dispose());
  return time=>{
    const update=(vehicles,mesh)=>vehicles.forEach((chair,i)=>{
      const distance=((chair.offset+time*2.5*chair.side)%chair.total+chair.total)%chair.total;
      const seg=chair.segments.find(s=>distance<=s.start+s.l)||chair.segments.at(-1),t=(distance-seg.start)/seg.l;
      dummy.position.set(THREE.MathUtils.lerp(seg.a.x,seg.b.x,t)+seg.rx,THREE.MathUtils.lerp(seg.a.y,seg.b.y,t)-Math.sin(Math.PI*t)*1.1-2.8,THREE.MathUtils.lerp(seg.a.z,seg.b.z,t)+seg.rz);
      dummy.rotation.set(0,Math.atan2(seg.b.x-seg.a.x,seg.b.z-seg.a.z)+(chair.side<0?Math.PI:0),0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });update(openChairs,seats);update(closedCabins,cabins);seats.instanceMatrix.needsUpdate=cabins.instanceMatrix.needsUpdate=true;
  };
}


export function liftExitSpawn(terrain,route,infrastructure){
  const rings=infrastructure.features.filter(f=>f.geometry.type==='Polygon').map(f=>f.geometry.coordinates[0].map(p=>geographicPoint(terrain,p)));
  const blocked=p=>rings.some(ring=>{
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
      const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l,0,1):0;
      if(Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<4)return true;
    }
    return inside;
  });
  for(let distance=35;distance<=150;distance+=5){const point=pointAlongRoute(route,distance);if(!blocked(point)&&!blocked(pointAlongRoute(route,distance-15))&&Math.hypot(...Object.values(terrain.gradient(point.x,point.z)))<Math.tan(5*Math.PI/180))return point;}
  throw new Error(`No clear snow exit near ${route.lift}`);
}
