import * as THREE from 'three';
import {createSnowMaterial} from './snow.js';

const CELL=.125,TEXTURE_SIZE=512,PATCH_SIZE=48,SEGMENTS=256;
// A bounded sparse world grid retains actual compressed snow / pushed-up rims.
export class PowderField {
  constructor(limit=180000){this.cells=new Map();this.limit=limit;}
  key(ix,iz){return `${ix},${iz}`;}
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
    this.colors=new THREE.BufferAttribute(new Float32Array(this.geometry.attributes.position.count*3).fill(1),3);this.geometry.setAttribute('color',this.colors);
    const material=createSnowMaterial(PATCH_SIZE,PATCH_SIZE,renderer);material.normalScale.set(.13,.13);material.roughness=1;material.clearcoat=.02;material.transparent=true;material.depthWrite=false;
    const original=material.onBeforeCompile;
    this.uniforms={powderDepth:{value:this.texture},powderOrigin:{value:new THREE.Vector2()},powderCenter:{value:new THREE.Vector2()},powderExtent:{value:TEXTURE_SIZE*CELL}};
    material.onBeforeCompile=shader=>{
      original(shader);Object.assign(shader.uniforms,this.uniforms);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 powderCenter;').replace('#include <color_fragment>',`#include <color_fragment>
        vec2 powderEdge=vec2(24.)-abs(vSnowPosition.xz-powderCenter);
        diffuseColor.a*=smoothstep(0.,6.,min(powderEdge.x,powderEdge.y));
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform sampler2D powderDepth;uniform vec2 powderOrigin;uniform vec2 powderCenter;uniform float powderExtent;
        float powderOffset(vec2 p){vec2 uv=(p-powderOrigin)/powderExtent;float pressed=(texture2D(powderDepth,uv).r-.5)*.8;float mound=.32+.055*sin(p.x*.31+sin(p.y*.12))+.035*sin(p.y*.57+p.x*.08);vec2 edge=vec2(24.)-abs(p-powderCenter);return (mound+pressed)*smoothstep(0.,4.,min(edge.x,edge.y));}
      `).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float gx=(powderOffset(position.xz+vec2(.25,0.))-powderOffset(position.xz-vec2(.25,0.)))/.5;
        float gz=(powderOffset(position.xz+vec2(0.,.25))-powderOffset(position.xz-vec2(0.,.25)))/.5;
        objectNormal=normalize(objectNormal+vec3(-gx,0.,-gz));
      `).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y+=powderOffset(position.xz);');
    };
    material.customProgramCacheKey=()=>'deformable-powder-v1';
    this.mesh=new THREE.Mesh(this.geometry,material);this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;scene.add(this.mesh);
  }
  reset(){this.field.clear();this.previous=null;this.center=null;}
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
      this.center=center;moved=true;const p=this.geometry.attributes.position,uv=this.geometry.attributes.uv,normals=this.geometry.attributes.normal;
      const white=new THREE.Color('#e8f0eb'),ice=new THREE.Color('#b7ced4'),rock=new THREE.Color('#899e9f'),fresh=new THREE.Color('#f1f4f8');
      for(let row=0;row<=SEGMENTS;row++)for(let col=0;col<=SEGMENTS;col++){
        const i=row*(SEGMENTS+1)+col,x=center.x-PATCH_SIZE/2+col*PATCH_SIZE/SEGMENTS,z=center.z-PATCH_SIZE/2+row*PATCH_SIZE/SEGMENTS;
        p.setXYZ(i,x,this.terrain.surface(x,z)-1200+.012,z);uv.setXY(i,x/PATCH_SIZE,-z/PATCH_SIZE);
        const g=this.terrain.gradient(x,z),slope=Math.hypot(g.x,g.z),color=white.clone().lerp(ice,THREE.MathUtils.clamp(slope*.29,0,.6));
        const normalLength=Math.hypot(g.x,1,g.z);normals.setXYZ(i,-g.x/normalLength,1/normalLength,-g.z/normalLength);
        if(slope>1.15)color.lerp(rock,THREE.MathUtils.clamp((slope-1.15)*.65,0,.7));
        color.offsetHSL(0,0,Math.sin(x*.024)*Math.sin(z*.019)*.012);
        const edge=Math.min(col,SEGMENTS-col,row,SEGMENTS-row)*PATCH_SIZE/SEGMENTS,fade=THREE.MathUtils.smoothstep(edge,0,4);color.lerp(fresh,fade*.25);this.colors.setXYZ(i,color.r,color.g,color.b);
      }
      p.needsUpdate=uv.needsUpdate=this.colors.needsUpdate=normals.needsUpdate=true;
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
      const localX=Math.round(skier.x/CELL)-startX,localZ=Math.round(skier.z/CELL)-startZ;
      const reach=Math.ceil(7/CELL);
      const x0=moved?0:Math.max(0,localX-reach),x1=moved?TEXTURE_SIZE:Math.min(TEXTURE_SIZE,localX+reach+1);
      const z0=moved?0:Math.max(0,localZ-reach),z1=moved?TEXTURE_SIZE:Math.min(TEXTURE_SIZE,localZ+reach+1);
      for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
        const value=this.field.cells.get(this.field.key(startX+x,startZ+z))||0,i=(z*TEXTURE_SIZE+x)*4;
        this.bytes[i]=Math.round(THREE.MathUtils.clamp(value/.8+.5,0,1)*255);this.bytes[i+3]=255;
      }
      this.texture.needsUpdate=true;
    }
  }
}
