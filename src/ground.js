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
      const cols=nx/step+1,rows=nz/step+1,positions=[],colors=[],uvs=[],indices=[];
      const white=new THREE.Color('#e8f0eb'),ice=new THREE.Color('#a9c4d1'),rock=new THREE.Color('#697879');
      for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
        const gx=x+i*step,gz=z+j*step,p=terrain.world(gx,gz),e=terrain.heights[gz*terrain.width+gx],g=terrain.gradient(p.x,p.z),slope=Math.hypot(g.x,g.z);
        positions.push(p.x-center.x,e-1200-cy,p.z-center.z);uvs.push((p.x+fullW/2)/fullW,1-(p.z+fullH/2)/fullH);
        const c=white.clone().lerp(ice,Math.min(.48,slope*.25));
        c.lerp(rock,THREE.MathUtils.smoothstep(slope,.8,1.65)*.88);colors.push(c.r,c.g,c.b);
        if(i<cols-1&&j<rows-1){const a=j*cols+i;indices.push(a,a+cols,a+1,a+1,a+cols,a+cols+1);}
      }
      // Downward skirts close LOD seams; they never raise or reshape the measured surface.
      const edge=[];for(let i=0;i<cols;i++)edge.push(i);for(let j=1;j<rows;j++)edge.push(j*cols+cols-1);for(let i=cols-2;i>=0;i--)edge.push((rows-1)*cols+i);for(let j=rows-2;j>0;j--)edge.push(j*cols);
      for(let j=0;j<edge.length;j++){
        const a=edge[j],b=edge[(j+1)%edge.length],u=positions.length/3;
        for(const k of [a,b]){positions.push(positions[k*3],positions[k*3+1]-18,positions[k*3+2]);colors.push(...colors.slice(k*3,k*3+3));uvs.push(...uvs.slice(k*2,k*2+2));}
        indices.push(a,u,b,b,u,u+1);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;lod.addLevel(mesh,distance,.12);
    }
    scene.add(lod);
  }
}
