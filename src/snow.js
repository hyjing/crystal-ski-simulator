import * as THREE from 'three';
import {snowLighting} from './environment.js';

// Repeating, world-scale micro relief. Large forms always come from the DEM.
export function createSnowMaterial(width,depth,renderer){
  const size=256,heights=new Float32Array(size*size);let seed=71;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
  const grids=[16,32,64].map(n=>({n,values:Float32Array.from({length:n*n},rng)}));
  const noise=(x,z,grid)=>{
    const u=x/size*grid.n,v=z/size*grid.n,ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
    const a=grid.values[iz*grid.n+ix],b=grid.values[iz*grid.n+(ix+1)%grid.n],c=grid.values[((iz+1)%grid.n)*grid.n+ix],d=grid.values[((iz+1)%grid.n)*grid.n+(ix+1)%grid.n];
    const tx=fx*fx*(3-2*fx),tz=fz*fz*(3-2*fz);return (a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+d*tx)*tz;
  };
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    heights[z*size+x]=rng()*.08+noise(x,z,grids[0])*.18+noise(x,z,grids[1])*.075+noise(x,z,grids[2])*.04;
  }
  const normal=new Uint8Array(size*size*4),albedo=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const i=(z*size+x)*4,dx=heights[z*size+(x+1)%size]-heights[z*size+(x+size-1)%size],dz=heights[((z+1)%size)*size+x]-heights[((z+size-1)%size)*size+x];
    const n=new THREE.Vector3(-dx*1.1,-dz*1.1,1).normalize();
    normal.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255],i);
    const shade=240+heights[z*size+x]*17;
    albedo.set([shade,shade+2,Math.min(255,shade+5),255],i);
    const value=190+rng()*47;rough.set([value,value,value,255],i);
  }
  const texture=(bytes,color=false)=>{
    const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(width/5,depth/5);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
    t.generateMipmaps=true;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    if(color)t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
  };
  const material=new THREE.MeshPhysicalMaterial({vertexColors:true,map:texture(albedo,true),normalMap:texture(normal),normalScale:new THREE.Vector2(.65,.65),roughnessMap:texture(rough),roughness:.87,metalness:0,clearcoat:.025,clearcoatRoughness:.7});
  material.onBeforeCompile=shader=>{
    shader.uniforms.snowSunDirection=snowLighting.sunDirection;shader.uniforms.snowCloudCover=snowLighting.cloudCover;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSnowPosition = (modelMatrix * vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSnowPosition;
      uniform vec3 snowSunDirection;uniform float snowCloudCover;
      float snowHash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float snowNoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(snowHash(i),snowHash(i+vec2(1.,0.)),f.x),mix(snowHash(i+vec2(0.,1.)),snowHash(i+vec2(1.,1.)),f.x),f.y); }
    `).replace('#include <color_fragment>',`#include <color_fragment>
      float wind = snowNoise(vSnowPosition.xz * .045);
      float broad = snowNoise(vSnowPosition.xz * .006);
      float grain=snowNoise(vSnowPosition.xz*15.7);
      diffuseColor.rgb *= .93 + .045 * wind + .035 * broad + .018*grain;
    `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float relief=(snowNoise(vSnowPosition.xz*2.8)*.023+snowNoise(vSnowPosition.xz*12.3)*.007)*(1.-smoothstep(18.,110.,distance(cameraPosition,vSnowPosition)));
      vec3 snowQ0=dFdx(-vViewPosition),snowQ1=dFdy(-vViewPosition);
      vec3 snowR1=cross(snowQ1,normal),snowR2=cross(normal,snowQ0);float snowDet=dot(snowQ0,snowR1);
      normal=normalize(abs(snowDet)*normal-sign(snowDet)*(dFdx(relief)*snowR1+dFdy(relief)*snowR2));
    `).replace('#include <opaque_fragment>',`
      float sparkle=pow(snowNoise(vSnowPosition.xz*97.1),28.)*(1.-smoothstep(4.,24.,distance(cameraPosition,vSnowPosition)))*(1.-snowCloudCover);
      outgoingLight+=vec3(1.,.97,.89)*sparkle*.14*max(0.,dot(normal,normalize((viewMatrix*vec4(snowSunDirection,0.)).xyz)));
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>'snow-relief-v2';
  return material;
}

export class SnowEffects {
  constructor(scene,terrain,origin=1200){
    this.terrain=terrain;this.origin=origin;this.previous=null;this.cursor=0;this.count=0;this.capacity=8500;
    // Each of two ski grooves has a shaded center and two light displaced rims.
    this.verticesPerSegment=36;
    this.geometry=new THREE.BufferGeometry();
    this.positions=new THREE.BufferAttribute(new Float32Array(this.capacity*36*3),3).setUsage(THREE.DynamicDrawUsage);
    this.colors=new THREE.BufferAttribute(new Float32Array(this.capacity*36*3),3).setUsage(THREE.DynamicDrawUsage);
    this.normals=new THREE.BufferAttribute(new Float32Array(this.capacity*36*3),3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position',this.positions);this.geometry.setAttribute('color',this.colors);this.geometry.setAttribute('normal',this.normals);this.geometry.setDrawRange(0,0);
    this.mesh=new THREE.Mesh(this.geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,side:THREE.DoubleSide,transparent:true,opacity:.78,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;this.mesh.renderOrder=1;scene.add(this.mesh);
    this.particleCount=540;this.particleCursor=0;this.particles=Array.from({length:this.particleCount},()=>({life:0}));
    const particleGeometry=new THREE.BufferGeometry();this.particlePositions=new THREE.BufferAttribute(new Float32Array(this.particleCount*3).fill(-1e5),3).setUsage(THREE.DynamicDrawUsage);
    this.particleAlphas=new THREE.BufferAttribute(new Float32Array(this.particleCount),1).setUsage(THREE.DynamicDrawUsage);
    particleGeometry.setAttribute('position',this.particlePositions);particleGeometry.setAttribute('snowAlpha',this.particleAlphas);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');const radial=ctx.createRadialGradient(32,32,0,32,32,32);radial.addColorStop(0,'#ffffffdf');radial.addColorStop(.35,'#ffffff89');radial.addColorStop(1,'#ffffff00');ctx.fillStyle=radial;ctx.fillRect(0,0,64,64);
    const sprayMaterial=new THREE.PointsMaterial({map:new THREE.CanvasTexture(canvas),color:'#edf5ff',size:.72,transparent:true,depthWrite:false,opacity:.56});
    sprayMaterial.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float snowAlpha; varying float vSnowAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSnowAlpha=snowAlpha;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSnowAlpha;').replace('#include <map_particle_fragment>','#include <map_particle_fragment>\ndiffuseColor.a *= vSnowAlpha;');
    };
    this.sprayMaterial=sprayMaterial;this.spray=new THREE.Points(particleGeometry,sprayMaterial);this.spray.frustumCulled=false;scene.add(this.spray);
  }
  reset(){this.cursor=0;this.count=0;this.geometry.setDrawRange(0,0);this.breakTrail();}
  breakTrail(){this.previous=null;this.particles.forEach(p=>p.life=0);}
  height(x,z){return this.terrain.surface(x,z)-this.origin+.045;}
  writeSegment(a,b){
    if(Math.hypot(b.x-a.x,b.z-a.z)>4)return;
    const halfWidth=.065+Math.min(b.slip||0,4)*.055;
    let offset=this.cursor*this.verticesPerSegment;
    const shades=[new THREE.Color('#dce5ee'),new THREE.Color('#a5b9c9'),new THREE.Color('#edf1f5')];
    const edges=[-1.15,-.80,.80,1.15];
    const at=(p,side,edge)=>{
      const lateral=side*.17+edge*halfWidth;
      return {x:p.x+Math.cos(p.heading)*lateral,z:p.z-Math.sin(p.heading)*lateral};
    };
    for(const side of [-1,1])for(let strip=0;strip<3;strip++){
      const p0=at(a,side,edges[strip]),p1=at(a,side,edges[strip+1]),p2=at(b,side,edges[strip]),p3=at(b,side,edges[strip+1]);
      for(const p of [p0,p2,p1,p1,p2,p3]){
        const g=this.terrain.gradient(p.x,p.z),len=Math.hypot(g.x,1,g.z);
        this.positions.setXYZ(offset,p.x,this.height(p.x,p.z),p.z);this.colors.setXYZ(offset,shades[strip].r,shades[strip].g,shades[strip].b);this.normals.setXYZ(offset,-g.x/len,1/len,-g.z/len);offset++;
      }
    }
    const start=this.cursor*this.verticesPerSegment*3,size=this.verticesPerSegment*3;
    this.positions.addUpdateRange(start,size);this.colors.addUpdateRange(start,size);this.normals.addUpdateRange(start,size);
    this.positions.needsUpdate=this.colors.needsUpdate=this.normals.needsUpdate=true;
    this.cursor=(this.cursor+1)%this.capacity;this.count=Math.min(this.count+1,this.capacity);this.geometry.setDrawRange(0,this.count*this.verticesPerSegment);
  }
  update(dt,skier,running,snow,poleContact){
    if(running&&poleContact){for(let k=0;k<5;k++){const p=this.particles[this.particleCursor++%this.particleCount];Object.assign(p,{x:poleContact.x,y:poleContact.y+.02,z:poleContact.z,vx:(Math.random()-.5)*.5,vz:(Math.random()-.5)*.5,vy:.3+Math.random()*.3,life:.24,maxLife:.3});}}
    if(running&&skier.speed>.8){
      const current={x:skier.x,z:skier.z,heading:skier.heading,slip:skier.slip};
      if(!this.previous)this.previous=current;
      const length=Math.hypot(current.x-this.previous.x,current.z-this.previous.z);
      if(length>20){this.previous=current;}else if(length>.3){
        const count=Math.ceil(length/.55),a=this.previous;let prev=a;
        let angle=current.heading-a.heading;angle=Math.atan2(Math.sin(angle),Math.cos(angle));
        for(let i=1;i<=count;i++){
          const t=i/count,b={x:a.x+(current.x-a.x)*t,z:a.z+(current.z-a.z)*t,heading:a.heading+angle*t,slip:current.slip};this.writeSegment(prev,b);prev=b;
        }
        this.previous=current;
      }
      const intensity=Math.min(1,(snow==='soft'?.18:0)+skier.slip*.2+skier.edge*.5+Math.abs(skier.turn)*.25)*(snow==='soft'?1.5:1);
      this.emission=(this.emission||0)+Math.min(560,skier.speed*intensity*28)*dt;
      const emit=Math.min(20,Math.floor(this.emission));this.emission-=emit;
      for(let i=0;i<emit;i++){
        const p=this.particles[this.particleCursor++%this.particleCount],side=skier.slip>1?(Math.sign(skier.vx*Math.cos(skier.heading)-skier.vz*Math.sin(skier.heading))||1):(Math.random()<.5?-1:1);
        Object.assign(p,{x:skier.x+Math.cos(skier.heading)*side*.23,z:skier.z-Math.sin(skier.heading)*side*.23,y:this.height(skier.x,skier.z)+.08,
          vx:skier.vx*.12+Math.cos(skier.heading)*side*(.3+Math.random()*intensity*3.5),vz:skier.vz*.12-Math.sin(skier.heading)*side*(.3+Math.random()*intensity*3.5),vy:.25+Math.random()*intensity*2.2,life:.6+Math.random()*.7,maxLife:1.3});
      }
    }
    // Pausing also freezes airborne snow.
    for(let i=0;i<this.particleCount;i++){
      const p=this.particles[i];if(p.life>0){if(running){p.life-=dt;p.vy-=3.4*dt;p.vx*=Math.exp(-dt*1.6);p.vz*=Math.exp(-dt*1.6);p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}
        this.particlePositions.setXYZ(i,p.x,p.y,p.z);this.particleAlphas.setX(i,Math.max(0,p.life/p.maxLife));
      }else{this.particlePositions.setXYZ(i,0,-1e5,0);this.particleAlphas.setX(i,0);}
    }
    this.particlePositions.needsUpdate=true;this.particleAlphas.needsUpdate=true;
  }
}
