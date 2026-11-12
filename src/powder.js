import * as THREE from 'three';
import {createSnowMaterial} from './snow.js';

const CELL=.125,TEXTURE_SIZE=512,PATCH_SIZE=48,SEGMENTS=256;
// A bounded sparse world grid retains actual compressed snow / pushed-up rims.
export class PowderField {
  constructor(limit=180000){this.cells=new Map();this.stamps=new Map();this.burial=0;this.limit=limit;}
  // Exact integer keys within ±16 km, beyond the playable DEM bounds.
  key(ix,iz){return (ix+131072)*262144+(iz+131072);}
  cover(seconds){this.burial+=Math.max(0,seconds);}
  value(key){
    const stored=this.cells.get(key)||0,age=this.burial-(this.stamps.get(key)||0);
    return stored&&age?stored*Math.exp(-age*.028):stored;
  }
  get(x,z){
    const u=x/CELL,v=z/CELL,ix=Math.floor(u),iz=Math.floor(v),fx=u-ix,fz=v-iz;
    const a=this.value(this.key(ix,iz)),b=this.value(this.key(ix+1,iz)),c=this.value(this.key(ix,iz+1)),d=this.value(this.key(ix+1,iz+1));
    return (a*(1-fx)+b*fx)*(1-fz)+(c*(1-fx)+d*fx)*fz;
  }
  stamp(x,z,radius,depth,bankX=0,bankZ=0){
    const cx=Math.round(x/CELL),cz=Math.round(z/CELL),reach=Math.ceil(radius*1.8/CELL);
    for(let zc=cz-reach;zc<=cz+reach;zc++)for(let xc=cx-reach;xc<=cx+reach;xc++){
      const dx=xc*CELL-x,dz=zc*CELL-z,d=Math.hypot(dx,dz)/radius;if(d>1.8)continue;
      const k=this.key(xc,zc),old=this.value(k);
      const rim=d>=1?1+.85*Math.max(0,(dx*bankX+dz*bankZ)/(d*radius)):1;
      const value=d<1?-depth*(1-d*d):depth*.24*rim*Math.sin((d-1)/.8*Math.PI);
      this.cells.set(k,value<0?Math.min(old,value):old<-.01?old:Math.max(old,value));
      if(this.burial)this.stamps.set(k,this.burial);
    }
    while(this.cells.size>this.limit){const key=this.cells.keys().next().value;this.cells.delete(key);this.stamps.delete(key);}
  }
  clear(){this.cells.clear();this.stamps.clear();this.burial=0;}
}

