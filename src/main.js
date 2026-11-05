import * as THREE from 'three';
import './style.css';
import { createTerrain, getRoutes, getLiftRuns, pointAlongRoute, filterRoutes } from './terrain.js';
import { createSkier, stepSkier, nearestOnRoute, clamp } from './physics.js';
import { createSnowMaterial, SnowEffects } from './snow.js';
import { addContextTerrain, addRainierTerrain, addAlpineSky } from './scenery.js';
import {PowderSurface} from './powder.js';
import {SpeedRenderer} from './postprocessing.js';
import {addForest,addResort,liftExitSpawn} from './resort.js';
import {addDetailedGround} from './ground.js';
import {prepareStationTerrain,addStationStructures} from './stations.js';
import {preparePisteTerrain,addBoundaryPosts,createArrivalZone} from './pistes.js';
import {hitsTreeTrunk} from './trees.js';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {MountainWeather,WEATHER_PRESETS} from './environment.js';
import {addAlpineDetails} from './alpine-details.js';

const $ = id => document.getElementById(id);
const keys = new Set();
let terrain, routes, route, skier, renderer, scene, camera, athlete, routeGroup, snow='soft';
let mode='intro', view='follow', elapsed=0, peakSpeed=0, checkpoint=0, totalDistance=0, uiClock=0;
let lastTime=0, accumulator=0, pausedFrom='running', soundOn=false, audio, noiseGain, toastTimeout;
let frameTime=1/60,physicsMs=0;
let powderMs=0,frameSamples=[],frameP95=0,frameMax=0,slowFrames=0;
let renderScale=Math.min(devicePixelRatio,1.15),qualityClock=0;
let routeFilter='all',routeQuery='',aerialBounds,stationAreas=[],boundaryPosts,arrivalZone,lookYaw=0,lookPitch=0,lookDrag;
let weather,hemisphere,cameraHeading=null;
let demoCapture,recordedInput=null,sceneryFrom='intro',sceneryView=false;
let treePositions=[], trailPoints=[], mapBackground, snowEffects, sun, powder, speedRenderer, aerialImage, mapLayer='terrain', resortUpdate=()=>{};
const baseElevation=1200, fixedStep=1/120;
const forward = new THREE.Vector3(), targetCamera = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const displayLook = new THREE.Vector3();
const groundNormal=new THREE.Vector3(),skiForward=new THREE.Vector3(),skiRight=new THREE.Vector3(),skiBasis=new THREE.Matrix4();
const clockFormat = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const yAt=(x,z)=>(powder?powder.surface(x,z):terrain.surface(x,z))-baseElevation;

function toast(text){ $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3500); }
function random(seed=42){ return ()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;}; }

