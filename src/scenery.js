import * as THREE from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

// All terrain shares the local tile's UTM origin and metric vertical datum.
export function gridBounds(grid,local){
  const centerE=local.originUTM[0]+(local.width-1)*local.spacing/2;
  const centerN=local.originUTM[1]-(local.height-1)*local.spacing/2;
  return {west:grid.originUTM[0]-centerE,east:grid.originUTM[0]+(grid.width-1)*grid.spacing-centerE,
    north:centerN-grid.originUTM[1],south:centerN-grid.originUTM[1]+(grid.height-1)*grid.spacing};
}

function winterMaterial(texture){
  if(!texture)return new THREE.MeshStandardMaterial({color:'#c1cdd6',roughness:1});
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:1});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vElevation; varying float vSteep;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvElevation=position.y+1200.; vSteep=1.-abs(normal.y);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vElevation; varying float vSteep;')
      .replace('#include <map_fragment>',`#ifdef USE_MAP
        vec4 aerial=texture2D(map,vMapUv);
        float luma=dot(aerial.rgb,vec3(.2126,.7152,.0722));
        // Preserve the photographed glacier channels and rock, with authored winter snow.
        float snow=smoothstep(1150.,2150.,vElevation)*(1.-smoothstep(.18,.62,vSteep)*.82);
        vec3 winterSnow=vec3(.84,.90,.97)*(.52+.48*sqrt(luma));
        vec3 winterForest=aerial.rgb*vec3(.65,.76,.83);
        float cover=snow*mix(.87,.25,smoothstep(2300.,3300.,vElevation));
        diffuseColor.rgb*=mix(winterForest,winterSnow,cover);
      #endif`);
  };
  material.customProgramCacheKey=()=> 'georeferenced-winter-aerial-v1';
  return material;
}

function addGrid(scene,grid,local,texture,exclude=[]){
  const bounds=gridBounds(grid,local),step=2;
  const cols=Math.ceil((grid.width-1)/step)+1,rows=Math.ceil((grid.height-1)/step)+1;
  const positions=new Float32Array(cols*rows*3),uvs=new Float32Array(cols*rows*2),indices=[];
  for(let z=0;z<rows;z++)for(let x=0;x<cols;x++){
    const gx=Math.min(x*step,grid.width-1),gz=Math.min(z*step,grid.height-1),i=z*cols+x;
    const px=bounds.west+gx*grid.spacing,pz=bounds.north+gz*grid.spacing;
    positions.set([px,grid.heights[gz*grid.width+gx]-1200,pz],i*3);
    // Image bounds are pixel edges; DEM coordinates are pixel centers.
    uvs.set([(gx+.5)/grid.width,1-(gz+.5)/grid.height],i*2);
    if(x===cols-1||z===rows-1)continue;
    const cx=px+grid.spacing*step/2,cz=pz+grid.spacing*step/2;
    if(exclude.some(b=>cx>b.west&&cx<b.east&&cz>b.north&&cz<b.south))continue;
    indices.push(i,i+cols,i+1,i+1,i+cols,i+cols+1);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,winterMaterial(texture));mesh.name='USGS distant terrain';scene.add(mesh);return mesh;
}

export function addContextTerrain(scene,context,local,texture,rainier){
  const halfX=(local.width-1)*local.spacing/2,halfZ=(local.height-1)*local.spacing/2;
  const exclude=[{west:-halfX+180,east:halfX-180,north:-halfZ+180,south:halfZ-180}];
  if(rainier){const b=gridBounds(rainier,local),inset=context.spacing*2;exclude.push({west:b.west+inset,east:b.east-inset,north:b.north+inset,south:b.south-inset});}
  return addGrid(scene,context,local,texture,exclude);
}

export function addRainierTerrain(scene,grid,local,texture){
  const mesh=addGrid(scene,grid,local,texture);mesh.name='Mount Rainier / USGS + NAIP';
  const b=gridBounds(grid,local);
  // Avoid argument spreading the large DEM when locating the real summit.
  let summit=0;for(let j=1;j<grid.heights.length;j++)if(grid.heights[j]>grid.heights[summit])summit=j;
  const peak=new THREE.Vector3(b.west+(summit%grid.width)*grid.spacing,grid.heights[summit]-1200,b.north+Math.floor(summit/grid.width)*grid.spacing);
  scene.userData.rainierPeak=peak;return mesh;
}

function addFallbackSky(scene){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(58000,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    uniforms:{zenith:{value:new THREE.Color('#5389b4')},horizon:{value:new THREE.Color('#d9e4eb')}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 zenith;uniform vec3 horizon;varying vec3 vDirection;void main(){float h=normalize(vDirection).y;float t=pow(max(0.,h),.48);gl_FragColor=vec4(mix(horizon,zenith,t),1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
  }));
  // Keep preprocessor directives on their own lines for WebGL compilers.
  sky.material.fragmentShader=sky.material.fragmentShader.replace(';#include',';\n#include');
  scene.add(sky);
}


export async function addAlpineSky(scene,renderer){
  try{
    const texture=await new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}assets/partly-cloudy-sky.hdr`);
    texture.mapping=THREE.EquirectangularReflectionMapping;scene.background=texture;scene.backgroundIntensity=.78;
    const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(texture).texture;scene.environmentIntensity=.22;pmrem.dispose();
  }catch(error){console.warn('Photo sky unavailable',error);addFallbackSky(scene);}
}
