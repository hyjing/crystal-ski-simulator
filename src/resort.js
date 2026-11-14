import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {clusterForestSeeds} from './forest-distribution.js';
import {lonLatToUTM,pointAlongRoute} from './terrain.js';
import {isDetailedLodge,coveredLiftTerminal} from './stations.js';
import {installForestIndex} from './trees.js';
import {pisteHalfWidth} from './pistes.js';
import {stableTreeShadowGeometry,createStableShadowBatch} from './render-stability.js';
import {sampleCarrierPose,liftServiceStops} from './lift-geometry.js';
import {resortMaterials,detailedChair,detailedCabin,chairSafetyBar,cabinDoor,towerAccessories} from './resort-assets.js';

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
  for(const route of routes){
    let progress=0;
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      const width=route.halfWidth??Math.max(5,(route.pisteWidth?.(progress+length/2)??pisteHalfWidth(route.name,route.difficulty))-2),segment={a,b,width};
      progress+=length;
      for(let x=Math.floor((Math.min(a.x,b.x)-width)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+width)/cellSize);x++)
        for(let z=Math.floor((Math.min(a.z,b.z)-width)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+width)/cellSize);z++){
          const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
        }
    }
  }
  const ce=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,cn=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  const source=vegetation?vegetation.pixels.map(([u,v,size])=>{
    const {extent,imageSize:[w,h]}=vegetation;
    return {x:extent.xmin+(u+.5)/w*(extent.xmax-extent.xmin)-ce,z:cn-extent.ymax+(v+.5)/h*(extent.ymax-extent.ymin),size};
  }):Array.from({length:14000},()=>terrain.world(8+rng()*(terrain.width-16),8+rng()*(terrain.height-16)));
  const clustered=clusterForestSeeds(source,{spacing:vegetation?.minimumSpacing||8,support:landcover.values?(x,z)=>forestLikelihood(terrain,landcover,x,z):undefined});
  for(const p of clustered){
    if(!vegetation&&rng()>forestLikelihood(terrain,landcover,p.x,p.z)*.85)continue;
    if(terrain.sample(p.x,p.z)<(terrain.treeMinElevation??1180))continue;
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
  for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(10.5,21);g.translate(0,10.5,0);g.rotateY(i*Math.PI/3);cards.push(g);}
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:texture,alphaTest:.35,alphaToCoverage:true,side:THREE.DoubleSide,roughness:1});
  // Spatial batches let the frustum discard forest behind / beside the camera.
  const geometry=mergeGeometries(cards),tiles=new Map();
  candidates.forEach((p,index)=>{const key=`${Math.floor(p.x/384)},${Math.floor(p.z/384)}`;if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push({p,index});});
  const dummy=new THREE.Object3D(),trunkGeometry=new THREE.CylinderGeometry(.04,.20,18,6).translate(0,9,0),trunkMaterial=new THREE.MeshStandardMaterial({color:'#60564c',roughness:1}),shadowGeometry=stableTreeShadowGeometry(),shadowMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,fog:false});
  for(const members of tiles.values()){
    const tileGeometry=geometry;
    const mesh=new THREE.InstancedMesh(tileGeometry,material,members.length),trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,members.length),shadow=createStableShadowBatch(shadowGeometry,shadowMaterial,members.length);mesh.castShadow=false;mesh.receiveShadow=true;
    members.forEach(({p,index},slot)=>{p.y=terrain.surface(p.x,p.z)-1200-.2;p.scaleX=p.size*(.88+rng()*.24);dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.scaleX,p.size,p.size);dummy.rotation.y=p.rotation;dummy.updateMatrix();mesh.setMatrixAt(slot,dummy.matrix);shadow.setMatrixAt(slot,dummy.matrix);trunks.setMatrixAt(slot,dummy.matrix);});
    mesh.name='Fixed snowy fir canopy';trunks.name='Fixed fir trunks';trunks.receiveShadow=true;mesh.computeBoundingSphere();trunks.computeBoundingSphere();shadow.computeBoundingSphere();scene.add(mesh,trunks,shadow);
  }
  cards.forEach(g=>g.dispose());installForestIndex(candidates);return candidates;
}

