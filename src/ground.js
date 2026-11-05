import * as THREE from 'three';
import {createSnowMaterial} from './snow.js';

// Prebuilt static LOD tiles: real 5 m export near the player, coarser samples far away.
// No per-frame terrain vertex rebuild or invented trail-edge cliffs.
export function addDetailedGround(scene,terrain,renderer,canopy,extent){
  const fullW=(terrain.width-1)*terrain.spacing,fullH=(terrain.height-1)*terrain.spacing;
  const material=createSnowMaterial(fullW,fullH,renderer);
  if(canopy){
    const compile=material.onBeforeCompile;
    material.onBeforeCompile=shader=>{
      compile(shader);shader.uniforms.canopyMap={value:canopy};const ce=terrain.originUTM[0]+fullW/2,cn=terrain.originUTM[1]-fullH/2;
      shader.uniforms.forestBounds={value:new THREE.Vector4(extent.xmin-ce,cn-extent.ymax,extent.xmax-extent.xmin,extent.ymax-extent.ymin)};
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D canopyMap;uniform vec4 forestBounds;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 canopyUV=vec2((vSnowPosition.x-forestBounds.x)/forestBounds.z,1.-(vSnowPosition.z-forestBounds.y)/forestBounds.w);
          float forest=texture2D(canopyMap,canopyUV).r;
          float distanceFade=smoothstep(75.,420.,distance(cameraPosition.xz,vSnowPosition.xz));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.20,.19),forest*distanceFade*.78);
        `);
    };
    material.customProgramCacheKey=()=> 'georeferenced-ground-canopy-v1';
  }
  const tileSize=128;
  for(let z=0;z<terrain.height-1;z+=tileSize)for(let x=0;x<terrain.width-1;x+=tileSize){
    const nx=Math.min(tileSize,terrain.width-1-x),nz=Math.min(tileSize,terrain.height-1-z);
    const center=terrain.world(x+nx/2,z+nz/2),cy=terrain.sample(center.x,center.z)-1200;
    const lod=new THREE.LOD();lod.position.set(center.x,cy,center.z);
    for(const [step,distance] of [[1,0],[2,1000],[4,2200]]){
      const cols=nx/step+1,rows=nz/step+1,positions=[],colors=[],uvs=[],normals=[],indices=[],grid=[];
      const white=new THREE.Color('#e8f0eb'),ice=new THREE.Color('#a9c4d1'),rock=new THREE.Color('#697879');
      function vertex(gx,gz){
        const p=terrain.world(gx,gz),e=terrain.surface(p.x,p.z),g=terrain.gradient(p.x,p.z),slope=Math.hypot(g.x,g.z),n=Math.hypot(g.x,1,g.z),index=positions.length/3;
        positions.push(p.x-center.x,e-1200-cy,p.z-center.z);uvs.push((p.x+fullW/2)/fullW,1-(p.z+fullH/2)/fullH);normals.push(-g.x/n,1/n,-g.z/n);
        const color=white.clone().lerp(ice,Math.min(.48,slope*.25));color.lerp(rock,THREE.MathUtils.smoothstep(slope,.8,1.65)*.88);colors.push(color.r,color.g,color.b);grid.push({gx,gz});return index;
      }
      for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)vertex(x+i*step,z+j*step);
      function triangle(a,b,c){
        const polygon=[];
        for(const [u,v] of [[a,b],[b,c],[c,a]]){
          polygon.push(u);const p=grid[u],q=grid[v];
          const boundary=(p.gx===q.gx&&(p.gx===x||p.gx===x+nx))||(p.gz===q.gz&&(p.gz===z||p.gz===z+nz));
          if(boundary){const count=Math.max(Math.abs(p.gx-q.gx),Math.abs(p.gz-q.gz));for(let k=1;k<count;k++)polygon.push(vertex(p.gx+(q.gx-p.gx)*k/count,p.gz+(q.gz-p.gz)*k/count));}
        }
        if(polygon.length===3){indices.push(a,b,c);return;}
        const centerIndex=vertex((grid[a].gx+grid[b].gx+grid[c].gx)/3,(grid[a].gz+grid[b].gz+grid[c].gz)/3);
        for(let i=0;i<polygon.length;i++)indices.push(centerIndex,polygon[i],polygon[(i+1)%polygon.length]);
      }
      for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){const a=j*cols+i;triangle(a,a+cols,a+1);triangle(a+1,a+cols,a+cols+1);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;lod.addLevel(mesh,distance,.12);
    }
    scene.add(lod);
  }
}
