import * as THREE from 'three';
import {stitchedRegionalGrid,validRegionalGrid} from './regional-scenery.js';
import {createTerrain} from './terrain.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

// All terrain shares the local tile's UTM origin and metric vertical datum.
export function gridBounds(grid,local){
  const centerE=local.originUTM[0]+(local.width-1)*local.spacing/2;
  const centerN=local.originUTM[1]-(local.height-1)*local.spacing/2;
  return {west:grid.originUTM[0]-centerE,east:grid.originUTM[0]+(grid.width-1)*grid.spacing-centerE,
    north:centerN-grid.originUTM[1],south:centerN-grid.originUTM[1]+(grid.height-1)*grid.spacing};
}

function winterMaterial(texture,snowline=1050){
  if(!texture)return new THREE.MeshStandardMaterial({color:'#c1cdd6',roughness:1});
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:1});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vElevation; varying float vSteep;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvElevation=position.y+1200.; vSteep=1.-abs(normal.y);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vElevation; varying float vSteep;')
      .replace('#include <map_fragment>',`#ifdef USE_MAP
        vec4 aerial=texture2D(map,vMapUv);
        float luma=dot(aerial.rgb,vec3(.2126,.7152,.0722));
        // Keep photographed glacier channels, rock bands, forests and braided rivers.
        float water=smoothstep(.85,1.07,aerial.b/max(aerial.g,.02))*(1.-smoothstep(.12,.30,luma))*(1.-smoothstep(.02,.12,vSteep));
        float vegetation=smoothstep(.005,.055,aerial.g-max(aerial.r,aerial.b)*.86);
        vegetation*=1.-water;
        float rockExposure=smoothstep(.24,.65,vSteep);
        float photographedIce=smoothstep(.25,.70,luma)*(1.-vegetation*.8);
        float winterCover=smoothstep(${snowline.toFixed(1)},${(snowline+(snowline===1050?1000:700)).toFixed(1)},vElevation)*(1.-rockExposure*.88);
        float cover=max(photographedIce*.88,winterCover*(.76-vegetation*.18));
        float detail=clamp(.62+.55*sqrt(luma),.62,1.08);
        vec3 winterSnow=vec3(.88,.94,1.)*detail;
        vec3 photographed=mix(vec3(luma),aerial.rgb,.78);
        photographed=mix(photographed,photographed*vec3(.76,.91,.90),vegetation*.40);
        // Dark water / low valley pixels remain photographic rather than painted white.
        cover*=mix(.50,1.,smoothstep(.035,.17,luma))*(1.-water*.95);
        diffuseColor.rgb*=mix(photographed,winterSnow,clamp(cover,0.,.93));
      #endif`);
  };
  material.customProgramCacheKey=()=> `georeferenced-winter-aerial-v4-${snowline}`;
  return material;
}

