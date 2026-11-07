import * as THREE from 'three';
// Cosmetic outcrops only on steep DEM ground, outside trails / station approaches.
// They are authored surface dressing, not surveyed rocks or collision obstacles.
export function addAlpineDetails(scene,terrain,routes,areas){
  const cells=new Set(),cell=32;
  for(const route of routes)for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let d=0;d<=length;d+=16){const t=d/Math.max(length,1),x=Math.floor((a.x+(b.x-a.x)*t)/cell),z=Math.floor((a.z+(b.z-a.z)*t)/cell);for(let u=-1;u<=1;u++)for(let v=-1;v<=1;v++)cells.add(`${x+u},${z+v}`);}
  }
  let seed=31;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;},candidates=[];let eligible=0;const stride=terrain.spacing>15?Math.max(1,Math.round(35/terrain.spacing)):5,limit=800;
  for(let z=8;z<terrain.height-8;z+=stride)for(let x=8;x<terrain.width-8;x+=stride){const p=terrain.world(x+rng()*2,z+rng()*2),g=terrain.gradient(p.x,p.z),slope=Math.hypot(g.x,g.z);
    if(slope<.82||terrain.sample(p.x,p.z)<(terrain.sceneryProfile?.rockMin??1450)||rng()>.09||cells.has(`${Math.floor(p.x/cell)},${Math.floor(p.z/cell)}`)||areas.some(a=>Math.hypot(p.x-a.x,p.z-a.z)<130))continue;
    const rock={...p,size:1.4+rng()*3,angle:rng()*Math.PI};eligible++;if(candidates.length<limit)candidates.push(rock);else{const slot=Math.floor(rng()*eligible);if(slot<limit)candidates[slot]=rock;}
  }
  const geometry=new THREE.IcosahedronGeometry(1,2),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),f=.9+.12*Math.sin(x*15+z*8+y*4);p.setXYZ(i,x*f,y*f,z*f);}geometry.computeVertexNormals();
  const rock=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#6c777c',roughness:.98,flatShading:true}),candidates.length),cap=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,4,0,Math.PI*2,0,Math.PI*.53),new THREE.MeshStandardMaterial({color:'#edf2f7',roughness:.95}),candidates.length),dummy=new THREE.Object3D();
  candidates.forEach((p,i)=>{dummy.position.set(p.x,terrain.surface(p.x,p.z)-1200+p.size*.2,p.z);dummy.rotation.set(.12,p.angle,.15);dummy.scale.set(p.size*1.7,p.size*.7,p.size);dummy.updateMatrix();rock.setMatrixAt(i,dummy.matrix);dummy.position.y+=p.size*.42;dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.size*1.55,p.size*.2,p.size*.92);dummy.updateMatrix();cap.setMatrixAt(i,dummy.matrix);});
  rock.receiveShadow=cap.receiveShadow=true;scene.add(rock,cap);return candidates.length;
}