export function addResort(scene,terrain,data,areas=[]){
  scene.userData.structureStatics??=[];scene.userData.structureDynamics??=[];
  const serviceStops=new Map(),modeledTerminals=new Map();
  const stationIds=new Set(areas.map(area=>String(area.liftId)));
  const towers=[],chairs=[],cables=[],walls=[],roofs=[],windows=[],facadeFrames=[],buildingMaterials=resortMaterials();
  const height=(x,z)=>terrain.surface(x,z)-1200;
  const inside=p=>Math.abs(p.x)<(terrain.width-2)*terrain.spacing/2&&Math.abs(p.z)<(terrain.height-2)*terrain.spacing/2;
  const lines=data.features.filter(feature=>feature.geometry.type==='LineString');
  const polygons=data.features.filter(feature=>feature.geometry.type==='Polygon');
  for(const feature of [...lines,...polygons]){
    if(feature.geometry.type==='LineString'){
      const points=feature.geometry.coordinates.map(p=>geographicPoint(terrain,p));if(points.some(p=>!inside(p)))continue;
      const path=points.map((p,i)=>new THREE.Vector3(p.x,height(p.x,p.z)+(i===0||i===points.length-1?4.8:16),p.z));
      path.forEach((p,i)=>{if(i===0||i===path.length-1)return;const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];towers.push({x:p.x,y:p.y-8,z:p.z,heading:Math.atan2(b.x-a.x,b.z-a.z)});});
      for(const side of [-1,1]){
        let total=0,segments=[];
        for(let i=0;i<path.length-1;i++){
          const a=path[i],b=path[i+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);
          if(l<.01)continue;
          const rx=dz/l*side*2.5,rz=-dx/l*side*2.5;
          segments.push({a,b,l,start:total,rx,rz});total+=l;
        }
        if(total<1)continue;
        const liftId=String(feature.id),cabin=feature.properties.aerialway==='gondola';
        const ascending=side===(path.at(-1).y>=path[0].y?1:-1);
        const carrier={liftId,segments,total,side,ascending,cabin,ground:height};
        if(ascending){
          const stops=liftServiceStops(carrier);
          serviceStops.set(liftId,stops);
          if(stationIds.has(liftId)||feature.properties.name==='Mt. Rainier Gondola')modeledTerminals.set(liftId,stops);
        }
        const distances=new Set([0,total]);
        for(const segment of segments)for(let j=0;j<=7;j++){
          const along=segment.start+segment.l*j/7;
          distances.add(side>0?along:total-along);
        }
        for(const d of [3.2,7,11,16,20,24,30])if(d<total){distances.add(d);distances.add(total-d);}
        const cable=[...distances].sort((a,b)=>a-b).map(d=>{
          const p=sampleCarrierPose(carrier,d);
          return new THREE.Vector3(p.x,p.y+2.8,p.z);
        });
        cables.push(new THREE.BufferGeometry().setFromPoints(cable));
        const count=Math.max(1,Math.floor(total/38));
        for(let i=0;i<count;i++)chairs.push({...carrier,seatIndex:i,offset:i/count*total});
      }
    }else if(feature.geometry.type==='Polygon'){
      if(isDetailedLodge(feature))continue;
      const points=feature.geometry.coordinates[0].map(p=>geographicPoint(terrain,p));if(points.length<4||points.some(p=>!inside(p))||coveredLiftTerminal(feature,points,modeledTerminals))continue;
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,-p.z)));
      const y=Math.min(...points.map(p=>height(p.x,p.z)))-.5;
      const h=Number(feature.properties.height)||Number(feature.properties['building:levels']||2)*3;scene.userData.structureStatics.push({kind:'polygon',polygon:points.map(p=>({x:p.x,z:p.z})),minY:y,maxY:y+h,label:feature.properties.name||'房屋'});
      walls.push(new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1}).rotateX(-Math.PI/2).translate(0,y,0));
      roofs.push(new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,y+h+.25,0));
      for(let j=0;j<points.length-1;j++){
        const a=points[j],b=points[j+1],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<4)continue;
        const g=new THREE.PlaneGeometry(l*.72,Math.min(1.4,h*.3));g.rotateY(-Math.atan2(dz,dx));g.translate((a.x+b.x)/2+dz/l*.06,y+h*.56,(a.z+b.z)/2-dx/l*.06);windows.push(g);
        const heading=-Math.atan2(dz,dx),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
        const beam=(w,h,d,along,yy)=>{const frame=new THREE.BoxGeometry(w,h,d);frame.rotateY(heading);frame.translate(mx+dx/l*along+dz/l*.1,yy,mz+dz/l*along-dx/l*.1);facadeFrames.push(frame);};
        beam(l,.12,.14,0,y+h+.12);beam(l*.74,.09,.11,0,y+h*.56-.73);beam(l*.74,.09,.11,0,y+h*.56+.73);
        for(let u=-l*.34;u<l*.36;u+=2.2)beam(.075,1.5,.12,u,y+h*.56);

      }
    }
  }
  const addMerged=(geometries,material)=>{if(!geometries.length)return;const g=mergeGeometries(geometries);const m=new THREE.Mesh(g,material);m.castShadow=m.receiveShadow=true;scene.add(m);geometries.forEach(g=>g.dispose());};
  addMerged(walls,buildingMaterials.wood);
  addMerged(roofs,buildingMaterials.snow);
  addMerged(windows,buildingMaterials.glass);addMerged(facadeFrames,buildingMaterials.metal);
  for(const geometry of cables)scene.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#36434b'})));
  const dummy=new THREE.Object3D();
  const pylons=new THREE.InstancedMesh(new THREE.CylinderGeometry(.38,.55,16,8),new THREE.MeshStandardMaterial({color:'#68787d',metalness:.6,roughness:.5}),towers.length);
  const crossbars=new THREE.InstancedMesh(new THREE.BoxGeometry(6,.45,.6),new THREE.MeshStandardMaterial({color:'#3b5058',metalness:.4,roughness:.5}),towers.length);
  towers.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.heading;dummy.updateMatrix();pylons.setMatrixAt(i,dummy.matrix);dummy.position.y+=7.6;dummy.updateMatrix();crossbars.setMatrixAt(i,dummy.matrix);});
  for(const p of towers)scene.userData.structureStatics.push({kind:'cylinder',x:p.x,z:p.z,radius:.66,minY:p.y-8,maxY:p.y+8,label:'缆车塔柱'});
  const pads=new THREE.InstancedMesh(new THREE.CylinderGeometry(.62,.68,1.5,12),new THREE.MeshStandardMaterial({color:'#b56a45',roughness:.9}),towers.length);towers.forEach((p,i)=>{dummy.position.set(p.x,p.y-7.25,p.z);dummy.rotation.set(0,p.heading,0);dummy.updateMatrix();pads.setMatrixAt(i,dummy.matrix);});pads.castShadow=pads.receiveShadow=true;scene.add(pads);
  pylons.castShadow=crossbars.castShadow=true;scene.add(pylons,crossbars);
  const detail=new THREE.InstancedMesh(towerAccessories(),new THREE.MeshStandardMaterial({color:'#394851',metalness:.6,roughness:.42}),towers.length);detail.castShadow=detail.receiveShadow=true;
  towers.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.heading,0);dummy.updateMatrix();detail.setMatrixAt(i,dummy.matrix);});scene.add(detail);
  const materials=buildingMaterials,openChairs=chairs.filter(c=>!c.cabin),closedCabins=chairs.filter(c=>c.cabin);
  const instances=(geometries,mats,count)=>geometries.map((geometry,i)=>{const mesh=new THREE.InstancedMesh(geometry,mats[i],count);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;});
  const glass=materials.glass.clone();glass.transparent=true;glass.opacity=.54;glass.depthWrite=false;
  const seats=instances(detailedChair(),[materials.metal,materials.seat,materials.paint],openChairs.length),cabins=instances(detailedCabin(),[materials.paint,glass,materials.dark],closedCabins.length);

  const [bars]=instances([chairSafetyBar()],[materials.metal],openChairs.length);
  const doors=instances([cabinDoor(),cabinDoor()],[materials.paint,materials.paint],closedCabins.length);
  const attachment=new THREE.Object3D(),matrix=new THREE.Matrix4();
  for(const c of chairs){c.collider={kind:'box',position:new THREE.Vector3(),half:new THREE.Vector3(c.cabin?1.3:1.3,c.cabin?1.6:.7,c.cabin?1:.7),quaternion:new THREE.Quaternion(),label:c.cabin?'吊厢':'吊椅'};scene.userData.structureDynamics.push(c.collider);}
  const animate=time=>{animate.time=time;
    const update=(vehicles,meshes)=>vehicles.forEach((chair,i)=>{
      const distance=((chair.offset+time*2.5*chair.side)%chair.total+chair.total)%chair.total;
      chair.travelProgress=chair.side>0?distance:chair.total-distance;
      const pose=sampleCarrierPose(chair,chair.travelProgress);
      dummy.position.set(pose.x,pose.y,pose.z);
      dummy.rotation.set(0,pose.heading,0);
      dummy.updateMatrix();
      chair.collider.position.copy(dummy.position);chair.collider.quaternion.copy(dummy.quaternion);
      if(chair.riderMatrix)chair.riderMatrix.copy(dummy.matrix);
      meshes.forEach(mesh=>mesh.setMatrixAt(i,dummy.matrix));
      if(chair.cabin){
        doors.forEach((door,j)=>{
          attachment.position.set(1.18,.50,(j?1:-1)*(.29+pose.open*.57));
          attachment.rotation.set(0,0,0);attachment.updateMatrix();
          door.setMatrixAt(i,matrix.multiplyMatrices(dummy.matrix,attachment.matrix));
        });
      }else{
        attachment.position.set(0,.55,-.27);attachment.rotation.set(-pose.open*1.42,0,0);attachment.updateMatrix();
        bars.setMatrixAt(i,matrix.multiplyMatrices(dummy.matrix,attachment.matrix));
      }
    });
    update(openChairs,seats);update(closedCabins,cabins);
    for(const mesh of [...seats,...cabins,bars,...doors])mesh.instanceMatrix.needsUpdate=true;
  };animate.serviceStops=serviceStops;animate.allCarriers=chairs;animate.carriers=openChairs;animate.time=0;animate(0);return animate;
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
