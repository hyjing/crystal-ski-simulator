import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function hitsTreeTrunk(a,b,tree,riderRadius=.36){
  const radius=(tree.trunkRadius||.22*(tree.size||1))+riderRadius,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  const t=l2?THREE.MathUtils.clamp(((tree.x-a.x)*dx+(tree.z-a.z)*dz)/l2,0,1):0;
  return (a.x+t*dx-tree.x)**2+(a.z+t*dz-tree.z)**2<radius*radius;
}

function treePrototype(seed){
  const wood=[],snow=[],needles=[],needleColors=[],normalOverrides=[];let state=seed;
  const rng=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
  const cylinder=(a,b,r1,r2)=>{const direction=new THREE.Vector3().subVectors(b,a),g=new THREE.CylinderGeometry(r2,r1,direction.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);wood.push(g);};
  cylinder(new THREE.Vector3(),new THREE.Vector3(.08,20,0),.22,.025);
  function needle(a,d){const side=new THREE.Vector3(d.z,.2,-d.x).normalize().multiplyScalar(.009),tip=a.clone().addScaledVector(d,.10);for(const p of [a.clone().add(side),a.clone().sub(side),tip]){needles.push(p.x,p.y,p.z);const c=.72+rng()*.28;needleColors.push(.045*c,.115*c,.085*c);}}
  for(let ring=0;ring<10;ring++){
    const y=2+ring*1.75,radius=3.6*(1-ring/11),count=ring>7?3:5;
    for(let branch=0;branch<count;branch++){
      const angle=branch/count*Math.PI*2+ring*1.73+rng()*.3,length=radius*(.8+rng()*.3),dir=new THREE.Vector3(Math.cos(angle),-.12,Math.sin(angle)).normalize(),a=new THREE.Vector3(0,y,0),b=a.clone().addScaledVector(dir,length);
      cylinder(a,b,.065*(1-ring/12),.012);
      for(let twig=1;twig<=5;twig++)for(const sign of [-1,1]){
        const center=a.clone().lerp(b,twig/6),tDir=new THREE.Vector3(Math.cos(angle+sign*.9),.08,Math.sin(angle+sign*.9)).normalize(),tLength=.4+length*.12;
        for(let k=0;k<5;k++){const base=center.clone().addScaledVector(tDir,k/5*tLength);for(const side of [-1,1]){const nDir=new THREE.Vector3(tDir.x+Math.sin(angle)*side*.8,.25+rng()*.4,tDir.z-Math.cos(angle)*side*.8).normalize();needle(base,nDir);}}
      }
      for(const fraction of [.40,.76]){
        const p=a.clone().lerp(b,fraction),g=new THREE.SphereGeometry(1,8,5);g.scale(length*.35,.19+length*.07,.24+length*.10);g.rotateY(-angle);g.translate(p.x,p.y,p.z);
        const flat=g.toNonIndexed(),pos=flat.attributes.position,norm=flat.attributes.normal,start=needles.length/3;
        for(let k=0;k<pos.count;k++){needles.push(pos.getX(k),pos.getY(k),pos.getZ(k));const shade=.7+rng()*.3;needleColors.push(.035*shade,.105*shade,.070*shade);}
        normalOverrides.push({start,norm:Float32Array.from(norm.array)});g.dispose();flat.dispose();
      }
      for(const fraction of [.42,.78]){const p=a.clone().lerp(b,fraction),g=new THREE.SphereGeometry(1,7,4,0,Math.PI*2,0,Math.PI/2);g.scale(length*.30,.17+length*.055,.34+length*.10);g.rotateY(-angle);g.translate(p.x,p.y+.12,p.z);snow.push(g);}
    }
  }
  const needleGeometry=new THREE.BufferGeometry();needleGeometry.setAttribute('position',new THREE.Float32BufferAttribute(needles,3));needleGeometry.setAttribute('color',new THREE.Float32BufferAttribute(needleColors,3));needleGeometry.computeVertexNormals();for(const {start,norm} of normalOverrides)for(let i=0;i<norm.length/3;i++)needleGeometry.attributes.normal.setXYZ(start+i,norm[i*3],norm[i*3+1],norm[i*3+2]);
  const merge=list=>{const g=mergeGeometries(list);list.forEach(x=>x.dispose());return g;};
  return [merge(wood),needleGeometry,merge(snow)];
}

// Three shared branch/needle/snow prototypes, with a bounded nearby instance pool.
export function installDetailedTrees(scene,farForest,trees){
  const materials=[new THREE.MeshStandardMaterial({color:'#64584a',roughness:1}),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({color:'#e6edf1',roughness:.96})];
  const pools=Array.from({length:3},(_,variant)=>treePrototype(71+variant*29).map((g,i)=>{const m=new THREE.InstancedMesh(g,materials[i],8);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.castShadow=m.receiveShadow=true;m.frustumCulled=false;scene.add(m);return m;}));
  const dummy=new THREE.Object3D(),hidden=new Set();let last=-Infinity;
  const collisionCells=new Map();for(const tree of trees){tree.trunkRadius=.22*tree.size;const key=`${Math.floor(tree.x/16)},${Math.floor(tree.z/16)}`;if(!collisionCells.has(key))collisionCells.set(key,[]);collisionCells.get(key).push(tree);}
  trees.nearby=(x,z)=>{const out=[],u=Math.floor(x/16),v=Math.floor(z/16);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)out.push(...collisionCells.get(`${u+a},${v+b}`)||[]);return out;};
  trees.updateLOD=(point,time)=>{
    if(time-last<650)return;last=time;
    const quotas=[0,0,0];const close=trees.map((tree,index)=>({tree,index,d:(tree.x-point.x)**2+(tree.z-point.z)**2})).filter(p=>p.d<110**2).sort((a,b)=>a.d-b.d).filter(p=>{const v=p.index%3;if(quotas[v]>=8)return false;quotas[v]++;return true;}).slice(0,24),active=new Set(close.map(p=>p.index));
    for(const index of new Set([...hidden,...active])){
      if(hidden.has(index)===active.has(index))continue;const p=trees[index];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(active.has(index)?0:p.scaleX,active.has(index)?0:p.size,active.has(index)?0:p.size);dummy.updateMatrix();farForest.setMatrixAt(index,dummy.matrix);farForest.instanceMatrix.addUpdateRange(index*16,16);
    }
    farForest.instanceMatrix.needsUpdate=true;hidden.clear();active.forEach(i=>hidden.add(i));
    const counts=[0,0,0];close.forEach(({tree,index})=>{const variant=index%3,slot=counts[variant]++;if(slot>=8)return;dummy.position.set(tree.x,tree.y,tree.z);dummy.rotation.set(0,tree.rotation,0);dummy.scale.setScalar(tree.size);dummy.updateMatrix();pools[variant].forEach(m=>m.setMatrixAt(slot,dummy.matrix));});
    pools.forEach((parts,variant)=>parts.forEach(m=>{m.count=Math.min(8,counts[variant]);m.instanceMatrix.needsUpdate=true;}));
  };
}
