import * as THREE from 'three';
import {groveDensity} from './forest-distribution.js';

const tileSize=2304;

// Two irregular conifer tiers. The lower branches are darker even in overcast light.
function crownGeometry(near){
  const position=[],colors=[],indices=[];
  const sides=near?6:5;
  const tiers=near?[[.12,.29,.82,1],[.41,.57,1,.70]]:[[.12,.34,1,1]];
  for(const [base,shoulder,tip,radius] of tiers){
    const start=position.length/3;
    for(const [height,r,shade] of [[base,.80,.43],[shoulder,1,.75]]){
      for(let i=0;i<sides;i++){
        const angle=i*2*Math.PI/sides;
        const branch=i%2===0?1:.78;
        position.push(Math.cos(angle)*r*radius*branch,height+(i%3)*.018,Math.sin(angle)*r*radius*branch);
        const light=shade*(.86+(i%3)*.10);
        colors.push(light,light,light);
      }
    }
    const peak=start+sides*2;
    position.push(.075,tip,-.04);colors.push(1,1,1);
    for(let i=0;i<sides;i++){
      const next=(i+1)%sides,a=start+i,b=start+next,c=a+sides,d=b+sides;
      indices.push(a,c,b,b,c,d,c,peak,d);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addWhitepeakWoodlands(scene,relief,{halfX,halfZ}){
  const tiles=new Map(),points=relief.attributes.position,faces=relief.index.array;
  let state=6367;
  const random=()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/4294967296;
  };
  for(let i=0;i<faces.length;i+=3){
    const a=faces[i],b=faces[i+1],c=faces[i+2];
    const ax=points.getX(a),az=points.getZ(a);
    const bx=points.getX(b)-ax,bz=points.getZ(b)-az;
    const cx=points.getX(c)-ax,cz=points.getZ(c)-az;
    const x=ax+(bx+cx)/3,z=az+(bz+cz)/3;
    const edge=Math.max(Math.abs(x)-halfX,Math.abs(z)-halfZ);
    const distance=Math.hypot(x*.80,z);
    if(edge<-170||distance>16000||z < -4600)continue;
    const ay=points.getY(a),by=points.getY(b)-ay,cy=points.getY(c)-ay;
    const elevation=ay+(by+cy)/3+1200;
    if(elevation>3850)continue;
    const projectedArea=Math.abs(bx*cz-bz*cx);
    const slope=projectedArea/Math.hypot(by*cz-bz*cy,projectedArea,bx*cy-by*cx);
    if(slope<.65)continue;

    const spacing=THREE.MathUtils.lerp(32,76,THREE.MathUtils.smoothstep(distance,3500,12600));
    const samples=projectedArea*.5/(spacing*spacing);
    const count=Math.floor(samples+random());
    for(let j=0;j<count;j++){
      // Sampling inside each actual rendered triangle keeps roots on the relief at every mesh resolution.
      let u=random(),v=random();
      if(u+v>1){u=1-u;v=1-v;}
      const tx=ax+u*bx+v*cx,tz=az+u*bz+v*cz,ty=ay+u*by+v*cy;
      if(Math.max(Math.abs(tx)-halfX,Math.abs(tz)-halfZ)<80)continue;
      const stand=groveDensity(tx*.29,tz*.29),glade=groveDensity(tx,tz);
      const treeline=3510+(stand-.5)*730;
      const density=THREE.MathUtils.smoothstep(stand*.73+glade*.27,.395,.58)
        *THREE.MathUtils.smoothstep(slope,.65,.91)
        *(1-THREE.MathUtils.smoothstep(ty+1200,treeline-280,treeline))
        *(1-THREE.MathUtils.smoothstep(distance,13500,16000));
      if(random()>density)continue;
      const key=`${Math.floor(tx/tileSize)},${Math.floor(tz/tileSize)}`;
      if(!tiles.has(key))tiles.set(key,[]);
      const age=random(),crownSize=(.56+age*.43)*Math.min(spacing,63);
      tiles.get(key).push({x:tx,y:ty-crownSize*.12,z:tz,radius:crownSize*.42,
        height:crownSize*(1.03+random()*.38),heading:random()*2*Math.PI,shade:random()});
    }
  }
  const group=new THREE.Group();
  group.name='Whitepeak slope woodlands';
  const fullCrown=crownGeometry(true),simpleCrown=crownGeometry(false),dummy=new THREE.Object3D();
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.userData.distanceHaze=.55;
  material.userData.useBackgroundFog=true;
  const fir=new THREE.Color('#284238'),sunlit=new THREE.Color('#68795a'),tint=new THREE.Color();
  for(const [key,trees] of tiles){
    const [col,row]=key.split(',').map(Number);
    const distance=Math.hypot((col+.5)*tileSize,(row+.5)*tileSize);
    const mesh=new THREE.InstancedMesh(distance<6800?fullCrown:simpleCrown,material,trees.length);
    mesh.name='Woodland tile';
    for(const [i,tree] of trees.entries()){
      dummy.position.set(tree.x,tree.y,tree.z);
      dummy.rotation.y=tree.heading;
      dummy.scale.set(tree.radius,tree.height,tree.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      mesh.setColorAt(i,tint.copy(fir).lerp(sunlit,tree.shade));
    }
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