const drift=(x,z)=>.32+.055*Math.sin(x*.31+Math.sin(z*.12))+.035*Math.sin(z*.57+x*.08);
export class PowderSurface {
  constructor(scene,terrain,renderer){
    this.terrain=terrain;this.stationStops=[];this.nearStations=[];this.field=new PowderField();this.previous=null;this.center=null;this.enabled=true;
    this.bytes=new Uint8Array(TEXTURE_SIZE*TEXTURE_SIZE*4);
    this.texture=new THREE.DataTexture(this.bytes,TEXTURE_SIZE,TEXTURE_SIZE,THREE.RGBAFormat);this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
    this.geometry=new THREE.PlaneGeometry(PATCH_SIZE,PATCH_SIZE,SEGMENTS,SEGMENTS);this.geometry.rotateX(-Math.PI/2);
    const material=createSnowMaterial(PATCH_SIZE,PATCH_SIZE,renderer);material.vertexColors=false;material.color.set('#ffffff');material.normalScale.set(.48,.48);material.roughness=.91;material.clearcoat=.02;material.transparent=true;material.depthWrite=false;
    const groundData=new Float32Array(terrain.width*terrain.height*4);
    for(let z=0;z<terrain.height;z++)for(let x=0;x<terrain.width;x++){
      const i=z*terrain.width+x,p=terrain.world(x,z),g=terrain.gradient(p.x,p.z),n=terrain.renderNormals;
      groundData.set([terrain.heights[i],n?-n[i*3]/n[i*3+1]:g.x,n?-n[i*3+2]/n[i*3+1]:g.z,0],i*4);
    }
    this.demTexture=new THREE.DataTexture(groundData,terrain.width,terrain.height,THREE.RGBAFormat,THREE.FloatType);
    this.demTexture.minFilter=this.demTexture.magFilter=THREE.NearestFilter;this.demTexture.generateMipmaps=false;this.demTexture.needsUpdate=true;
    const original=material.onBeforeCompile;
    this.uniforms={stationCount:{value:0},stationStops:{value:Array.from({length:4},()=>new THREE.Vector2())},powderBurial:{value:0},practiceFeatures:{value:Array.from({length:3},()=>new THREE.Vector4())},practiceCount:{value:0},powderDepth:{value:this.texture},powderOrigin:{value:new THREE.Vector2()},powderCenter:{value:new THREE.Vector2()},powderExtent:{value:TEXTURE_SIZE*CELL},groundDEM:{value:this.demTexture},groundSize:{value:new THREE.Vector2(terrain.width,terrain.height)},groundSpacing:{value:terrain.spacing},powderWhite:{value:new THREE.Color('#e8f0eb')},powderIce:{value:new THREE.Color('#b7ced4')},powderRock:{value:new THREE.Color('#899e9f')},powderFresh:{value:new THREE.Color('#f1f4f8')}};
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
        uniform sampler2D powderDepth;uniform float powderBurial;uniform int stationCount;uniform vec2 stationStops[4];uniform vec2 powderOrigin;uniform vec2 powderCenter;uniform float powderExtent;
        uniform sampler2D groundDEM;uniform vec2 groundSize;uniform float groundSpacing;
        varying float vPowderSlope;
        uniform vec4 practiceFeatures[3];uniform int practiceCount;
        float practiceAt(vec2 p){float h=0.;for(int k=0;k<3;k++){if(k>=practiceCount)break;vec4 f=practiceFeatures[k];vec2 d=p-f.xy;float u=d.x*sin(f.z)+d.y*cos(f.z),v=d.x*cos(f.z)-d.y*sin(f.z);if(u< -7.||u>5.||abs(v)>=4.5)continue;float profile=u<0.?smoothstep(-7.,0.,u):1.-smoothstep(0.,5.,u);float acrossProfile=pow(1.-pow(v/4.5,2.),2.);h=max(h,f.w*profile*acrossProfile);}return h;}
        vec3 groundAt(vec2 p){
          vec2 grid=clamp(p/groundSpacing+(groundSize-1.)*.5,vec2(0.),groundSize-1.001),i=floor(grid),f=fract(grid);
          vec3 a=texture2D(groundDEM,(i+.5)/groundSize).rgb,b=texture2D(groundDEM,(i+vec2(1.5,.5))/groundSize).rgb;
          vec3 c=texture2D(groundDEM,(i+vec2(.5,1.5))/groundSize).rgb,d=texture2D(groundDEM,(i+1.5)/groundSize).rgb;
          vec2 slope=mix(mix(a.gb,b.gb,f.x),mix(c.gb,d.gb,f.x),f.y);
          float h=f.x+f.y<=1.?a.r*(1.-f.x-f.y)+b.r*f.x+c.r*f.y:d.r*(f.x+f.y-1.)+b.r*(1.-f.y)+c.r*(1.-f.x);
          h+=practiceAt(p);slope+=vec2(practiceAt(p+vec2(.5,0.))-practiceAt(p-vec2(.5,0.)),practiceAt(p+vec2(0.,.5))-practiceAt(p-vec2(0.,.5)));
          return vec3(h,slope);
        }
        float stationSnow(vec2 p){float mask=1.;for(int i=0;i<4;i++){if(i>=stationCount)break;mask=min(mask,smoothstep(3.4,5.8,distance(p,stationStops[i])));}return mask;}
        float powderOffset(vec2 p){vec2 uv=(p-powderOrigin)/powderExtent;vec3 stamp=texture2D(powderDepth,uv).rgb;float age=max(0.,powderBurial-dot(stamp.gb,vec2(63.75,16320.)));float pressed=(stamp.r-.5)*.8*exp(-age*.028);float mound=.32+.055*sin(p.x*.31+sin(p.y*.12))+.035*sin(p.y*.57+p.x*.08);vec2 edge=vec2(24.)-abs(p-powderCenter);return (mound+pressed)*smoothstep(0.,4.,min(edge.x,edge.y))*stationSnow(p);}
      `).replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec2 powderWorld=position.xz+powderCenter;vec3 ground=groundAt(powderWorld);
        vPowderSlope=length(ground.yz);
        float gx=(powderOffset(powderWorld+vec2(.25,0.))-powderOffset(powderWorld-vec2(.25,0.)))/.5;
        float gz=(powderOffset(powderWorld+vec2(0.,.25))-powderOffset(powderWorld-vec2(0.,.25)))/.5;
        objectNormal=normalize(vec3(-ground.y-gx,1.,-ground.z-gz));
      `).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y=ground.x-1200.+.012+powderOffset(powderWorld);')
        .replace('vSnowPosition = (modelMatrix * vec4(position,1.)).xyz;','vSnowPosition = vec3(powderWorld.x,ground.x-1200.,powderWorld.y);')
        .replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=vec2(position.x+powderCenter.x+(groundSize.x-1.)*groundSpacing*.5,(groundSize.y-1.)*groundSpacing*.5-position.z-powderCenter.y)/5.;vNormalMapUv=vMapUv;vRoughnessMapUv=vMapUv;');
    };
    material.customProgramCacheKey=()=>'deformable-powder-gpu-v5';
    this.mesh=new THREE.Mesh(this.geometry,material);this.mesh.receiveShadow=true;this.mesh.frustumCulled=false;scene.add(this.mesh);
  }
  setStationStops(stops){this.stationStops=stops;this.center=null;}
  refreshStations(center){
    this.nearStations=this.stationStops.map(p=>({p,d:Math.hypot(p.x-center.x,p.z-center.z)}))
      .filter(v=>v.d<42).sort((a,b)=>a.d-b.d).slice(0,4).map(v=>v.p);
    this.uniforms.stationCount.value=this.nearStations.length;
    this.nearStations.forEach((p,i)=>this.uniforms.stationStops.value[i].set(p.x,p.z));
  }
  setPractice(features){this.uniforms.practiceCount.value=Math.min(3,features.length);for(let i=0;i<3;i++){const f=features[i];this.uniforms.practiceFeatures.value[i].set(f?.x||0,f?.z||0,f?.heading||0,f?.height||0);}}
  cover(seconds){this.field.cover(seconds);this.uniforms.powderBurial.value=this.field.burial;}
  reset(){this.field.clear();this.uniforms.powderBurial.value=0;this.previous=null;this.center=null;this.textureOrigin=null;}
  breakTrail(){this.previous=null;}
  surface(x,z){
    if(!this.enabled||!this.center)return this.terrain.surface(x,z);
    const distance=Math.min(24-Math.abs(x-this.center.x),24-Math.abs(z-this.center.z));if(distance<=0)return this.terrain.surface(x,z);const t=THREE.MathUtils.clamp(distance/4,0,1),fade=t*t*(3-2*t);
    let stationMask=1;
    for(const p of this.nearStations)stationMask=Math.min(stationMask,THREE.MathUtils.smoothstep(Math.hypot(x-p.x,z-p.z),3.4,5.8));
    return this.terrain.surface(x,z)+(drift(x,z)+this.field.get(x,z))*fade*stationMask;
  }
  update(skier,running,snow,crowdSegments=[]){
    this.enabled=snow==='soft';this.mesh.visible=this.enabled;
    if(!this.enabled)return;
    const center={x:Math.round(skier.x/12)*12,z:Math.round(skier.z/12)*12};let moved=false;
    if(!this.center||center.x!==this.center.x||center.z!==this.center.z){
      this.center=center;this.refreshStations(center);moved=true;this.mesh.position.set(center.x,0,center.z);
      this.uniforms.powderCenter.value.set(center.x,center.z);this.uniforms.powderOrigin.value.set(center.x-32-CELL/2,center.z-32-CELL/2);
    }
    let stamped=false;
    let minX=skier.x-7,maxX=skier.x+7,minZ=skier.z-7,maxZ=skier.z+7;
    for(const [a,b] of crowdSegments){
      if(Math.abs(b.x-center.x)>25||Math.abs(b.z-center.z)>25)continue;
      const count=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.23);
      for(let i=1;i<=count;i++){
        const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        for(const side of [-1,1])this.field.stamp(x+Math.cos(b.heading)*side*.17,z-Math.sin(b.heading)*side*.17,.18,.075);
      }
      minX=Math.min(minX,a.x-1,b.x-1);maxX=Math.max(maxX,a.x+1,b.x+1);
      minZ=Math.min(minZ,a.z-1,b.z-1);maxZ=Math.max(maxZ,a.z+1,b.z+1);
      stamped=true;
    }
    if(running&&skier.speed>.8){
      const a=this.previous||skier,distance=Math.hypot(a.x-skier.x,a.z-skier.z);
      if(distance>.18&&distance<10){
        const count=Math.ceil(distance/.2),rightX=Math.cos(skier.heading),rightZ=-Math.sin(skier.heading);
        const lateral=skier.vx*rightX+skier.vz*rightZ;
        const outside=(skier.slip||0)>1&&Number.isFinite(lateral)?Math.sign(lateral):0;
        for(let i=1;i<=count;i++){
          const t=i/count,x=a.x+(skier.x-a.x)*t,z=a.z+(skier.z-a.z)*t;
          for(const side of [-1,1])this.field.stamp(x+Math.cos(skier.heading)*side*.17,z-Math.sin(skier.heading)*side*.17,.21+Math.min(skier.slip,3)*.065,.12+Math.min(skier.slip,3)*.025,rightX*outside,rightZ*outside);
        }
        stamped=true;this.previous={x:skier.x,z:skier.z};
      }else if(!this.previous||distance>=10)this.previous={x:skier.x,z:skier.z};
    }
    if(moved||stamped){
      const startX=Math.round((this.center.x-32)/CELL),startZ=Math.round((this.center.z-32)/CELL);
      if(moved&&!this.field.cells.size){
        // Only R is sampled by the height shader; an untouched window is constant.
        this.bytes.fill(0);for(let i=0;i<this.bytes.length;i+=4)this.bytes[i]=128;this.textureOrigin={x:startX,z:startZ};this.texture.needsUpdate=true;return;
      }
      const rx0=Math.max(0,Math.floor(minX/CELL)-startX),rx1=Math.min(TEXTURE_SIZE,Math.ceil(maxX/CELL)-startX+1);
      const rz0=Math.max(0,Math.floor(minZ/CELL)-startZ),rz1=Math.min(TEXTURE_SIZE,Math.ceil(maxZ/CELL)-startZ+1);
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
        const key=this.field.key(startX+x,startZ+z),value=this.field.cells.get(key)||0,i=(z*TEXTURE_SIZE+x)*4;
        const stamp=Math.min(65535,Math.round((this.field.stamps.get(key)||0)*4));
        this.bytes[i]=Math.round(THREE.MathUtils.clamp(value/.8+.5,0,1)*255);this.bytes[i+1]=stamp&255;this.bytes[i+2]=stamp>>8;this.bytes[i+3]=255;
      }
      this.textureOrigin={x:startX,z:startZ};
      this.texture.needsUpdate=true;
    }
  }
}
