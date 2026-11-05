import * as THREE from 'three';
import {createSnowMaterial} from './snow.js';

const CELL=.125,TEXTURE_SIZE=512,PATCH_SIZE=48,SEGMENTS=256;
// A bounded sparse world grid retains actual compressed snow / pushed-up rims.
export class PowderField {
  constructor(limit=180000){this.cells=new Map();this.limit=limit;}
  // Exact integer keys within ±16 km, beyond the playable DEM bounds.
  key(ix,iz){return (ix+131072)*262144+(iz+131072);}
  get(x,z){
    const u=x/CELL,v=z/CELL,ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
    const a=this.cells.get(this.key(ix,iz))||0,b=this.cells.get(this.key(ix+1,iz))||0,c=this.cells.get(this.key(ix,iz+1))||0,d=this.cells.get(this.key(ix+1,iz+1))||0;
    return (a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz;
  }
  stamp(x,z,radius,depth){
    const cx=Math.round(x/CELL),cz=Math.round(z/CELL),reach=Math.ceil(radius*1.8/CELL);
    for(let zc=cz-reach;zc<=cz+reach;zc++)for(let xc=cx-reach;xc<=cx+reach;xc++){
      const d=Math.hypot(xc*CELL-x,zc*CELL-z)/radius;if(d>1.8)continue;
      const k=this.key(xc,zc),old=this.cells.get(k)||0;
      const value=d<1?-depth*(1-d*d):depth*.24*Math.sin((d-1)/.8*Math.PI);
      this.cells.set(k,value<0?Math.min(old,value):old<-.01?old:Math.max(old,value));
    }
    while(this.cells.size>this.limit)this.cells.delete(this.cells.keys().next().value);
  }
  clear(){this.cells.clear();}
}

const drift=(x,z)=>.32+.055*Math.sin(x*.31+Math.sin(z*.12))+.035*Math.sin(z*.57+x*.08);
export class PowderSurface {
  constructor(scene,terrain,renderer){
    this.terrain=terrain;this.field=new PowderField();this.previous=null;this.center=null;this.enabled=true;
    this.bytes=new Uint8Array(TEXTURE_SIZE*TEXTURE_SIZE*4);
    this.texture=new THREE.DataTexture(this.bytes,TEXTURE_SIZE,TEXTURE_SIZE,THREE.RGBAFormat);this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.geometry=new THREE.PlaneGeometry(PATCH_SIZE,PATCH_SIZE,SEGMENTS,SEGMENTS);this.geometry.rotateX(-Math.PI/2);
    const material=createSnowMaterial(PATCH_SIZE,PATCH_SIZE,renderer);material.vertexColors=false;material.color.set('#ffffff');material.normalScale.set(.13,.13);material.roughness=1;material.clearcoat=.02;material.transparent=true;material.depthWrite=false;
    const groundData=new Float32Array(terrain.width*terrain.height*4);
    for(let z=0;z<terrain.height;z++)for(let x=0;x<terrain.width;x++){
      const i=z*terrain.width+x,p=terrain.world(x,z),g=terrain.gradient(p.x,p.z),n=terrain.renderNormals;
      groundData.set([terrain.heights[i],n?-n[i*3]/n[i*3+1]:g.x,n?-n[i*3+2]/n[i*3+1]:g.z,0],i*4);
    }
    this.demTexture=new THREE.DataTexture(groundData,terrain.width,terrain.height,THREE.RGBAFormat,THREE.FloatType);
    this.demTexture.minFilter=this.demTexture.magFilter=THREE.NearestFilter;this.demTexture.generateMipmaps=false;this.demTexture.needsUpdate=true;
    const original=material.onBeforeCompile;
    this.uniforms={powderDepth:{value:this.texture},powderOrigin:{value:new THREE.Vector2()},powderCenter:{value:new THREE.Vector2()},powderExtent:{value:TEXTURE_SIZE*CELL},groundDEM:{value:this.demTexture},groundSize:{value:new THREE.Vector2(terrain.width,terrain.height)},groundSpacing:{value:terrain.spacing},powderWhite:{value:new THREE.Color('#e8f0eb')},powderIce:{value:new THREE.Color('#b7ced4')},powderRock:{value:new THREE.Color('#899e9f')},powderFresh:{value:new THREE.Color('#f1f4f8')}};
    material.onBeforeCompile=shader=>{
      original(shader);Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 powderCenter;varying float vPowderSlope;uniform vec3 powderWhite;uniform vec3 powderIce;uniform vec3 powderRock;uniform vec3 powderFresh;').replace('#include <color_fragment>',`#include <color_fragment>
        vec2 powderEdge=vec2(24.)-abs(vSnowPosition.xz-powderCenter);
        vec3 powderColor=mix(powderWhite,powderIce,clamp(vPowderSlope*.29,0.,.6));
        powderColor=mix(powderColor,powderRock,clamp((vPowderSlope-1.15)*.65,0.,.7));
        powderColor=mix(powderColor,powderFresh,smoothstep(0.,4.,min(powderEdge.x,powderEdge.y))*.25);
        diffuseColor.rgb*=powderColor;
        diffuseColor.a*=smoothstep(0.,6.,min(powderEdge.x,powderEdge.y));
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform sampler2D powderDepth;uniform vec2 powderOrigin;uniform vec2 powderCenter;uniform float powderExtent;
        uniform sampler2D groundDEM;uniform vec2 groundSize;uniform float groundSpacing;
        varying float vPowderSlope;
        vec3 groundAt(vec2 p){
          vec2 grid=clamp(p/groundSpacing+(groundSize-1.)*.5,vec2(0.),groundSize-1.001),i=floor(grid),f=fract(grid);
          vec3 a=texture2D(groundDEM,(i+.5)/groundSize).rgb,b=texture2D(groundDEM,(i+vec2(1.5,.5))/groundSize).rgb;
          vec3 c=texture2D(groundDEM,(i+vec2(.5,1.5))/groundSize).rgb,d=texture2D(groundDEM,(i+1.5)/groundSize).rgb;
          vec2 slope=mix(mix(a.gb,b.gb,f.x),mix(c.gb,d.gb,f.x),f.y);
          float h=f.x+f.y<=1.?a.r*(1.-f.x-f.y)+b.r*f.x+c.r*f.y:d.r*(f.x+f.y-1.)+b.r*(1.-f.y)+c.r*(1.-f.x);
          return vec3(h,slope);
        }
        float powderOffset(vec2 p){vec2 uv=(p-powderOrigin)/powderExtent;float pressed=(texture2D(powderDepth,uv).r-.5)*.8;float mound=.32+.055*sin(p.x*.31+sin(p.y*.12))+.035*sin(p.y*.57+p.x*.08);vec2 edge=vec2(24.)-abs(p-powderCenter);return (mound+pressed)*smoothstep(0.,4.,min(edge.x,edge.y));}
      `).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec2 powderWorld=position.xz+powderCenter;vec3 ground=groundAt(powderWorld);
        vPowderSlope=length(ground.yz);
        float gx=(powderOffset(powderWorld+vec2(.25,0.))-powderOffset(powderWorld-vec2(.25,0.)))/.5;
        float gz=(powderOffset(powderWorld+vec2(0.,.25))-powderOffset(powderWorld-vec2(0.,.25)))/.5;
        objectNormal=normalize(vec3(-ground.y-gx,1.,-ground.z-gz));
      `).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y=ground.x-1200.+.012+powderOffset(powderWorld);')
        .replace('vSnowPosition = position;','vSnowPosition = vec3(powderWorld.x,ground.x-1200.,powderWorld.y);')
        .replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=vec2(position.x+powderCenter.x+(groundSize.x-1.)*groundSpacing*.5,(groundSize.y-1.)*groundSpacing*.5-position.z-powderCenter.y)/5.;vNormalMapUv=vMapUv;vRoughnessMapUv=vMapUv;');
    };
    material.customProgramCacheKey=()=>'deformable-powder-gpu-v2';
    this.mesh=new THREE.Mesh(this.geometry,material);this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;scene.add(this.mesh);
  }
  reset(){this.field.clear();this.previous=null;this.center=null;this.textureOrigin=null;}
  breakTrail(){this.previous=null;}
  surface(x,z){
    if(!this.enabled||!this.center)return this.terrain.surface(x,z);
    const distance=Math.min(24-Math.abs(x-this.center.x),24-Math.abs(z-this.center.z)),t=THREE.MathUtils.clamp(distance/4,0,1),fade=t*t*(3-2*t);
    return this.terrain.surface(x,z)+(drift(x,z)+this.field.get(x,z))*fade;
  }
  update(skier,running,snow){
    this.enabled=snow==='soft';this.mesh.visible=this.enabled;
    if(!this.enabled)return;
    const center={x:Math.round(skier.x/12)*12,z:Math.round(skier.z/12)*12};let moved=false;
    if(!this.center||center.x!==this.center.x||center.z!==this.center.z){
      this.center=center;moved=true;this.mesh.position.set(center.x,0,center.z);
      this.uniforms.powderCenter.value.set(center.x,center.z);this.uniforms.powderOrigin.value.set(center.x-32-CELL/2,center.z-32-CELL/2);
    }
    let stamped=false;
    if(running&&skier.speed>.8){
      const a=this.previous||skier,distance=Math.hypot(a.x-skier.x,a.z-skier.z);
      if(distance>.18&&distance<10){
        const count=Math.ceil(distance/.2);
        for(let i=1;i<=count;i++){
          const t=i/count,x=a.x+(skier.x-a.x)*t,z=a.z+(skier.z-a.z)*t;
          for(const side of [-1,1])this.field.stamp(x+Math.cos(skier.heading)*side*.17,z-Math.sin(skier.heading)*side*.17,.21+Math.min(skier.slip,3)*.065,.12+Math.min(skier.slip,3)*.025);
        }
        stamped=true;this.previous={x:skier.x,z:skier.z};
      }else if(!this.previous||distance>=10)this.previous={x:skier.x,z:skier.z};
    }
    if(moved||stamped){
      const startX=Math.round((this.center.x-32)/CELL),startZ=Math.round((this.center.z-32)/CELL);
      if(moved&&!this.field.cells.size){
        // Only R is sampled by the height shader; an untouched window is constant.
        this.bytes.fill(128);this.textureOrigin={x:startX,z:startZ};this.texture.needsUpdate=true;return;
      }
      const localX=Math.round(skier.x/CELL)-startX,localZ=Math.round(skier.z/CELL)-startZ;
      const reach=Math.ceil(7/CELL);
      const rx0=Math.max(0,localX-reach),rx1=Math.min(TEXTURE_SIZE,localX+reach+1),rz0=Math.max(0,localZ-reach),rz1=Math.min(TEXTURE_SIZE,localZ+reach+1);
      let ox0=0,ox1=0,oz0=0,oz1=0,full=moved&&!this.textureOrigin;
      if(moved&&this.textureOrigin){
        const dx=startX-this.textureOrigin.x,dz=startZ-this.textureOrigin.z;
        full=Math.abs(dx)>=TEXTURE_SIZE||Math.abs(dz)>=TEXTURE_SIZE;
        if(!full){
          ox0=Math.max(0,-dx);ox1=Math.min(TEXTURE_SIZE,TEXTURE_SIZE-dx);oz0=Math.max(0,-dz);oz1=Math.min(TEXTURE_SIZE,TEXTURE_SIZE-dz);
          for(let row=0;row<oz1-oz0;row++){
            const z=dz>=0?oz0+row:oz1-1-row;
            this.bytes.copyWithin((z*TEXTURE_SIZE+ox0)*4,((z+dz)*TEXTURE_SIZE+ox0+dx)*4,((z+dz)*TEXTURE_SIZE+ox1+dx)*4);
          }
        }
      }
      const x0=moved?0:rx0,x1=moved?TEXTURE_SIZE:rx1,z0=moved?0:rz0,z1=moved?TEXTURE_SIZE:rz1;
      for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
        const dirty=x>=rx0&&x<rx1&&z>=rz0&&z<rz1;
        if(moved&&!full&&x>=ox0&&x<ox1&&z>=oz0&&z<oz1&&!dirty)continue;
        const value=this.field.cells.get(this.field.key(startX+x,startZ+z))||0,i=(z*TEXTURE_SIZE+x)*4;
        this.bytes[i]=Math.round(THREE.MathUtils.clamp(value/.8+.5,0,1)*255);this.bytes[i+3]=255;
      }
      this.textureOrigin={x:startX,z:startZ};
      this.texture.needsUpdate=true;
    }
  }
}
