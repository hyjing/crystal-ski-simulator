import * as THREE from 'three';

// One state drives the visible sky, illumination, fog and airborne snow.
// Artistic mountain weather presets, not a forecast or solar-position calculation.
export const WEATHER_PRESETS={
  clear:{label:'晴空',zenith:'#3478c5',horizon:'#d3e5f2',cloud:'#fff9ed',shadow:'#668bb7',sun:'#fff0da',ground:'#677994',elevation:38,azimuth:235,cover:.22,density:.000011,direct:3.15,ambient:1.35,exposure:.91,snow:0,wind:1.2},
  overcast:{label:'阴天',zenith:'#8498ac',horizon:'#c0cbd3',cloud:'#dbe1e4',shadow:'#7b8d9f',sun:'#e1e9ef',ground:'#728393',elevation:32,azimuth:235,cover:.91,density:.000075,direct:.55,ambient:2.0,exposure:.98,snow:0,wind:2.8},
  snow:{label:'风雪',zenith:'#8c9caa',horizon:'#bac8d2',cloud:'#ccd6df',shadow:'#8495a6',sun:'#e1e9f0',ground:'#7e8f9f',elevation:28,azimuth:235,cover:1,density:.00070,direct:.20,ambient:1.85,exposure:1.0,snow:1,wind:5.5},
  sunset:{label:'夕阳',zenith:'#4c5891',horizon:'#ecac9d',cloud:'#edbbc2',shadow:'#665d93',sun:'#ffb171',ground:'#666080',elevation:7,azimuth:258,cover:.36,density:.000024,direct:2.5,ambient:.95,exposure:.93,snow:0,wind:1.8}
};
export const snowLighting={sunDirection:{value:new THREE.Vector3(-.6,.65,-.4)},cloudCover:{value:.22}};
const flakeWhite=new THREE.Color(1,1,1);
const colorKeys=['zenith','horizon','cloud','shadow','sun','ground'];
export function weatherState(id){const p=WEATHER_PRESETS[id];if(!p)throw new Error(`Unknown weather: ${id}`);return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,colorKeys.includes(k)?new THREE.Color(v):v]));}
export function blendWeather(a,b,t){const out={};for(const k of Object.keys(b))out[k]=colorKeys.includes(k)?a[k].clone().lerp(b[k],t):typeof b[k]==='number'?THREE.MathUtils.lerp(a[k],b[k],t):b[k];return out;}
export function sunDirection(state){const e=THREE.MathUtils.degToRad(state.elevation),a=THREE.MathUtils.degToRad(state.azimuth);return new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)).normalize();}
const skyFragment=`
  uniform vec3 zenith,horizon,cloudColor,cloudShadow,sunColor,sunDirection;
  uniform float cover,time,hasCloudPhoto;uniform sampler2D cloudPhoto; varying vec3 vDirection;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){float n=0.,a=.55;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+13.7;a*=.48;}return n;}
  void main(){
    vec3 d=normalize(vDirection);float elevation=max(0.,d.y);
    vec3 color=mix(horizon,zenith,pow(elevation,.46));
    float facing=max(0.,dot(d,sunDirection));
    color+=sunColor*pow(facing,12.)*(1.-cover*.9)*.36;
    color+=sunColor*(smoothstep(.999985,.999992,facing)*12.+pow(facing,450.)*.7)*(1.-smoothstep(.35,.95,cover));
    vec2 p=d.xz/max(.12,d.y+.14)*2.5+vec2(time*.002,time*.0007);
    float n=fbm(p),thickness=smoothstep(.67-cover*.48,.83-cover*.44,n);
    vec2 photoUV=vec2(atan(d.z,d.x)/6.2831853+.5+time*.000015,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
    vec3 photo=texture2D(cloudPhoto,photoUV).rgb;
    float whiteRatio=min(photo.r,min(photo.g,photo.b))/max(.001,max(photo.r,max(photo.g,photo.b)));
    float photoCloud=smoothstep(.44,.86,whiteRatio)*hasCloudPhoto;
    thickness=mix(thickness,max(thickness*.45,photoCloud*.82),hasCloudPhoto*(1.-smoothstep(.6,.9,cover)));
    thickness=mix(thickness,1.,smoothstep(.86,1.,cover)*.82)*smoothstep(-.02,.16,d.y);
    float rim=clamp(fbm(p-vec2(.09,.04))-n+.5,0.,1.);
    vec3 clouds=mix(cloudShadow,cloudColor,rim*.85+.2);
    color=mix(color,clouds,thickness*.94);
    color=mix(horizon,color,smoothstep(-.12,.07,d.y));
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

class FallingSnow{
  constructor(scene){
    this.count=2400;this.positions=new Float32Array(this.count*3);this.seeds=new Float32Array(this.count*4);let state=17;
    const rng=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};
    for(let i=0;i<this.count;i++)this.seeds.set([rng()*170-85,rng()*85-20,rng()*170-85,.4+rng()],i*4);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('flakeSize',new THREE.BufferAttribute(Float32Array.from({length:this.count},()=>rng()),1));
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{...THREE.UniformsLib.fog,amount:{value:0},tint:{value:new THREE.Color()},pixelRatio:{value:1}},
      vertexShader:`attribute float flakeSize;uniform float pixelRatio;varying float alpha;#include <fog_pars_vertex>
        void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp((.045+flakeSize*.085)*600.*pixelRatio/max(2.,-mvPosition.z),1.,8.*pixelRatio);alpha=(.3+flakeSize*.6)*smoothstep(1.,5.,-mvPosition.z);#include <fog_vertex>}`,
      fragmentShader:`uniform vec3 tint;uniform float amount;varying float alpha;#include <fog_pars_fragment>
        void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.15,1.,d))*alpha*amount;if(a<.015)discard;gl_FragColor=vec4(tint,a);#include <fog_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`});
    for(const key of ['vertexShader','fragmentShader'])this.material[key]=this.material[key].replaceAll(';#include',';\n#include').replaceAll('>}', '>\n}');
    this.mesh=new THREE.Points(g,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;scene.add(this.mesh);
  }
  update(time,camera,state,ratio){
    this.mesh.visible=state.snow>.005;if(!this.mesh.visible)return;
    const wrap=(v,size)=>(v%size+size)%size;
    for(let i=0;i<this.count;i++){const j=i*4,speed=this.seeds[j+3],near=i<this.count*.65,span=near?56:170,height=near?36:85;this.positions.set([
      camera.x+wrap(this.seeds[j]+time*state.wind*.7-camera.x,span)-span/2,
      camera.y+wrap(this.seeds[j+1]-time*(2+speed*2.8)-camera.y,height)-height*.24,
      camera.z+wrap(this.seeds[j+2]+time*state.wind*.22-camera.z,span)-span/2],i*3);}
    this.mesh.geometry.attributes.position.needsUpdate=true;this.material.uniforms.amount.value=state.snow;this.material.uniforms.tint.value.copy(state.cloud).lerp(state.sun,.15).lerp(flakeWhite,.3);this.material.uniforms.pixelRatio.value=ratio;
  }
}