async function init(){
  $('start').disabled=true;
  const response=await fetch(`${import.meta.env.BASE_URL}data/crystal-dem.json`);
  if(!response.ok) throw new Error('无法载入高程数据，请刷新重试。');
  terrain=createTerrain(await response.json());
  try{
    const detail=await fetch(`${import.meta.env.BASE_URL}data/crystal-detail-dem.json`).then(r=>{if(!r.ok)throw new Error('detail metadata');return r.json();});
    const bytes=await fetch(`${import.meta.env.BASE_URL}data/${detail.data}`).then(r=>{if(!r.ok)throw new Error('detail heights');return r.arrayBuffer();});
    const heights=new Float32Array(bytes);if(heights.length!==detail.width*detail.height)throw new Error('detail size');
    terrain=createTerrain({...detail,heights});
  }catch(error){console.warn('Detailed ground unavailable, using base DEM',error);}
  const trailResponse=await fetch(`${import.meta.env.BASE_URL}data/crystal-trails.json`);
  if(!trailResponse.ok)throw new Error('无法载入雪道数据');
  const mappedRoutes=getRoutes(terrain,await trailResponse.json());
  const runs=await fetch(`${import.meta.env.BASE_URL}data/crystal-lift-runs.json`).then(r=>{if(!r.ok)throw new Error('缆车线路载入失败');return r.json();});
  routes=getLiftRuns(terrain,runs);
  const [infrastructure,network]=await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/crystal-infrastructure.json`).then(r=>r.json()),
    fetch(`${import.meta.env.BASE_URL}data/crystal-trail-network.json`).then(r=>r.json())]);
  terrain=preparePisteTerrain(terrain,network);
  const stationGround=prepareStationTerrain(terrain,routes,infrastructure);terrain=stationGround.terrain;stationAreas=stationGround.areas;
  routes=getLiftRuns(terrain,runs);route=routes[0];
  scene=new THREE.Scene(); scene.background=new THREE.Color('#cbdce9'); scene.fog=new THREE.Fog('#cbdce9',12000,65000);
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,1,65000);
  renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(renderScale);
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('world').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('pointerdown',e=>{if(mode==='intro')return;lookDrag={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!lookDrag)return;lookYaw-=(e.clientX-lookDrag.x)*.004;lookPitch=clamp(lookPitch-(e.clientY-lookDrag.y)*.003,-.45,.65);lookDrag={x:e.clientX,y:e.clientY};});
  for(const event of ['pointerup','pointercancel'])renderer.domElement.addEventListener(event,()=>{lookDrag=null;});
  hemisphere=new THREE.HemisphereLight('#c2d9ff','#586b8a',1.2);scene.add(hemisphere);
  sun=new THREE.DirectionalLight('#fff3de',3.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:1,far:1400});sun.shadow.bias=-.0002;sun.shadow.normalBias=.06;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
  await addAlpineSky(scene,renderer);
  weather=new MountainWeather(scene,renderer,sun,hemisphere);
  const [canopy,canopyReference]=await Promise.all([new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/crystal-canopy.png`),fetch(`${import.meta.env.BASE_URL}data/crystal-landcover.json`).then(r=>r.json())]);
  const centerE=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,centerN=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  aerialBounds={minX:canopyReference.extent.xmin-centerE,maxX:canopyReference.extent.xmax-centerE,minZ:centerN-canopyReference.extent.ymax,maxZ:centerN-canopyReference.extent.ymin};
  if(terrain.spacing<10)addDetailedGround(scene,terrain,renderer,canopy,canopyReference.extent);else createMountain();
  powder=new PowderSurface(scene,terrain,renderer);
  const [landcover,firTexture,vegetation]=await Promise.all([
    fetch(`${import.meta.env.BASE_URL}data/crystal-landcover.json`).then(r=>{if(!r.ok)throw new Error('林地数据载入失败');return r.json();}),
    new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/snow-fir.png`),
    fetch(`${import.meta.env.BASE_URL}data/crystal-vegetation.json`).then(r=>{if(!r.ok)throw new Error('林冠数据载入失败');return r.json();})
  ]);
  routes.forEach(r=>{r.spawn=liftExitSpawn(terrain,r,infrastructure);});
  treePositions=addForest(scene,terrain,[...mappedRoutes,...routes],landcover,firTexture,vegetation,stationAreas);resortUpdate=addResort(scene,terrain,infrastructure);addStationStructures(scene,terrain,infrastructure,stationAreas);
  addAlpineDetails(scene,terrain,mappedRoutes,stationAreas);
  createAthlete();snowEffects=new SnowEffects(scene,{...terrain,surface:(x,z)=>powder.surface(x,z)});createMapBackground();
  speedRenderer=new SpeedRenderer(renderer,scene,camera);
  aerialImage=new Image();aerialImage.onload=()=>drawMap();aerialImage.src=`${import.meta.env.BASE_URL}data/crystal-aerial.jpg`;
  // Load real far terrain progressively; retain the coarse grid if detailed assets fail.
  fetch(`${import.meta.env.BASE_URL}data/context-dem.json`).then(r=>{if(!r.ok)throw new Error('context DEM');return r.json();}).then(async context=>{
    let coarse=addContextTerrain(scene,context,terrain);
    try{
      const [rainier,contextMap,rainierMap]=await Promise.all([
        fetch(`${import.meta.env.BASE_URL}data/rainier-dem.json`).then(r=>{if(!r.ok)throw new Error('Rainier DEM');return r.json();}),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/context-aerial.jpg`),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/rainier-aerial.jpg`)
      ]);
      addContextTerrain(scene,context,terrain,contextMap,rainier);addRainierTerrain(scene,rainier,terrain,rainierMap);
      scene.remove(coarse);coarse.geometry.dispose();coarse.material.dispose();$('scenery').disabled=false;
    }catch(error){console.warn('Detailed scenery unavailable',error);toast('高清远景暂未载入，已保留基础远山');}
  }).catch(()=>toast('远山数据载入失败，近处地形仍可滑行'));
  renderRouteList();
  selectRoute(route.id);weather.update(0,camera,athlete.position);weather.snowfall.mesh.visible=true;speedRenderer.prepare();weather.snowfall.mesh.visible=false;$('loading').classList.add('hidden'); $('start').disabled=false;
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('visual-qa')){
    const panel=document.createElement('div');Object.assign(panel.style,{position:'fixed',left:'350px',top:'95px',zIndex:40,display:'flex',gap:'6px'});
    for(const [id,label,routeId,fraction] of [['slope','QA：坡面','green-valley',.38],['forest','QA：林间','mr-magoo',.48]]){
      const button=document.createElement('button');button.id=`qa-${id}`;button.textContent=label;
      button.onclick=()=>{selectRoute(routeId);startRun();const p=pointAlongRoute(route,route.length*fraction),next=pointAlongRoute(route,route.length*fraction+20);skier=createSkier(p,next);mode='inspection';updateAthlete(0);updateCamera(0,true);};panel.append(button);
    }
    const play=document.createElement('button');play.id='qa-play';play.textContent='QA：从这里滑';play.onclick=()=>{mode='running';};panel.append(play);const hide=document.createElement('button');hide.id='qa-hide';hide.textContent='QA：隐藏工具';hide.onclick=()=>{panel.hidden=true;panel.style.display='none';};panel.append(hide);document.body.append(panel);
  }
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('station-qa')){
    const button=document.createElement('button');button.id='qa-arrival';button.textContent='QA：从光圈外验证到站';
    Object.assign(button.style,{position:'fixed',left:'36px',bottom:'80px',zIndex:50,padding:'12px',background:'#edf4e1',color:'#183c3c'});
    button.onclick=()=>{startRun();const goal=route.points.at(-1);skier.x=goal.x+23;skier.z=goal.z;skier.vx=-4;skier.vz=0;skier.speed=4;skier.heading=-Math.PI/2;checkpoint=0;updateAthlete(0);updateCamera(0,true);};
    document.body.append(button);
  }

  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('record-demo')){
    const {installDemoCapture}=await import('./capture-demo.js');
    demoCapture=installDemoCapture({canvas:renderer.domElement,skier:()=>skier,route:()=>route,minimap:()=>$('minimap'),
      intro:()=>{selectRoute('green-valley');goIntro();},start:startRun,view:value=>{view=value;},input:value=>{recordedInput=value;},
      aerial:()=>{mapLayer='aerial';$('map-layer').textContent='地形图';drawMap();}});
  }
  requestAnimationFrame(animate);
}

function createMountain(){
  const {width:w,height:h,spacing:s}=terrain;
  const mesh=new THREE.PlaneGeometry((w-1)*s,(h-1)*s,w-1,h-1); mesh.rotateX(-Math.PI/2);
  const pos=mesh.attributes.position, colors=new Float32Array(pos.count*3), white=new THREE.Color('#e8f0eb'), ice=new THREE.Color('#b7ced4'), rock=new THREE.Color('#899e9f');
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i),height=terrain.heights[i],g=terrain.gradient(x,z),slope=Math.hypot(g.x,g.z);
    pos.setY(i,height-baseElevation);
    const color=white.clone().lerp(ice,clamp(slope*.29,0,.6));
    if(slope>1.15) color.lerp(rock,clamp((slope-1.15)*.65,0,.7));
    const variation=Math.sin(x*.024)*Math.sin(z*.019)*.012;
    color.offsetHSL(0,0,variation); color.toArray(colors,i*3);
  }
  mesh.setAttribute('color',new THREE.BufferAttribute(colors,3)); mesh.computeVertexNormals();
  terrain.renderNormals=mesh.attributes.normal.array;
  const mountain=new THREE.Mesh(mesh,createSnowMaterial((w-1)*s,(h-1)*s,renderer));mountain.receiveShadow=true;
  scene.add(mountain);
  // A skirt closes the DEM tile at the horizon without modifying its actual heights.
  const edge=[];
  for(let x=0;x<w;x++)edge.push([x,0]); for(let z=1;z<h;z++)edge.push([w-1,z]);
  for(let x=w-2;x>=0;x--)edge.push([x,h-1]); for(let z=h-2;z>=0;z--)edge.push([0,z]);
  const vertices=[];
  for(let i=0;i<edge.length;i++){
    const a=edge[i],b=edge[(i+1)%edge.length],p=terrain.world(...a),q=terrain.world(...b),ay=yAt(p.x,p.z),by=yAt(q.x,q.z);
    vertices.push(p.x,ay,p.z,q.x,by,q.z,p.x,-400,p.z,q.x,by,q.z,q.x,-400,q.z,p.x,-400,p.z);
  }
  const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));skirt.computeVertexNormals();
  // Surrounding DEM supplies the horizon; keep the skirt below the data boundary.
  scene.add(new THREE.Mesh(skirt,new THREE.MeshStandardMaterial({color:'#a4bcc0',roughness:1,side:THREE.DoubleSide})));
}

function createAthlete(){athlete=createAthleteRig(scene);}

function setRouteMarkers(){
  for(const object of [boundaryPosts,arrivalZone])if(object){scene.remove(object);object.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
  boundaryPosts=addBoundaryPosts(scene,terrain,route);arrivalZone=createArrivalZone(scene,terrain,route);
  if(routeGroup){ scene.remove(routeGroup);routeGroup.userData.signTexture?.dispose();routeGroup.traverse(obj=>{obj.geometry?.dispose();if(obj.material) obj.material.dispose();}); }
  routeGroup=new THREE.Group();
  const curve=new THREE.CatmullRomCurve3(route.points.map(p=>new THREE.Vector3(p.x,yAt(p.x,p.z)+1.5,p.z)),false,'centripetal');
  const pts=curve.getPoints(Math.ceil(route.length/8)).map(p=>new THREE.Vector3(p.x,yAt(p.x,p.z)+1.5,p.z));
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:route.color,dashSize:8,gapSize:10,transparent:true,opacity:.18}));line.computeLineDistances();line.visible=false;routeGroup.add(line);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=160;
  const signContext=signCanvas.getContext('2d');signContext.fillStyle=route.difficulty==='easy'?'#22684b':route.difficulty==='advanced'?'#172a34':'#245d80';signContext.fillRect(0,0,512,160);signContext.strokeStyle='#ffffff';signContext.lineWidth=7;signContext.strokeRect(6,6,500,148);signContext.fillStyle='#ffffff';signContext.font=`bold ${Math.min(48,720/route.name.length)}px sans-serif`;signContext.textAlign='center';signContext.fillText(route.name,256,100);
  const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;
  routeGroup.userData.signTexture=signTexture;
  const markerCount=Math.min(20,Math.max(1,Math.ceil(route.length/80)));
  const markerPoints=curve.getSpacedPoints(markerCount);
  markerPoints.forEach((p,i)=>{
    const next=markerPoints[Math.min(i+1,markerPoints.length-1)],prev=markerPoints[Math.max(i-1,0)];
    const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1;
    const marker={x:p.x+dz/len*9,z:p.z-dx/len*9},y=yAt(marker.x,marker.z);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,2.5,6),new THREE.MeshStandardMaterial({color:'#5e625d'}));pole.position.set(marker.x,y+1.25,marker.z);pole.castShadow=true;routeGroup.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.5),new THREE.MeshStandardMaterial({map:signTexture,side:THREE.DoubleSide,roughness:.8}));flag.position.set(marker.x+.8,y+2.05,marker.z);flag.rotation.y=Math.atan2(-dx,-dz);flag.castShadow=true;routeGroup.add(flag);
  });
  scene.add(routeGroup);
}

const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderRouteList(){
  const visible=filterRoutes(routes,routeFilter,routeQuery);
  $('route-count').textContent=`${visible.length} / ${routes.length} 条`;
  $('routes').innerHTML=visible.length?visible.map(r=>`<button class="route difficulty-${r.difficulty} ${r.id===route.id?'active':''}" data-route="${r.id}" aria-pressed="${r.id===route.id}" style="--route:${r.color}" title="${escapeHTML(r.name)}"><span class="route-dot"></span><span class="route-text"><span class="route-name">${escapeHTML(r.name)}</span><span class="route-sub">${escapeHTML(r.label)}</span></span><span class="route-stat">${(r.length/1000).toFixed(1)} km<small>↓ ${Math.round(r.drop)} m</small></span></button>`).join(''):'<p class="route-empty">没找到这条雪道，换个名称试试。</p>';
}
$('routes').addEventListener('click',event=>{const button=event.target.closest('[data-route]');if(button)selectRoute(button.dataset.route);});
$('route-search').addEventListener('input',event=>{routeQuery=event.target.value;renderRouteList();});
$('route-filters').addEventListener('click',event=>{
  const button=event.target.closest('[data-difficulty]');if(!button)return;routeFilter=button.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',active);});
  renderRouteList();$('routes').scrollTop=0;
});

function selectRoute(id){
  route=routes.find(r=>r.id===id); checkpoint=0;
  document.querySelectorAll('[data-route]').forEach(b=>{const active=b.dataset.route===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('route-selection').textContent=`已选：${route.name} · ${route.lift} 上站 → 下站`;
  $('map-label').textContent=route.name.toUpperCase();$('session-name').textContent=route.name.toUpperCase();
  fitMapToRoute();createMapBackground();setRouteMarkers(); resetPosition(true); updateAthlete(0); updateCamera(1,true); drawMap();
}

function resetPosition(full=false){
  const i=full?0:Math.min(checkpoint,route.points.length-2);
  const spawn=full?route.spawn:route.points[i],ahead=full?pointAlongRoute(route,spawn.distance+25):route.points[i+1];
  if(full)checkpoint=spawn.segment;
  skier=createSkier(spawn,ahead);
  skier.distance=full?0:totalDistance;
  snowEffects.breakTrail();powder.breakTrail();
  if(full){elapsed=0;peakSpeed=0;checkpoint=spawn.segment;totalDistance=0;trailPoints=[];frameSamples=[];frameP95=0;snowEffects.reset();powder.reset();}
  else trailPoints.push({x:skier.x,z:skier.z,break:true});
  powder.update(skier,false,snow);updateAthlete(0); updateCamera(1,true);
  updateUI();
}

function startRun(){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  mode='running';view='follow';lookYaw=lookPitch=0;cameraHeading=null;resetPosition(true);keys.clear();
  $('intro').classList.add('hidden');$('session').classList.remove('hidden');$('touch').classList.add('active');
  $('overview').innerHTML='俯瞰 <kbd>O</kbd>';
  toast('上站缓坡出发 · 按住 Shift 撑杖 · 沿雪道滑到下站光圈');
  if(soundOn) enableAudio();
}

function goIntro(){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  mode='intro'; keys.clear();$('intro').classList.remove('hidden');$('session').classList.add('hidden');$('touch').classList.remove('active');resetPosition(true);
}

function pauseRun(){if(mode!=='running')return; mode='paused';keys.clear();$('pause-dialog').showModal();}
function resumeRun(){ $('pause-dialog').close();if(mode==='paused')mode='running';keys.clear(); }
function finishRun(){
  mode='finished';keys.clear();
  $('result-stats').innerHTML=`<div><strong>${clockFormat(elapsed)}</strong><small>滑行时间</small></div><div><strong>${Math.round(peakSpeed*3.6)}</strong><small>最高速度 KM/H</small></div><div><strong>${(totalDistance/1000).toFixed(2)}</strong><small>滑行里程 KM</small></div>`;
  $('result').showModal();
}

function updatePhysics(dt){
  const previousPosition={x:skier.x,z:skier.z};
  const steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const edge=keys.has('Space')||keys.has('ArrowDown')?1:0;
  const tuck=keys.has('KeyW')||keys.has('ArrowUp')?1:0;
  const pole=keys.has('ShiftLeft')||keys.has('ShiftRight');
  stepSkier(skier,recordedInput||{steer,edge,tuck,pole},terrain,dt,snow);elapsed+=dt;peakSpeed=Math.max(peakSpeed,skier.speed);totalDistance=skier.distance;
  const boundsX=(terrain.width-1)*terrain.spacing/2-20,boundsZ=(terrain.height-1)*terrain.spacing/2-20;
  if(Math.abs(skier.x)>boundsX||Math.abs(skier.z)>boundsZ){resetPosition();toast('已到地形边界，返回检查点');return;}
  const goal=route.points.at(-1);if(Math.hypot(skier.x-goal.x,skier.z-goal.z)<18){finishRun();return;}
  const p=route.points[Math.min(checkpoint+1,route.points.length-1)];
  if(Math.hypot(skier.x-p.x,skier.z-p.z)<(checkpoint===route.points.length-2?18:55)){
    checkpoint++;
    if(checkpoint===route.points.length-1){finishRun();return;}
    toast(`检查点 ${checkpoint} / ${route.points.length-1}`);
  }
  if(skier.speed>2){
    for(const tree of treePositions.nearby?.(skier.x,skier.z)||treePositions){if(hitsTreeTrunk(previousPosition,skier,tree)){resetPosition();toast('撞到树干，已返回检查点');break;}}
  }
}

function updateAthlete(dt){
  const g=terrain.gradient(skier.x,skier.z),fx=Math.sin(skier.heading),fz=Math.cos(skier.heading);
  athlete.position.set(skier.x,yAt(skier.x,skier.z)-.07,skier.z);
  groundNormal.set(-g.x,1,-g.z).normalize();skiForward.set(fx,g.x*fx+g.z*fz,fz).normalize();skiRight.crossVectors(groundNormal,skiForward).normalize();
  skiBasis.makeBasis(skiRight,groundNormal,skiForward);athlete.quaternion.setFromRotationMatrix(skiBasis);
  updateAthletePose(athlete,skier,dt,yAt);
}

function updateCamera(dt,snap=false){
  const p=athlete.position;
  if(sceneryView){
    // A viewpoint on the actual west-facing summit ridge, looking toward the real peak.
    const x=-2010,z=220;targetCamera.set(x,yAt(x,z)+28,z);
    lookTarget.copy(scene.userData.rainierPeak);lookTarget.y-=550;
  }else if(mode==='intro'){
    // View from the valley back toward the ridge. The panel occupies the left third.
    const mid=route.points[Math.floor(route.points.length/2)];
    targetCamera.set(mid.x+780,yAt(mid.x,mid.z)+670,mid.z+680);
    lookTarget.set(mid.x-120,yAt(mid.x,mid.z)+40,mid.z-100);
  }else if(view==='overview'){
    const start=route.points[0],goal=route.points.at(-1),station=Math.hypot(p.x-start.x,p.z-start.z)<150?start:Math.hypot(p.x-goal.x,p.z-goal.z)<150?goal:null;
    if(station){targetCamera.set(station.x+75,yAt(station.x,station.z)+52,station.z+75);lookTarget.set(station.x,yAt(station.x,station.z)+3,station.z);}else{targetCamera.set(p.x+180,p.y+460,p.z+280);lookTarget.copy(p);}
  }else{
    const velocityHeading=skier.speed>2?Math.atan2(skier.vx,skier.vz):skier.heading;
    const skidAngle=Math.atan2(Math.sin(velocityHeading-skier.heading),Math.cos(velocityHeading-skier.heading));
    const desiredHeading=skier.heading+skidAngle*.40;
    if(cameraHeading===null||snap)cameraHeading=desiredHeading;
    cameraHeading+=Math.atan2(Math.sin(desiredHeading-cameraHeading),Math.cos(desiredHeading-cameraHeading))*(snap?1:1-Math.exp(-dt*5));
    forward.set(Math.sin(cameraHeading+lookYaw),0,Math.cos(cameraHeading+lookYaw));
    targetCamera.copy(p).addScaledVector(forward,-10.5-Math.min(skier.speed*.12,4.5));targetCamera.y+=4.5-skier.tuck*.55;
    targetCamera.y=Math.max(targetCamera.y,yAt(targetCamera.x,targetCamera.z)+3);
    lookTarget.copy(p).addScaledVector(forward,8+Math.min(skier.speed*.20,5));lookTarget.y+=1.8+lookPitch*20;
  }
  const a=snap?1:1-Math.exp(-dt*(mode==='intro'?2:7));
  camera.position.lerp(targetCamera,a);displayLook.lerp(lookTarget,a);camera.lookAt(displayLook);if(!sceneryView&&mode!=='intro'&&view==='follow')camera.rotateZ(-skier.turn*skier.edge*.022);
  const fov=sceneryView?46:58+(mode==='intro'?0:Math.min(skier.speed*.28,11)+skier.tuck*2);
  camera.fov=THREE.MathUtils.lerp(camera.fov,fov,a);camera.updateProjectionMatrix();
}

function createMapBackground(){
  mapBackground=document.createElement('canvas');mapBackground.width=280;mapBackground.height=210;
  const ctx=mapBackground.getContext('2d'),im=ctx.createImageData(280,210);
  for(let y=0;y<210;y++)for(let x=0;x<280;x++){
    const p=mapToWorld(x,y),e=terrain.sample(p.x,p.z),g=terrain.gradient(p.x,p.z);
    const light=clamp(.7+(g.x-g.z)*.18,.2,1),contour=(e%40)<3;
    const i=(y*280+x)*4;
    im.data[i]=contour?147:176+light*49;im.data[i+1]=contour?166:190+light*40;im.data[i+2]=contour?154:173+light*43;im.data[i+3]=255;
  }
  ctx.putImageData(im,0,0);
}
const mapBounds={minX:-2300,maxX:1300,minZ:-850,maxZ:1850};
function fitMapToRoute(){
  const xs=route.points.map(p=>p.x),zs=route.points.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const width=Math.max(1700,maxX-minX+450,(maxZ-minZ+450)*4/3),height=width*3/4,cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  Object.assign(mapBounds,{minX:cx-width/2,maxX:cx+width/2,minZ:cz-height/2,maxZ:cz+height/2});
}
function mapPoint(p){return {x:(p.x-mapBounds.minX)/(mapBounds.maxX-mapBounds.minX)*280,y:(p.z-mapBounds.minZ)/(mapBounds.maxZ-mapBounds.minZ)*210};}
function mapToWorld(x,y){return {x:mapBounds.minX+x/280*(mapBounds.maxX-mapBounds.minX),z:mapBounds.minZ+y/210*(mapBounds.maxZ-mapBounds.minZ)};}
function drawMap(){
  const ctx=$('minimap').getContext('2d');ctx.drawImage(mapBackground,0,0);
  if(mapLayer==='aerial'&&aerialImage?.complete&&aerialImage.naturalWidth){
    const fullW=aerialBounds.maxX-aerialBounds.minX,fullH=aerialBounds.maxZ-aerialBounds.minZ;
    ctx.drawImage(aerialImage,(mapBounds.minX-aerialBounds.minX)/fullW*aerialImage.width,(mapBounds.minZ-aerialBounds.minZ)/fullH*aerialImage.height,(mapBounds.maxX-mapBounds.minX)/fullW*aerialImage.width,(mapBounds.maxZ-mapBounds.minZ)/fullH*aerialImage.height,0,0,280,210);
  }
  for(const r of routes){ctx.beginPath();r.points.forEach((p,i)=>{const m=mapPoint(p);i?ctx.lineTo(m.x,m.y):ctx.moveTo(m.x,m.y);});ctx.strokeStyle=r.id===route.id?(mapLayer==='aerial'?'#c3f47d':'#365b49'):(mapLayer==='aerial'?'#9ebdcc':'#94ac8b');ctx.lineWidth=r.id===route.id?2.5:1;ctx.setLineDash(r.id===route.id?[]:[3,3]);ctx.stroke();}
  ctx.setLineDash([]);
  if(trailPoints.length>1){ctx.beginPath();trailPoints.forEach((p,i)=>{const m=mapPoint({x:p.x,z:p.z});i&&!p.break?ctx.lineTo(m.x,m.y):ctx.moveTo(m.x,m.y);});ctx.strokeStyle='#d57f4d';ctx.lineWidth=1.5;ctx.stroke();}
  for(const [index,p] of [route.points[0],route.points.at(-1)].entries()){const m=mapPoint(p);ctx.beginPath();ctx.arc(m.x,m.y,7,0,Math.PI*2);ctx.fillStyle=index?'#e4ac56':'#315b4b';ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 8px sans-serif';ctx.textAlign='center';ctx.fillText(index?'F':'S',m.x,m.y+3);}
  const m=mapPoint(skier);ctx.save();ctx.translate(m.x,m.y);ctx.rotate(-skier.heading);ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(-5,-5);ctx.lineTo(0,-3);ctx.lineTo(5,-5);ctx.closePath();ctx.fillStyle='#dd7446';ctx.strokeStyle='#fff8e9';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();ctx.restore();
}

function updateUI(){
  $('speed').textContent=Math.round(skier.speed*3.6);$('altitude').textContent=Math.round(terrain.sample(skier.x,skier.z));
  const g=terrain.gradient(skier.x,skier.z);$('slope').textContent=Math.round(Math.atan(Math.hypot(g.x,g.z))*180/Math.PI);
  $('timer').textContent=clockFormat(elapsed);$('distance').textContent=`${Math.round(totalDistance)} m`;
  $('stance').textContent=skier.poling>.2?'双杖蹬撑':skier.edge>.5&&skier.speed<.35?'立刃停稳':skier.edge>.5?`压刃${skier.turn<0?'左':'右'}弯 · ${Math.round(skier.edgeAngle*180/Math.PI)}°`:skier.tuck>.5?'收身 · 低风阻':skier.slip>1.5?'侧滑控速':Math.abs(skier.turn)>.15?'平板转向':'直滑';
  if(frameSamples.length>10){const sorted=[...frameSamples].sort((a,b)=>a-b);frameP95=sorted[Math.floor(sorted.length*.95)];frameMax=sorted.at(-1);slowFrames=sorted.filter(x=>x>25).length;}
  $('weather-status').textContent=`${WEATHER_PRESETS[weather.id].label}${weather.progress<1?' · 过渡中':''}`;
  $('performance').textContent=`${Math.round(1/frameTime)} FPS`;$('performance').title=`近180帧：P95 ${frameP95.toFixed(1)} ms · 最大 ${frameMax.toFixed(1)} ms · 超25ms ${slowFrames}帧 · CPU粉雪 ${powderMs.toFixed(2)} ms · 物理 ${physicsMs.toFixed(2)} ms · 渲染 ${renderScale.toFixed(2)}×`;
  const n=nearestOnRoute(skier,route.points);$('progress').style.width=`${clamp(n.progress/n.total*100,0,100)}%`;
  if(mode==='running'){
    if(n.distance>150) $('distance').textContent+=' · 已偏离参考线路';
    const prev=trailPoints.at(-1);
    if(!prev||Math.hypot(prev.x-skier.x,prev.z-skier.z)>3){
      if(trailPoints.length>=6000)trailPoints.shift();
      trailPoints.push({x:skier.x,y:yAt(skier.x,skier.z)+.35,z:skier.z});
    }
  }
  drawMap();
}

function animate(time){
  requestAnimationFrame(animate);const rawDt=(time-lastTime)/1000||0,dt=Math.min(rawDt,.1);lastTime=time;
  demoCapture?.beforeFrame(time);
  if(['running','inspection','intro','scenery'].includes(mode)){frameSamples.push(rawDt*1000);if(frameSamples.length>180)frameSamples.shift();}else frameSamples=[];
  qualityClock+=dt;
  if(qualityClock>3&&frameSamples.length>90){
    qualityClock=0;
    if(frameP95>21.5&&renderScale>.85){renderScale=Math.max(.85,renderScale-.15);renderer.setPixelRatio(renderScale);speedRenderer.setPixelRatio(renderScale);frameSamples=[];}
  }
  frameTime=frameTime*.94+Math.max(dt,.001)*.06;const physicsStart=performance.now();
  if(mode==='running'){
    accumulator+=dt;
    while(accumulator>=fixedStep){if(mode==='running')updatePhysics(fixedStep);accumulator-=fixedStep;}
  }else accumulator=0;
  physicsMs=physicsMs*.9+(performance.now()-physicsStart)*.1;
  const powderStart=performance.now();powder.update(skier,mode==='running',snow);powderMs=performance.now()-powderStart;
  updateAthlete(dt);updateCamera(dt);snowEffects.update(dt,skier,mode==='running',snow,athlete.userData.poleContact);snowEffects.mesh.material.opacity=snow==='soft'?.29:.65;resortUpdate(time/1000);treePositions.updateLOD?.(mode==='intro'?camera.position:skier,time);
  if(arrivalZone){arrivalZone.visible=mode==='running';arrivalZone.children[0].material.opacity=.55+.15*Math.sin(time*.002);}
  weather.update(dt,camera,athlete.position);
  snowEffects.sprayMaterial.color.copy(weather.state.cloud).lerp(weather.state.sun,.2);
  uiClock+=dt;if(uiClock>.1){updateUI();uiClock=0;}
  if(noiseGain)noiseGain.gain.setTargetAtTime(soundOn&&mode==='running'?.006+Math.min(skier.speed/42,1)*.065:0,audio.currentTime,.15);
  speedRenderer.render(skier.speed,mode==='running'&&view==='follow');
  demoCapture?.afterFrame(time);
}

function enableAudio(){
  if(!audio){
    audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),samples=buffer.getChannelData(0),rng=random(89);
    for(let i=0;i<samples.length;i++)samples[i]=(rng()*2-1);
    const noise=audio.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
    noiseGain=audio.createGain();noiseGain.gain.value=0;noise.connect(filter).connect(noiseGain).connect(audio.destination);noise.start();
  }
  audio.resume().catch(()=>toast('浏览器暂时无法播放环境音'));
}

$('start').addEventListener('click',startRun);$('again').addEventListener('click',startRun);$('choose').addEventListener('click',goIntro);$('leave').addEventListener('click',goIntro);
$('pause').addEventListener('click',pauseRun);$('resume').addEventListener('click',resumeRun);$('pause-restart').addEventListener('click',startRun);$('pause-exit').addEventListener('click',goIntro);
$('restart').addEventListener('click',()=>{startRun();toast('已从起点重新开始');});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeRun();});
$('result').addEventListener('cancel',e=>{e.preventDefault();goIntro();});

function toggleScenery(){
  if(!scene?.userData.rainierPeak||document.querySelector('dialog[open]'))return;
  sceneryView=!sceneryView;document.body.classList.toggle('scenery-view',sceneryView);keys.clear();accumulator=0;
  if(sceneryView){sceneryFrom=mode;mode='scenery';}
  else mode=sceneryFrom;
  $('intro').classList.toggle('hidden',mode!=='intro');$('session').classList.toggle('hidden',!['running','paused'].includes(mode));
  $('touch').classList.toggle('active',mode==='running');$('scenery-caption').classList.toggle('hidden',!sceneryView);
  $('scenery').innerHTML=sceneryView?'返回 <kbd>V</kbd>':'观景 <kbd>V</kbd>';$('scenery').setAttribute('aria-pressed',sceneryView);
  updateCamera(0,true);
}
$('scenery').addEventListener('click',toggleScenery);
$('scenery-return').addEventListener('click',toggleScenery);

function openHelp(){pausedFrom=mode;if(mode==='running')mode='help';keys.clear();$('help-dialog').showModal();}
function closeHelp(){ $('help-dialog').close();if(mode==='help')mode=pausedFrom;keys.clear();}
$('help').addEventListener('click',openHelp);document.querySelectorAll('.close-dialog,.close-help').forEach(b=>b.addEventListener('click',closeHelp));
$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('overview').addEventListener('click',()=>{if(mode==='intro'){toast('开始滑行后，可以切换跟随 / 俯瞰镜头');return;}view=view==='follow'?'overview':'follow';$('overview').innerHTML=view==='overview'?'跟随 <kbd>O</kbd>':'俯瞰 <kbd>O</kbd>';});
$('blur').addEventListener('click',()=>{speedRenderer.enabled=!speedRenderer.enabled;$('blur').textContent=speedRenderer.enabled?'速度模糊开':'速度模糊关';$('blur').setAttribute('aria-pressed',speedRenderer.enabled);});
$('map-layer').addEventListener('click',()=>{mapLayer=mapLayer==='terrain'?'aerial':'terrain';$('map-layer').textContent=mapLayer==='terrain'?'航拍图':'地形图';drawMap();});
$('weather').addEventListener('change',event=>{const id=event.target.value;weather.set(id);event.target.blur();$('weather-status').textContent=`${WEATHER_PRESETS[id].label} · 环境过渡中`;toast(`正在转为${WEATHER_PRESETS[id].label}，天空、光照与能见度同步变化`);});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;if(soundOn)enableAudio();$('sound').textContent=soundOn?'声音开':'声音关';$('sound').setAttribute('aria-pressed',soundOn);});
document.querySelectorAll('[data-snow]').forEach(b=>b.addEventListener('click',()=>{snow=b.dataset.snow;document.querySelectorAll('[data-snow]').forEach(el=>el.classList.toggle('selected',el===b));}));
document.querySelectorAll('[data-key]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>keys.delete(b.dataset.key));
});
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(['Space','ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyV'){toggleScenery();return;}
  if(e.code==='KeyC'){lookYaw=lookPitch=0;return;}
  if(e.code==='Escape'&&sceneryView){toggleScenery();return;}
  if(e.code==='Escape'||e.code==='KeyP'){if(mode==='running'){e.preventDefault();pauseRun();}else if(mode==='paused'){e.preventDefault();resumeRun();}return;}
  if(e.code==='KeyH'&&!document.querySelector('dialog[open]')){openHelp();return;}
  if(e.code==='KeyO'&&!document.querySelector('dialog[open]')){$('overview').click();return;}
  if(e.code==='KeyR'&&mode==='running'){resetPosition();toast('已返回最近检查点');return;}
  if(e.code==='KeyN'&&(mode==='running'||mode==='paused'||mode==='finished')){startRun();toast('已从起点重新开始');return;}
  if(mode==='running') keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pauseRun();}});
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);speedRenderer?.resize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').innerHTML=`山体载入失败。${error.message}<br>需要支持 WebGL 的浏览器。<br><button onclick="location.reload()">重新载入</button>`;});
