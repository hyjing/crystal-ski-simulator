import * as THREE from 'three';
import {CHASE_TRAILS,MAX_CHASE_TRAIL_SEGMENTS} from './chase-trails.js';

const rows=5,columns=7,verticesPerSegment=rows*columns;
const trianglesPerSegment=(rows-1)*(columns-1)*2;
const halfWidth=1.08,endFeather=.32,snowClearance=.045;

const vertexCommon=`
  varying vec2 vTrailUV;
  varying vec3 vTrailPoint;
  varying float vTrailExpiry;
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
`;
const groundVertex=`
  ${vertexCommon}
  attribute float expiry;
  void main(){
    vTrailUV=uv;
    vTrailPoint=position;
    vTrailExpiry=expiry;
    vec4 mvPosition=modelViewMatrix*vec4(position,1.);
    gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;
const plumeVertex=`
  ${vertexCommon}
  attribute float expiry;
  void main(){
    vTrailUV=uv;
    vTrailExpiry=expiry;
    vec4 center=instanceMatrix[3];
    vTrailPoint=center.xyz;
    vec4 mvPosition=modelViewMatrix*center;
    mvPosition.xy+=vec2(position.x*length(instanceMatrix[0].xyz),position.y*length(instanceMatrix[1].xyz));
    gl_Position=projectionMatrix*mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const fragmentCommon=`
  uniform float time;
  uniform vec3 tint;
  varying vec2 vTrailUV;
  varying vec3 vTrailPoint;
  varying float vTrailExpiry;
  #include <common>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  float trailHash(vec2 cell){
    vec3 p=fract(vec3(cell.xyx)*.1031);
    p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float trailNoise(vec2 p){
    vec2 cell=floor(p),f=fract(p);
    f*=f*(3.-2.*f);
    return mix(mix(trailHash(cell),trailHash(cell+vec2(1.,0.)),f.x),
      mix(trailHash(cell+vec2(0.,1.)),trailHash(cell+1.),f.x),f.y);
  }
`;
const fragmentEnd=`
    #include <logdepthbuf_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const groundFragment=`
  ${fragmentCommon}
  void main(){
    float fade=smoothstep(0.,.65,vTrailExpiry-time);
    float feather=smoothstep(0.,.115,min(vTrailUV.y,1.-vTrailUV.y));
    vec2 world=vTrailPoint.xz;
    float roughEdge=trailNoise(world*7.);
    float lateral=abs(vTrailUV.x*2.-1.+(roughEdge-.5)*.10);
    float ski=abs(lateral-.25);
    float groove=1.-smoothstep(.044,.125,ski);
    float berm=1.-smoothstep(.035,.105,abs(ski-.155));
    float scatter=(1.-smoothstep(.37,.84,lateral))*smoothstep(.45,.84,roughEdge);
    float fleck=trailNoise(world*16.+vec2(.7,2.8));
    float glow=groove*(.55+.45*trailNoise(world*3.+time*.75));
    float alpha;
    vec3 color;
    #if defined(TRAIL_FIRE)
      color=mix(vec3(.19,.027,.009),tint,glow*.92);
      color=mix(color,vec3(1.,.50,.12),glow*smoothstep(.34,.87,fleck));
      alpha=max(groove*.72,max(berm*.16,scatter*.18));
    #elif defined(TRAIL_FROST)
      color=mix(vec3(.045,.18,.27),tint,smoothstep(.27,.87,fleck));
      color=mix(color,vec3(.85,.96,1.),max(berm*.65,groove*fleck*.45));
      alpha=max(groove*.63,max(berm*.29,scatter*.34));
    #else
      color=mix(tint,vec3(.70,.77,1.),trailNoise(world*4.+time*.50));
      alpha=max(groove*.51,scatter*.32);
    #endif
    alpha*=fade*feather;
    if(alpha<.008)discard;
    gl_FragColor=vec4(color,alpha);
  ${fragmentEnd}
`;
const plumeFragment=`
  ${fragmentCommon}
  void main(){
    vec2 uv=vTrailUV;
    float fade=smoothstep(0.,.65,vTrailExpiry-time);
    float seed=trailHash(vTrailPoint.xz);
    float drift=time+seed*6.;
    float height=uv.y;
    float turbulence=trailNoise(vec2(uv.x*5.+seed*15.,height*5.-drift*3.9));
    float sway=sin(drift*5.3+height*5.)*.085*height;
    float x=uv.x-.5-sway-(turbulence-.5)*.16*height;
    float softEdge=smoothstep(0.,.08,uv.x)*smoothstep(0.,.08,1.-uv.x);
    vec2 sparkUV=vec2(uv.x*8.+seed*11.,height*8.-drift*2.2);
    vec2 cell=floor(sparkUV);
    float offset=trailHash(cell);
    vec2 sparkPoint=vec2(.14+.67*offset,.26+.47*trailHash(cell+2.));
    float spark=(1.-smoothstep(.045,.18,length(fract(sparkUV)-sparkPoint)))
      *smoothstep(.57,.85,offset)*smoothstep(.18,.50,height)*(1.-smoothstep(.62,.96,height));
    vec3 color;
    float alpha;
    #if defined(TRAIL_FIRE)
      float top=.59+turbulence*.25;
      float width=.34*pow(max(.0,1.-height/top),.74)+.01;
      float flame=(1.-smoothstep(width*.35,width,abs(x)))*(1.-smoothstep(top-.17,top,height));
      flame*=smoothstep(0.,.105,height)*(.57+.43*turbulence);
      float core=flame*(1.-smoothstep(.03,.21,abs(x)))*(1.-smoothstep(.12,.52,height));
      color=mix(tint,vec3(1.,.80,.35),clamp(core+spark,0.,1.));
      alpha=flame*.68+spark*.38;
    #else
      float vapor=(1.-smoothstep(.055,.42,abs(x)))*smoothstep(.01,.15,height)
        *(1.-smoothstep(.28,.74,height))*smoothstep(.28,.75,turbulence);
      color=mix(tint,vec3(.86,.96,1.),spark);
      alpha=vapor*.23+spark*.40;
    #endif
    alpha*=softEdge*fade;
    if(alpha<.008)discard;
    gl_FragColor=vec4(color,alpha);
  ${fragmentEnd}
`;

function makeMaterial(type,color,clock,plume){
  const defines=type==='flametrail'?{TRAIL_FIRE:1}:type==='frosttrail'?{TRAIL_FROST:1}:{};
  return new THREE.ShaderMaterial({
    defines,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:clock,tint:{value:new THREE.Color(color)}},
    vertexShader:plume?plumeVertex:groundVertex,fragmentShader:plume?plumeFragment:groundFragment,
    fog:true,transparent:true,depthWrite:false,toneMapped:false,
    blending:plume?THREE.AdditiveBlending:THREE.NormalBlending,
    side:plume?THREE.FrontSide:THREE.DoubleSide,
  });
}

function groundGeometry(){
  const capacity=MAX_CHASE_TRAIL_SEGMENTS*verticesPerSegment;
  const geometry=new THREE.BufferGeometry();
  const positions=new Float32Array(capacity*3),uvs=new Float32Array(capacity*2),expiry=new Float32Array(capacity);
  const indices=new Uint16Array(MAX_CHASE_TRAIL_SEGMENTS*trianglesPerSegment*3);
  let index=0;
  for(let segment=0;segment<MAX_CHASE_TRAIL_SEGMENTS;segment++){
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const i=segment*verticesPerSegment+row*columns+col;
      uvs.set([col/(columns-1),row/(rows-1)],i*2);
      if(row===rows-1||col===columns-1)continue;
      indices.set([i,i+columns,i+1,i+1,i+columns,i+columns+1],index);
      index+=6;
    }
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  geometry.setAttribute('expiry',new THREE.BufferAttribute(expiry,1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));
  geometry.setDrawRange(0,0);
  return geometry;
}

function sampleGrooves(segment,surface){
  const {a,b,heading}=segment,sin=Math.sin(heading),cos=Math.cos(heading);
  const positions=new Float32Array(verticesPerSegment*3);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const t=row/(rows-1),long=(t*2-1)*endFeather,across=(col/(columns-1)*2-1)*halfWidth;
    const x=THREE.MathUtils.lerp(a.x,b.x,t)+sin*long+cos*across;
    const z=THREE.MathUtils.lerp(a.z,b.z,t)+cos*long-sin*across;
    positions.set([x,surface(x,z)+snowClearance,z],(row*columns+col)*3);
  }
  return positions;
}

export class ChaseTrailEffects {
  constructor(root,types=Object.keys(CHASE_TRAILS)){
    this.clock={value:0};
    this.grooves=new WeakMap();
    this.previous=[];
    this.dummy=new THREE.Object3D();
    this.layers=Object.fromEntries(types.map(type=>{
      const item=CHASE_TRAILS[type];
      const ribbon=new THREE.Mesh(groundGeometry(),makeMaterial(type,item.color,this.clock,false));
      const flame=new THREE.PlaneGeometry(1,1).translate(0,.47,0);
      flame.setAttribute('expiry',new THREE.InstancedBufferAttribute(new Float32Array(MAX_CHASE_TRAIL_SEGMENTS),1).setUsage(THREE.DynamicDrawUsage));
      const plume=new THREE.InstancedMesh(flame,makeMaterial(type,item.color,this.clock,true),MAX_CHASE_TRAIL_SEGMENTS);
      plume.count=0;
      plume.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for(const mesh of [ribbon,plume]){
        mesh.visible=false;
        mesh.frustumCulled=false;
        root.add(mesh);
      }
      return [type,{ribbon,plume}];
    }));
  }

  update(segments,surface,time){
    this.clock.value=time;
    if(this.previous.length===segments.length&&segments.every((segment,i)=>segment===this.previous[i]))return;
    this.previous=segments.slice();
    for(const {plume} of Object.values(this.layers))plume.count=0;
    for(const segment of segments){
      const {ribbon,plume}=this.layers[segment.type],index=plume.count++;
      const offset=index*verticesPerSegment;
      const attrs=ribbon.geometry.attributes;
      let positions=this.grooves.get(segment);
      if(!positions){
        positions=sampleGrooves(segment,surface);
        this.grooves.set(segment,positions);
      }
      attrs.position.array.set(positions,offset*3);
      attrs.expiry.array.fill(segment.until,offset,offset+verticesPerSegment);
      const fire=segment.type==='flametrail',variation=.83+.17*Math.cos(segment.x*1.7+segment.z*3.1);
      const dummy=this.dummy;
      dummy.position.set(segment.x,surface(segment.x,segment.z)+.07,segment.z);
      dummy.scale.set(fire?2.25:1.70,(fire?1.53:.83)*variation,1);
      dummy.updateMatrix();
      plume.setMatrixAt(index,dummy.matrix);
      plume.geometry.attributes.expiry.setX(index,segment.until);
    }
    for(const {ribbon,plume} of Object.values(this.layers)){
      const count=plume.count;
      ribbon.visible=plume.visible=count>0;
      ribbon.geometry.setDrawRange(0,count*trianglesPerSegment*3);
      if(!count)continue;
      ribbon.geometry.attributes.position.needsUpdate=true;
      ribbon.geometry.attributes.expiry.needsUpdate=true;
      plume.instanceMatrix.needsUpdate=true;
      plume.geometry.attributes.expiry.needsUpdate=true;
    }
  }
}