export function distantGeometry(grid,local,exclude=[],detail){
  const b=gridBounds(grid,local),positions=[],uvs=[],indices=[],vertices=new Map(),step=grid.width>700?4:2;
  const refined=(x,z)=>!!detail&&x>=0&&z>=0&&x+step<grid.width&&z+step<grid.height&&Math.abs(b.west+(x+step*.5)*grid.spacing-detail.x)<detail.halfX&&Math.abs(b.north+(z+step*.5)*grid.spacing-detail.z)<detail.halfZ;
  const vertex=(x,z)=>{const key=z*grid.width+x;if(vertices.has(key))return vertices.get(key);const i=positions.length/3;vertices.set(key,i);positions.push(b.west+x*grid.spacing,grid.heights[key]-1200,b.north+z*grid.spacing);uvs.push((x+.5)/grid.width,1-(z+.5)/grid.height);return i;};
  const quad=(x,z,x1,z1)=>{const a=vertex(x,z),b=vertex(x1,z),c=vertex(x,z1),d=vertex(x1,z1);indices.push(a,c,b,b,c,d);};
  for(let z=0;z<grid.height-1;z+=step)for(let x=0;x<grid.width-1;x+=step){
    const x1=Math.min(x+step,grid.width-1),z1=Math.min(z+step,grid.height-1),cx=b.west+(x+x1)*.5*grid.spacing,cz=b.north+(z+z1)*.5*grid.spacing;
    if(exclude.some(e=>cx>e.west&&cx<e.east&&cz>e.north&&cz<e.south))continue;
    if(refined(x,z)){for(let j=z;j<z1;j++)for(let i=x;i<x1;i++)quad(i,j,i+1,j+1);continue;}
    const top=refined(x,z-step),right=refined(x+step,z),bottom=refined(x,z+step),left=refined(x-step,z);
    if((!top&&!right&&!bottom&&!left)||x1-x<step||z1-z<step){quad(x,z,x1,z1);continue;}
    // Every fine edge vertex is shared with its coarse neighbor; no T-junction cracks.
    const rim=[[x,z]];if(top)for(let i=1;i<step;i++)rim.push([x+i,z]);rim.push([x1,z]);if(right)for(let i=1;i<step;i++)rim.push([x1,z+i]);rim.push([x1,z1]);if(bottom)for(let i=step-1;i>0;i--)rim.push([x+i,z1]);rim.push([x,z1]);if(left)for(let i=step-1;i>0;i--)rim.push([x,z+i]);
    const center=vertex(x+step/2,z+step/2);for(let i=0;i<rim.length;i++)indices.push(center,vertex(...rim[(i+1)%rim.length]),vertex(...rim[i]));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}

function addGrid(scene,grid,local,texture,exclude=[],detail){
  const mesh=new THREE.Mesh(distantGeometry(grid,local,exclude,detail),winterMaterial(texture,local.treeMinElevation===0?450:1050));mesh.name='USGS distant terrain';scene.add(mesh);return mesh;
}

export function addContextTerrain(scene,context,local,texture,rainier,regional){
  const halfX=(local.width-1)*local.spacing/2,halfZ=(local.height-1)*local.spacing/2;
  const exclude=[{west:-halfX+180,east:halfX-180,north:-halfZ+180,south:halfZ-180}];
  if(rainier){const b=gridBounds(rainier,local),inset=context.spacing*2;exclude.push({west:b.west+inset,east:b.east-inset,north:b.north+inset,south:b.south-inset});}
  if(regional&&validRegionalGrid(regional,context)){const b=gridBounds(regional,local);exclude.push(b);return addGrid(scene,context,local,texture,exclude);}
  return addGrid(scene,context,local,texture,exclude,{x:-7500,z:4000,halfX:6500,halfZ:4000});
}

export function addRegionalTerrain(scene,regional,context,local,texture){
  const grid=stitchedRegionalGrid(regional,context),halfX=(local.width-1)*local.spacing/2,halfZ=(local.height-1)*local.spacing/2;
  const exclude=[{west:-halfX+180,east:halfX-180,north:-halfZ+180,south:halfZ-180}],mesh=addGrid(scene,grid,local,texture,exclude,{x:0,z:0,halfX:3500,halfZ:3500});
  mesh.name='USGS regional ridges / high-detail NAIP';
  const sampled=createTerrain(grid),bounds=gridBounds(grid,local),cx=(bounds.west+bounds.east)/2,cz=(bounds.north+bounds.south)/2,localSample=local.surface?local:createTerrain(local);
  scene.userData.droneTerrain={...sampled,flightBounds:{minX:bounds.west+12,maxX:bounds.east-12,minZ:bounds.north+12,maxZ:bounds.south-12},surface:(x,z)=>Math.abs(x)<halfX&&Math.abs(z)<halfZ?localSample.surface(x,z):sampled.surface(x-cx,z-cz)};return mesh;
}

export function addRainierTerrain(scene,grid,local,texture){
  const b=gridBounds(grid,local);
  let summit=0;for(let j=1;j<grid.heights.length;j++)if(grid.heights[j]>grid.heights[summit])summit=j;
  const peak=new THREE.Vector3(b.west+(summit%grid.width)*grid.spacing,grid.heights[summit]-1200,b.north+Math.floor(summit/grid.width)*grid.spacing);
  const mesh=addGrid(scene,grid,local,texture,[],{x:peak.x,z:peak.z,halfX:3000,halfZ:2500});mesh.name='Mount Rainier / USGS + NAIP';
  scene.userData.rainierPeak=peak;return mesh;
}

export async function addAlpineSky(scene,renderer){
  try{
    const texture=await new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}assets/partly-cloudy-sky.hdr`);
    texture.mapping=THREE.EquirectangularReflectionMapping;texture.wrapS=THREE.RepeatWrapping;scene.background=texture;scene.backgroundIntensity=.78;
    const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(texture).texture;scene.environmentIntensity=.22;pmrem.dispose();
  }catch(error){console.warn('Cloud photo unavailable; weather uses procedural clouds',error);}
}
