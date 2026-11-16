import * as THREE from 'three';
import {mergeAssetGeometry,resortMaterials} from './resort-assets.js';
import {RIVER_MIN,RIVER_MAX,riverZ,riverHalfWidth,riverLevel,valleyRoadZ} from './whitepeak-valley-layout.js';

export function lodgeForestClearings(lodges){
  return lodges.map(({x,z,w,d})=>({x,z,fx:0,fz:1,coreWidth:w/2+12,coreLength:d/2+11}));
}

function ribbon(scene,name,center,halfWidth,samples,height,material){
  const vertices=[],indices=[],colors=[],stripes=5;
  const triangle=(a,b,c)=>{
    const bx=vertices[b*3]-vertices[a*3],bz=vertices[b*3+2]-vertices[a*3+2];
    const cx=vertices[c*3]-vertices[a*3],cz=vertices[c*3+2]-vertices[a*3+2];
    if(bz*cx-bx*cz>=0)indices.push(a,b,c);
    else indices.push(a,c,b);
  };
  for(let i=0;i<samples.length;i++){
    const p=samples[i],width=halfWidth(p);
    for(let j=0;j<stripes;j++){
      const lateral=j/(stripes-1)*2-1;
      const {x,z}=center(p,width*lateral);
      vertices.push(x,height(x,z)-1200,z);
      const shade=.81+.19*(1-Math.abs(lateral));
      colors.push(shade,shade,shade);
      if(i>0&&j>0){
        const c=i*stripes+j;
        triangle(c-stripes-1,c-1,c-stripes);
        triangle(c-stripes,c-1,c);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;scene.add(mesh);
}

export function addWhitepeakValley(scene,terrain,lodges,routes){
  const group=new THREE.Group();group.name='Whitepeak valley and riverside lodges';scene.add(group);
  const {wood,stone,snow}=resortMaterials();
  const roof=new THREE.MeshStandardMaterial({color:'#4d565c',roughness:.88});
  const windows=new THREE.MeshStandardMaterial({color:'#e4bb83',emissive:'#c57d3c',emissiveIntensity:.46,roughness:.45});
  const door=new THREE.MeshStandardMaterial({color:'#35474b',roughness:.81});
  const road=new THREE.MeshStandardMaterial({color:'#837d71',roughness:1,side:THREE.DoubleSide,vertexColors:true});
  const water=new THREE.MeshPhysicalMaterial({color:'#345f65',roughness:.29,metalness:.08,
    clearcoat:.56,side:THREE.DoubleSide,vertexColors:true});
  const xs=Array.from({length:621},(_,i)=>RIVER_MIN+(RIVER_MAX-RIVER_MIN)*i/620);
  ribbon(group,'Meltwater river',(x,dz)=>({x,z:riverZ(x)+dz}),x=>riverHalfWidth(x)+13,xs,riverLevel,water);
  ribbon(group,'Valley road',(x,dz)=>({x,z:valleyRoadZ(x)+dz}),()=>5.4,xs,
    (x,z)=>terrain.surface(x,z)+.10,road);
  for(const route of routes){
    const end=route.points.at(-1),startZ=end.z+29,finishZ=valleyRoadZ(end.x);
    const intervals=Array.from({length:28},(_,i)=>i/27);
    ribbon(group,`${route.name} approach`,(p,dx)=>({x:end.x+dx+9*Math.sin(p*Math.PI),z:startZ+(finishZ-startZ)*p}),
      ()=>2.9,intervals,(x,z)=>terrain.surface(x,z)+.10,road);
  }

  const parts=new Map();
  const colliders=scene.userData.structureStatics??=[];
  for(const lodge of lodges){
    const {x,z,w,d,h,heading}=lodge;
    const c=Math.cos(heading),s=Math.sin(heading);
    const point=(u,v)=>({x:x+u*c+v*s,z:z-u*s+v*c});
    const polygon=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>point(u,v));
    const corners=polygon.map(p=>terrain.surface(p.x,p.z));
    const floor=Math.max(...corners)+.22,low=Math.min(...corners)-.72;
    const y=floor-1200;
    const keep=(material,geometry)=>{
      geometry.rotateY(heading).translate(x,y,z);
      if(!parts.has(material))parts.set(material,[]);
      parts.get(material).push(geometry);
    };
    const box=(material,width,height,depth,u,dy,v)=>{
      keep(material,new THREE.BoxGeometry(width,height,depth).translate(u,dy,v));
    };
    box(stone,w+.4,floor-low,d+.4,0,(low-floor)/2,0);
    box(wood,w,h,d,0,h/2,0);
    const rise=d*.30,span=d/2+1.2,angle=Math.atan2(rise,span);
    for(const sign of [-1,1]){
      const panel=(material,thickness,offset)=>keep(material,new THREE.BoxGeometry(w+2.8,thickness,
        Math.hypot(span,rise)).rotateX(sign*angle).translate(0,h+rise/2+offset,sign*span/2));
      panel(roof,.33,0);
      panel(snow,.20,.24);
      for(let u=-w/2+2.6;u<w/2-1.5;u+=4.1){
        if(sign<0&&Math.abs(u)<2.5)continue;
        box(door,2.25,2.12,.19,u,h*.58,sign*(d/2+.03));
        box(windows,1.85,1.73,.12,u,h*.58,sign*(d/2+.15));
      }
    }
    for(const sign of [-1,1]){
      const gable=new THREE.Shape();
      gable.moveTo(-d/2,0);gable.lineTo(d/2,0);gable.lineTo(0,rise);gable.closePath();
      keep(wood,new THREE.ShapeGeometry(gable).rotateY(sign*Math.PI/2).translate(sign*w/2,h,0));
    }
    box(door,lodge.central?4.9:2.35,3.1,.21,0,1.55,-d/2-.13);
    box(roof,lodge.central?8:4,.34,2.7,0,3.42,-d/2-1);
    box(stone,1.05,2.8,1.1,w*.32,h+rise*.72,d*.13);
    box(roof,1.38,.18,1.38,w*.32,h+rise*.72+1.43,d*.13);
    colliders.push({kind:'polygon',polygon,minY:low-1200,maxY:y+h+rise,label:'河畔木屋'});
  }
  for(const [material,geometry] of parts){
    const mesh=new THREE.Mesh(mergeAssetGeometry(geometry),material);
    mesh.castShadow=material!==windows;mesh.receiveShadow=true;
    group.add(mesh);geometry.forEach(item=>item.dispose());
  }
  return {
    river:xs.filter((x,i)=>i%8===0).map(x=>({x,z:riverZ(x)})),
    road:xs.filter((x,i)=>i%8===0).map(x=>({x,z:valleyRoadZ(x)})),
    lodges,
  };
}
