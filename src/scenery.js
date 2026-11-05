import * as THREE from 'three';

export function addContextTerrain(scene,context,local){
  const w=context.width,h=context.height,s=context.spacing;
  const centerE=local.originUTM[0]+(local.width-1)*local.spacing/2;
  const centerN=local.originUTM[1]-(local.height-1)*local.spacing/2;
  const halfX=(local.width-1)*local.spacing/2,halfZ=(local.height-1)*local.spacing/2;
  const positions=new Float32Array(w*h*3),colors=new Float32Array(w*h*3),indices=[];
  const forest=new THREE.Color('#586b6b'),snow=new THREE.Color('#dae6ed'),rock=new THREE.Color('#849698');
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
    const i=z*w+x,e=context.heights[i],px=context.originUTM[0]+x*s-centerE,pz=centerN-context.originUTM[1]+z*s;
    positions.set([px,e-1210,pz],i*3);
    const c=forest.clone().lerp(snow,THREE.MathUtils.smoothstep(e,1250,2100));
    const steep=Math.abs((context.heights[i+1]||e)-e)/s;
    if(steep>1)c.lerp(rock,.4);c.toArray(colors,i*3);
    if(x<w-1&&z<h-1){
      if(Math.abs(px+s/2)<halfX-220&&Math.abs(pz+s/2)<halfZ-220)continue;
      indices.push(i,i+w,i+1,i+1,i+w,i+w+1);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
}

export function addAlpineSky(scene){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(58000,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
    uniforms:{zenith:{value:new THREE.Color('#5389b4')},horizon:{value:new THREE.Color('#d9e4eb')}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 zenith;uniform vec3 horizon;varying vec3 vDirection;void main(){float h=normalize(vDirection).y;float t=pow(max(0.,h),.48);gl_FragColor=vec4(mix(horizon,zenith,t),1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
  }));
  // Keep preprocessor directives on their own lines for WebGL compilers.
  sky.material.fragmentShader=sky.material.fragmentShader.replace(';#include',';\n#include');
  scene.add(sky);
}