export class MountainWeather{
  constructor(scene,renderer,sun,hemisphere){
    this.scene=scene;this.renderer=renderer;this.sun=sun;this.hemisphere=hemisphere;this.id='clear';this.state=weatherState('clear');this.from=this.state;this.to=this.state;this.progress=1;this.elapsed=0;
    this.uniforms={cloudPhoto:{value:scene.background?.isTexture?scene.background:null},hasCloudPhoto:{value:scene.background?.isTexture?1:0},zenith:{value:this.state.zenith.clone()},horizon:{value:this.state.horizon.clone()},cloudColor:{value:this.state.cloud.clone()},cloudShadow:{value:this.state.shadow.clone()},sunColor:{value:this.state.sun.clone()},sunDirection:snowLighting.sunDirection,cover:snowLighting.cloudCover,time:{value:0}};
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(58000,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:this.uniforms,vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:skyFragment}));
    this.sky.frustumCulled=false;this.sky.renderOrder=-10;scene.background=null;scene.add(this.sky);scene.fog=new THREE.FogExp2(this.state.horizon,this.state.density);this.snowfall=new FallingSnow(scene);
  }
  set(id){if(!WEATHER_PRESETS[id])return;this.id=id;this.from=blendWeather(this.state,this.state,1);this.to=weatherState(id);this.progress=0;}
  update(dt,camera,focus){
    this.elapsed+=dt;this.progress=Math.min(1,this.progress+dt/5);const t=this.progress*this.progress*(3-2*this.progress);this.state=this.progress===1?this.to:blendWeather(this.from,this.to,t);const s=this.state;
    for(const [uniform,key] of [['zenith','zenith'],['horizon','horizon'],['cloudColor','cloud'],['cloudShadow','shadow'],['sunColor','sun']])this.uniforms[uniform].value.copy(s[key]);
    snowLighting.sunDirection.value.copy(sunDirection(s));snowLighting.cloudCover.value=s.cover;this.uniforms.time.value=this.elapsed;
    this.sky.position.copy(camera.position);this.sun.position.copy(focus).addScaledVector(snowLighting.sunDirection.value,700);this.sun.target.position.copy(focus);this.sun.target.updateMatrixWorld();
    this.sun.color.copy(s.sun);this.sun.intensity=s.direct;this.hemisphere.color.copy(s.horizon).lerp(s.zenith,.35);this.hemisphere.groundColor.copy(s.ground);this.hemisphere.intensity=s.ambient;
    this.scene.fog.color.copy(s.horizon);this.scene.fog.density=s.density;this.renderer.toneMappingExposure=s.exposure;this.scene.environmentIntensity=.12*(1-s.cover*.4);
    this.snowfall.update(this.elapsed,camera.position,s,this.renderer.getPixelRatio());
  }
}
