import * as THREE from 'three';
// Bounded height-weighted haze pockets, shared by snow, people, trees and buildings.
export function prepareAtmosphere(scene,clock){
  const patch=material=>{
    if(!material||material.fog===false||material.userData.mountainFog)return;
    material.userData.mountainFog=true;const original=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=shader=>{
      original.call(material,shader);shader.uniforms.mountainFogTime=clock;
      const point=shader.vertexShader.includes('#include <begin_vertex>')?'transformed':'position';
      shader.vertexShader=shader.vertexShader.replace('#include <fog_pars_vertex>','#include <fog_pars_vertex>\nvarying vec3 vMountainFogWorld;')
        .replace('#include <fog_vertex>',`#include <fog_vertex>
          vec4 mountainFogPoint=vec4(${point},1.);
          #ifdef USE_INSTANCING
          mountainFogPoint=instanceMatrix*mountainFogPoint;
          #endif
          vMountainFogWorld=(modelMatrix*mountainFogPoint).xyz;
        `);
      const lights=THREE.ShaderChunk.lights_fragment_begin.replaceAll('directionalLightShadow.shadowIntensity','(directionalLightShadow.shadowIntensity * (1.-smoothstep(170.,210.,distance(cameraPosition.xz,vMountainFogWorld.xz))))');
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',lights);
      shader.fragmentShader=shader.fragmentShader.replace('#include <fog_pars_fragment>','#include <fog_pars_fragment>\nvarying vec3 vMountainFogWorld;uniform float mountainFogTime;')
        .replace('#include <fog_fragment>',`
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              float mistDistance=length(vMountainFogWorld-cameraPosition);
              float fogFactor=1.-exp(-fogDensity*fogDensity*mistDistance*mistDistance);
              float weatherAmount=smoothstep(.0004,.0023,fogDensity);
              vec2 gustUV=vMountainFogWorld.xz*.012+vec2(mountainFogTime*.045,mountainFogTime*.013);
              float pockets=.65+.25*sin(gustUV.x+sin(gustUV.y*.73))+.10*sin(gustUV.y*2.3);
              float heightWeight=.45+.55*exp(-abs(vMountainFogWorld.y-cameraPosition.y)*.008);
              float driftingMist=1.-exp(-mistDistance*fogDensity*weatherAmount*pockets*heightWeight*.55);
              fogFactor=1.-(1.-fogFactor)*(1.-driftingMist);
            #else
              float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
            #endif
            gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);
          #endif
        `);
    };
    material.customProgramCacheKey=()=>key+'-mountain-mist-v1';material.needsUpdate=true;
  };
  scene.traverse(o=>{if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material])patch(material);});
}
