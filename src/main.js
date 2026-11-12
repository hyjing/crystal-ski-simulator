import * as THREE from 'three';
import './style.css';
import {HeldControls,bindTouchControls} from './controls.js';
import { createTerrain, getRoutes, getLiftRuns, pointAlongRoute, filterRoutes } from './terrain.js';
import { createSkier, nearestOnRoute, clamp } from './physics.js';
import { SnowEffects } from './snow.js';
import { addContextTerrain, addRainierTerrain, addRegionalTerrain, addAlpineSky } from './scenery.js';
import {readGear,saveGear,applyGear,GEAR_PRESETS,SKI_PROFILES} from './wardrobe.js';
import {StructureWorld} from './structure-collision.js';
import {LiftJourney} from './lift-journey.js';
import {createStationLife} from './station-life.js';
import {StationAudio} from './station-audio.js';
import {SlopeAudio} from './slope-audio.js';
import {sampleSlopeConditions} from './slope-conditions.js';
import {chairAtStation} from './lift-station-layout.js';
import {assignTrailMusic,Soundtrack} from './soundtrack.js';
import {RunChallenge,practiceTerrain,practiceBumps,recordRun} from './run-challenges.js';
import {ChallengeRenderer} from './challenge-renderer.js';
import {createLiftPassengers} from './lift-passengers.js';
import {createSkiTraffic} from './traffic.js';
import {safeRecovery,TRAFFIC_PENALTY} from './traffic-brain.js';
import {fallAnimation} from './npc-routines.js';
import {validRegionalGrid} from './regional-scenery.js';
import {flyDrone} from './drone.js';
import {applyMountainIdentity} from './mountain-identity.js';
import {sceneryProfile} from './scenery-profile.js';
import {MOUNTAINS,resolveMountain,mountainAsset} from './mountains.js';
const mountainId=resolveMountain(new URLSearchParams(location.search).get('mountain')),mountain=MOUNTAINS[mountainId];
const isCrystal=mountainId==='crystal';
const asset=name=>`${import.meta.env.BASE_URL}${mountainAsset(mountainId,name)}`;
import {stepAirborne} from './airborne.js';
import {recoverLook,crestView,clearCameraSight,liftOrbit} from './camera-look.js';
import {PowderSurface} from './powder.js';
import {SpeedRenderer} from './postprocessing.js';
import {addForest,addResort,liftExitSpawn} from './resort.js';
import {addDetailedGround} from './ground.js';
import {prepareStationTerrain,addStationStructures,alignLiftServiceStops,addLiftServiceMarkers} from './stations.js';
import {preparePisteTerrain,addBoundaryPosts,createArrivalZone} from './pistes.js';
import {hitsTreeTrunk} from './trees.js';
import {createAthleteRig,updateAthletePose} from './athlete.js';
import {loadHumanoid} from './humanoid.js';
import {MountainWeather,WEATHER_PRESETS} from './environment.js';
import {addAlpineDetails} from './alpine-details.js';

const $ = id => document.getElementById(id);
const keys = new HeldControls();
const soundtrack = new Soundtrack($('soundtrack'), $('music'), import.meta.env.BASE_URL, toast);
let trailMusic;
let terrain, routes, route, skier, renderer, scene, camera, athlete, routeGroup, snow='soft';
let mode='intro', view='follow', elapsed=0, peakSpeed=0, checkpoint=0, totalDistance=0, uiClock=0;
let slopeAudio, slopeConditions, slopeTarget, slopeSampleTime=0, localStation, localChair, previousPractice=false;
let pauseOrigin='running', liftClockRate=1, stationClock=0;
let lastTime=0, accumulator=0, pausedFrom='running', soundOn=false, audio, noiseGain, toastTimeout;
let frameTime=1/60,physicsMs=0;
let powderMs=0,frameSamples=[],frameP95=0,frameMax=0,slowFrames=0;
const touchDevice=matchMedia('(pointer:coarse)').matches;
let renderScale=Math.min(devicePixelRatio,touchDevice?1:1.15),qualityClock=0;
let routeFilter='all',routeQuery='',aerialBounds,stationAreas=[],boundaryPosts,arrivalZone,lookYaw=0,lookPitch=0,lookDistance=0,lookDrag,lookIdle=0,crestCamera=0;
let weather,hemisphere,cameraHeading=null,traffic,liftPassengers,structures,gear=readGear(),gearFrom='intro',gearCamera;

let qaSlow=false;
let demoCapture,recordedInput=null,sceneryFrom='intro',sceneryView=false,droneMode='follow',drone={},droneCamera;
let pendingRecovery=null;
const liftJourney=new LiftJourney();let liftClock=0,stationLife,stationAudio,challenge,challengeRenderer,challengeMode='free';
let hasSatellite=false;
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
  $('mountain').value=mountainId;applyMountainIdentity(document,mountainId);
  if(mountain.referenceMap){$('map-layer').textContent='参考图';document.querySelector('.map-attribution').textContent='© OSM · Mapzen / Canada OGL';document.querySelector('.map-attribution').href='https://github.com/tilezen/joerd/blob/master/docs/attribution.md';document.querySelector('.data-note>span:last-child').textContent='缆车上站到下站 / OSM 林区参考 / 局部粉雪形变';}
  const response=await fetch(asset('dem.json'));
  if(!response.ok) throw new Error('无法载入高程数据，请刷新重试。');
  terrain=createTerrain(await response.json());
  if(!mountain.area)try{
    const detail=await fetch(asset('detail-dem.json')).then(r=>{if(!r.ok)throw new Error('detail metadata');return r.json();});
    const bytes=await fetch(`${import.meta.env.BASE_URL}data/${detail.data}`).then(r=>{if(!r.ok)throw new Error('detail heights');return r.arrayBuffer();});
    const heights=new Float32Array(bytes);if(heights.length!==detail.width*detail.height)throw new Error('detail size');
    terrain=createTerrain({...detail,heights});
  }catch(error){console.warn('Detailed ground unavailable, using base DEM',error);}
  if(mountain.area)terrain.treeMinElevation=0;terrain.sceneryProfile=sceneryProfile(mountainId);
  const trailResponse=await fetch(asset('trails.json'));
  if(!trailResponse.ok)throw new Error('无法载入雪道数据');
  const mappedRoutes=getRoutes(terrain,await trailResponse.json());
  const runs=await fetch(asset('lift-runs.json')).then(r=>{if(!r.ok)throw new Error('缆车线路载入失败');return r.json();});
  routes=getLiftRuns(terrain,runs);
  const [infrastructure,network]=await Promise.all([
    fetch(asset('infrastructure.json')).then(r=>r.json()),
    fetch(asset('trail-network.json')).then(r=>r.json())]);
  terrain=preparePisteTerrain(terrain,network);
  const stationGround=prepareStationTerrain(terrain,routes,infrastructure);terrain=practiceTerrain(stationGround.terrain);stationAreas=stationGround.areas;
  routes=getLiftRuns(terrain,runs);route=routes[0];
  trailMusic=assignTrailMusic(mountainId,routes.map(r=>r.id));
  $('terrain-resolution').textContent=`真实 ${mountain.elevationLabel||'USGS'} 高程 · 约 ${Math.round(terrain.spacing)}m 导出采样`;
  scene=new THREE.Scene();scene.userData.sceneryProfile=sceneryProfile(mountainId); scene.background=new THREE.Color('#cbdce9'); scene.fog=new THREE.Fog('#cbdce9',12000,65000);
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,1,65000);
  renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(renderScale);
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('world').appendChild(renderer.domElement);
  renderer.domElement.addEventListener('pointerdown',e=>{if(mode==='intro')return;lookIdle=0;if(lookDrag)return;lookDrag={x:e.clientX,y:e.clientY,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!lookDrag||lookDrag.id!==e.pointerId)return;lookIdle=0;if(sceneryView&&droneMode==='free'){drone.yaw-=(e.clientX-lookDrag.x)*.004;drone.pitch=clamp(drone.pitch-(e.clientY-lookDrag.y)*.003,-1.25,1.25);}else{lookYaw-=(e.clientX-lookDrag.x)*.004;lookPitch=clamp(lookPitch-(e.clientY-lookDrag.y)*.003,-.45,.65);}lookDrag={x:e.clientX,y:e.clientY,id:e.pointerId};});
  renderer.domElement.addEventListener('wheel',e=>{if(mode==='intro')return;e.preventDefault();lookDistance=clamp(lookDistance+e.deltaY*.007,-8.5,8);},{passive:false});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,e=>{if(lookDrag?.id===e.pointerId){lookDrag=null;lookIdle=0;}});
  hemisphere=new THREE.HemisphereLight('#c2d9ff','#586b8a',1.2);scene.add(hemisphere);
  sun=new THREE.DirectionalLight('#fff3de',3.1);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?2048:3072,touchDevice?2048:3072);
  Object.assign(sun.shadow.camera,{left:-240,right:240,top:240,bottom:-240,near:1,far:1400});sun.shadow.bias=-.0002;sun.shadow.normalBias=.06;sun.shadow.camera.updateProjectionMatrix();scene.add(sun,sun.target);
  await addAlpineSky(scene,renderer);
  weather=new MountainWeather(scene,renderer,sun,hemisphere);
  const [canopy,canopyReference,satellite]=await Promise.all([new THREE.TextureLoader().loadAsync(asset('canopy.png')),fetch(asset('landcover.json')).then(r=>r.json()),mountain.pack==='whistler'?new THREE.TextureLoader().loadAsync(asset('satellite.jpg')).catch(error=>{console.warn('Satellite surface unavailable',error);return null;}):null]);
  hasSatellite=!!satellite;if(hasSatellite){$('imagery-credit').classList.remove('hidden');$('map-layer').textContent='卫星图';}
  const centerE=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,centerN=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
  aerialBounds={minX:canopyReference.extent.xmin-centerE,maxX:canopyReference.extent.xmax-centerE,minZ:centerN-canopyReference.extent.ymax,maxZ:centerN-canopyReference.extent.ymin};
  addDetailedGround(scene,terrain,renderer,canopy,canopyReference.extent,satellite);
  powder=new PowderSurface(scene,terrain,renderer);
  const [landcover,firTexture,vegetation]=await Promise.all([
    fetch(asset('landcover.json')).then(r=>{if(!r.ok)throw new Error('林地数据载入失败');return r.json();}),
    new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/snow-fir.png`),
    fetch(asset('vegetation.json')).then(r=>{if(!r.ok)throw new Error('林冠数据载入失败');return r.json();})
  ]);
  routes.forEach(r=>{r.spawn=liftExitSpawn(terrain,r,infrastructure);});
  treePositions=addForest(scene,terrain,[...mappedRoutes,...routes],landcover,firTexture,vegetation,stationAreas);resortUpdate=addResort(scene,terrain,infrastructure,stationAreas);addStationStructures(scene,terrain,infrastructure,stationAreas,resortUpdate.serviceStops);
  structures=new StructureWorld(scene);
  const terminals=scene.userData.liftTerminals||[];
  alignLiftServiceStops(terminals,resortUpdate.allCarriers,routes,liftWalkClear);
  addLiftServiceMarkers(scene,terrain,terminals);
  powder.setStationStops(terminals.flatMap(terminal=>terminal.service?[terminal.service]:[]));
  challengeRenderer=new ChallengeRenderer(scene,terrain);
  addAlpineDetails(scene,terrain,mappedRoutes,stationAreas);
  await createAthlete();snowEffects=new SnowEffects(scene,isCrystal?terrain:{...terrain,surface:(x,z)=>powder.surface(x,z)});
  if(isCrystal)snowEffects.spraySurface=(x,z)=>powder.surface(x,z);
  createMapBackground();
  speedRenderer=new SpeedRenderer(renderer,scene,camera);
  aerialImage=new Image();aerialImage.onload=()=>drawMap();aerialImage.src=asset(hasSatellite?'satellite.jpg':'aerial.jpg');
  // Load real far terrain progressively; retain the coarse grid if detailed assets fail.
  fetch(`${import.meta.env.BASE_URL}${mountain.context||(mountain.area?'data/snoqualmie/context/dem.json':'data/context-dem.json')}`).then(r=>{if(!r.ok)throw new Error('context DEM');return r.json();}).then(async context=>{
    let coarse=addContextTerrain(scene,context,terrain);
    if(mountain.pack==='whistler'){
      try{const [map,grid,regionalMap]=await Promise.all([new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/whistler/context/satellite.jpg`),fetch(`${import.meta.env.BASE_URL}data/scenery/whistler/dem.json`).then(r=>{if(!r.ok)throw new Error('Coast Mountains terrain');return r.json();}),new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/scenery/whistler/aerial.jpg`)]);
        if(!validRegionalGrid(grid,context))throw new Error('Whistler regional registration');addContextTerrain(scene,context,terrain,map,undefined,grid);addRegionalTerrain(scene,grid,context,terrain,regionalMap);$('imagery-credit').classList.remove('hidden');scene.remove(coarse);coarse.geometry.dispose();coarse.material.dispose();weather.prepareMaterials();
      }catch(error){console.warn('Whistler detailed scenery unavailable; retaining base ridges',error);}return;
    }
    const regionRoot=`${import.meta.env.BASE_URL}data/scenery/${mountain.area?'snoqualmie':'crystal'}/`;
    const regionAssets=async()=>{try{const [grid,map]=await Promise.all([fetch(regionRoot+'dem.json').then(r=>{if(!r.ok)throw new Error('regional DEM');return r.json();}),new THREE.TextureLoader().loadAsync(regionRoot+'aerial.jpg?v=regional-1')]);if(!validRegionalGrid(grid,context)){map.dispose();throw new Error('regional registration');}map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return{grid,map};}catch(error){console.warn('Regional scenery unavailable; retaining background',error);return null;}};
    if(mountain.area){try{const [map,region]=await Promise.all([new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/snoqualmie/context/aerial.jpg`),regionAssets()]);addContextTerrain(scene,context,terrain,map,undefined,region?.grid);if(region)addRegionalTerrain(scene,region.grid,context,terrain,region.map);scene.remove(coarse);coarse.geometry.dispose();coarse.material.dispose();weather.prepareMaterials();}catch(error){console.warn('Context imagery unavailable',error);}return;}

    try{
      const [rainier,contextMap,rainierMap,region]=await Promise.all([
        fetch(`${import.meta.env.BASE_URL}data/rainier-dem.json`).then(r=>{if(!r.ok)throw new Error('Rainier DEM');return r.json();}),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/context-aerial.jpg`),
        new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}data/rainier-aerial.jpg`),
        regionAssets()
      ]);
      addContextTerrain(scene,context,terrain,contextMap,rainier,region?.grid);if(region)addRegionalTerrain(scene,region.grid,context,terrain,region.map);addRainierTerrain(scene,rainier,terrain,rainierMap);weather.prepareMaterials();
      scene.remove(coarse);coarse.geometry.dispose();coarse.material.dispose();$('scenery').disabled=false;
    }catch(error){console.warn('Detailed scenery unavailable',error);toast('高清远景暂未载入，已保留基础远山');}
  }).catch(()=>toast('远山数据载入失败，近处地形仍可滑行'));
  createSkiTraffic(scene,{...terrain,surface:(x,z)=>powder.surface(x,z)},{stationAreas,infrastructure,crystal:isCrystal,
    clearSite:isCrystal?p=>!structures.blocked(p.x,p.z,terrain.surface(p.x,p.z))&&!(treePositions.nearby?.(p.x,p.z)||[]).some(t=>Math.hypot(t.x-p.x,t.z-p.z)<1.3):undefined,
    onStructuresChanged:()=>structures.rebuild()}).then(t=>{traffic=t;traffic.reset(route,skier,routes);weather.prepareMaterials();}).catch(error=>console.warn('Other skiers unavailable',error));
  createStationLife(scene,scene.userData.liftTerminals||[],(x,z)=>terrain.surface(x,z),isCrystal).then(s=>{stationLife=s;weather.prepareMaterials();}).catch(error=>console.warn('Station staff unavailable',error));
  createLiftPassengers(scene,resortUpdate).then(p=>{liftPassengers=p;p.select(route.liftId);weather.prepareMaterials();}).catch(error=>console.warn('Lift riders unavailable',error));
  renderRouteList();
  selectRoute(routes.find(r=>r.id===new URLSearchParams(location.search).get('route'))?.id||route.id);weather.update(0,camera,athlete.position);weather.snowfall.mesh.visible=true;speedRenderer.prepare();weather.snowfall.mesh.visible=false;$('loading').classList.add('hidden'); $('start').disabled=false;
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('visual-qa')){
    const panel=document.createElement('div');Object.assign(panel.style,{position:'fixed',left:'350px',top:'95px',zIndex:40,display:'flex',gap:'6px'});
    for(const [id,label,routeId,fraction] of [['slope','QA：坡面','green-valley',.38],['forest','QA：林间','mr-magoo',.48],['queens','QA：Queens','queens-run',.30],['hop','QA：跳跃','queens-run',.25]]){
      const button=document.createElement('button');button.id=`qa-${id}`;button.textContent=label;
      button.onclick=()=>{selectRoute(routes.some(r=>r.id===routeId)?routeId:routes[0].id);startRun();const p=pointAlongRoute(route,route.length*fraction),next=pointAlongRoute(route,route.length*fraction+20);skier=createSkier(p,next);skier.skiSidecut=SKI_PROFILES[gear.board].sidecut;if(id==='hop'){skier.vx=Math.sin(skier.heading)*12;skier.vz=Math.cos(skier.heading)*12;skier.speed=12;}traffic?.reset(route,skier,routes);mode='inspection';updateAthlete(0);updateCamera(0,true);};panel.append(button);
    }
    const collision=document.createElement('button');collision.id='qa-collision';collision.textContent='QA：碰撞';collision.onclick=()=>{if(!traffic){toast('等待雪友载入');return;}const s=traffic.states[0],p=s.point;skier=createSkier({x:p.x-Math.sin(p.heading)*.5,z:p.z-Math.cos(p.heading)*.5},p);skier.vx=Math.sin(skier.heading)*8;skier.vz=Math.cos(skier.heading)*8;skier.speed=8;skier.skiSidecut=SKI_PROFILES[gear.board].sidecut;skier.trafficGrace=0;mode='inspection';updateAthlete(0);updateCamera(0,true);};panel.append(collision);
    const slow=document.createElement('button');slow.id='qa-slow';slow.textContent='QA：¼ 速度';slow.onclick=()=>{qaSlow=!qaSlow;slow.textContent=qaSlow?'QA：恢复速度':'QA：¼ 速度';};panel.append(slow);
    const play=document.createElement('button');play.id='qa-play';play.textContent='QA：从这里滑';play.onclick=()=>{mode='running';};panel.append(play);const freeze=document.createElement('button');freeze.id='qa-freeze';freeze.textContent='QA：冻结当前动作';freeze.onclick=()=>{mode='inspection';keys.clear();};panel.append(freeze);const hide=document.createElement('button');hide.id='qa-hide';hide.textContent='QA：隐藏工具';hide.onclick=()=>{panel.hidden=true;panel.style.display='none';};panel.append(hide);document.body.append(panel);
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
      mountain:()=>mountain,weather:id=>weather.set(id),
      stage:()=>{startRun();const candidates=[.35,.45,.55,.25,.65].map(f=>pointAlongRoute(route,route.length*f)),p=candidates.find(p=>{const g=terrain.gradient(p.x,p.z);return Math.hypot(g.x,g.z)>.12&&Math.hypot(g.x,g.z)<.6&&!structures.blocked(p.x,p.z,terrain.surface(p.x,p.z))&&!(treePositions.nearby?.(p.x,p.z)||[]).some(t=>Math.hypot(t.x-p.x,t.z-p.z)<3);})||candidates[0],next=pointAlongRoute(route,nearestOnRoute(p,route.points).progress+15);skier=createSkier(p,next);skier.vx=Math.sin(skier.heading)*10;skier.vz=Math.cos(skier.heading)*10;skier.speed=10;skier.trafficGrace=60;skier.skiSidecut=SKI_PROFILES[gear.board].sidecut;traffic?.reset(route,skier,routes);mode='inspection';updateAthlete(0);updateCamera(0,true);},
      start:()=>{mode='running';},stop:()=>{mode='inspection';},view:value=>{view=value;},input:value=>{recordedInput=value;},
      aerial:()=>{mapLayer='aerial';$('map-layer').textContent='地形图';drawMap();}});
  }
  requestAnimationFrame(animate);
}

async function createAthlete(){athlete=createAthleteRig(scene);await loadHumanoid(athlete);applyGear(athlete,gear);$('equipment').disabled=false;$('scenery').disabled=false;}

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
  liftJourney.cancel();route=routes.find(r=>r.id===id);soundtrack.select(trailMusic.get(id));liftPassengers?.select(route.liftId); checkpoint=0;
  document.querySelectorAll('[data-route]').forEach(b=>{const active=b.dataset.route===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('route-selection').textContent=`已选：${route.name} · ${route.lift} 上站 → ${route.returnLift&&route.returnLift!==route.lift?route.returnLift+' ':''}下站`;
  $('map-label').textContent=route.name.toUpperCase();$('session-name').textContent=route.name.toUpperCase();
  fitMapToRoute();createMapBackground();setRouteMarkers(); resetPosition(true); updateAthlete(0); updateCamera(1,true); drawMap();weather?.prepareMaterials();
}

function resetPosition(full=false){
  if(full){
    liftJourney.cancel();terrain.setPractice([]);
    const features=challengeMode==='freestyle'?practiceBumps(route,terrain,p=>structures?.blocked(p.x,p.z,terrain.surface(p.x,p.z))||(treePositions.nearby?.(p.x,p.z)||[]).some(t=>Math.hypot(t.x-p.x,t.z-p.z)<7)):[];
    terrain.setPractice(features);powder?.setPractice(features);challenge=new RunChallenge(route,challengeMode);challengeRenderer?.configure(challenge,features);
  }
  const i=full?0:Math.min(checkpoint,route.points.length-2);
  const spawn=full?route.spawn:route.points[i],ahead=full?pointAlongRoute(route,spawn.distance+25):route.points[i+1];
  if(full)checkpoint=spawn.segment;
  pendingRecovery=null;const retainedScore=skier?.freestyleScore||0,collisionCount=skier?.collisionCount||0;
  skier=createSkier(spawn,ahead);skier.freestyleScore=full?0:retainedScore;skier.collisionCount=full?0:collisionCount;skier.trafficGrace=3;skier.skiSidecut=SKI_PROFILES[gear.board].sidecut;if(full&&(!isCrystal||traffic?.route!==route))traffic?.reset(route,skier,routes);
  skier.distance=full?0:totalDistance;
  snowEffects.breakTrail();powder.breakTrail();
  if(full){elapsed=0;peakSpeed=0;checkpoint=spawn.segment;totalDistance=0;trailPoints=[];frameSamples=[];frameP95=0;
    const practice=challengeMode==='freestyle';
    if(!isCrystal||practice||previousPractice){snowEffects.reset();powder.reset();}
    previousPractice=practice;
    slopeConditions=slopeTarget=undefined;slopeSampleTime=0;
  }
  else trailPoints.push({x:skier.x,z:skier.z,break:true});
  powder.update(skier,false,snow);updateAthlete(0); updateCamera(1,true);
  updateUI();
}

function startRun(reset=true){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  mode='running';view='follow';lookYaw=lookPitch=lookDistance=lookIdle=0;cameraHeading=null;if(reset!==false)resetPosition(true);keys.clear();
  $('intro').classList.add('hidden');$('session').classList.remove('hidden');$('touch').classList.add('active');
  $('overview').innerHTML='俯瞰 <kbd>O</kbd>';
  document.body.classList.remove('mobile-menu-open');$('mobile-menu').setAttribute('aria-expanded','false');
  toast(touchDevice?'长按左侧转弯 · 右侧撑杖起步 · 拖动场景环视':'上站缓坡出发 · 按住 Shift 撑杖 · 沿雪道滑到下站光圈');
  if(soundOn) enableAudio();
  soundtrack.refresh();
}

function goIntro(){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  mode='intro'; keys.clear();$('intro').classList.remove('hidden');$('session').classList.add('hidden');$('touch').classList.remove('active');resetPosition(true);
}

function pauseRun(){
  if(mode!=='running'&&mode!=='lift')return;
  pauseOrigin=mode;
  if(pauseOrigin==='lift')liftJourney.pause();
  mode='paused';
  keys.clear();
  $('resume').textContent=pauseOrigin==='lift'?'继续乘缆车 ↗':'继续滑行 ↗';
  $('pause-dialog').showModal();
}
function resumeRun(){
  $('pause-dialog').close();
  if(mode==='paused'){
    mode=pauseOrigin;
    if(mode==='lift')liftJourney.resume();
  }
  keys.clear();
}
function liftView(){return mode==='lift'||(mode==='paused'&&pauseOrigin==='lift');}
function finishRun(){
  mode='finished';keys.clear();skier.vx=skier.vz=skier.speed=0;
  $('result-stats').innerHTML=`<div><strong>${clockFormat(elapsed)}</strong><small>滑行时间</small></div><div><strong>${Math.round(peakSpeed*3.6)}</strong><small>最高速度 KM/H</small></div><div><strong>${(totalDistance/1000).toFixed(2)}</strong><small>滑行里程 KM</small></div><div><strong>${skier.freestyleScore||0}</strong><small>特技分数</small></div>`;
  if(challenge&&challenge.mode!=='free'){
    const r=challenge.result(),best=r.complete&&['time','turns'].includes(challenge.mode)?recordRun(localStorage,`ski-best:${mountainId}:${route.id}:${challenge.mode}`,r.time):null;
    $('challenge-result').textContent=challenge.mode==='freestyle'?`花式练习 · ${skier.freestyleScore||0} 分`:`${r.complete?'全部门点完成':'漏门 '+r.missed+' 个'} · ${r.time.toFixed(1)} 秒（罚时 ${r.penalty} 秒）${best?' · 本机最佳 '+best.toFixed(1)+' 秒':''}`;
  }else $('challenge-result').textContent='';
  $('lift-route-note').textContent=boardingTarget()?'椅子靠站后自动上车，行程可跳过。':'此下站需要换乘，衔接线路尚未制作；可以直接重新开始。';$('board-result').disabled=!boardingTarget();$('board-result').title=boardingTarget()?'':'此下站需要换乘，尚无衔接线路，可直接重新开始';$('result').showModal();
}

function updatePhysics(dt){
  const previousPosition={x:skier.x,z:skier.z,y:(skier.airborne?skier.airY:terrain.surface(skier.x,skier.z))-1200};
  skier.trafficGrace=Math.max(0,(skier.trafficGrace||0)-dt);
  traffic?.step(dt,skier,gear.npcs,(x,z)=>treePositions.nearby?.(x,z)||[]);
  const steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const edge=keys.has('Space')||keys.has('ArrowDown')?1:0;
  const tuck=keys.has('KeyW')||keys.has('ArrowUp')?1:0;
  const pole=keys.has('ShiftLeft')||keys.has('ShiftRight');
  stepAirborne(skier,recordedInput||{steer,edge,tuck,pole,jump:keys.has('KeyJ'),spin:(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0),grab:keys.has('KeyF')},terrain,dt,snow);
  if(pendingRecovery&&!skier.crashRemaining){
    const score=skier.freestyleScore,distance=skier.distance,count=skier.collisionCount,p=pendingRecovery;
    skier=createSkier(p,{x:p.x+Math.sin(p.heading)*5,z:p.z+Math.cos(p.heading)*5});Object.assign(skier,{freestyleScore:score,distance,collisionCount:count,trafficGrace:3,skiSidecut:SKI_PROFILES[gear.board].sidecut});pendingRecovery=null;Object.assign(previousPosition,{x:skier.x,z:skier.z,y:terrain.surface(skier.x,skier.z)-1200});snowEffects.breakTrail();powder.breakTrail();keys.clear();toast('已在附近安全位置站起 · Shift 撑杖继续');
  }
  if(!skier.crashRemaining&&!pendingRecovery){const contact=structures?.resolve(previousPosition,skier,terrain);if(contact&&contact.impact>4.5){pendingRecovery=safeRecovery(route,skier,terrain,(x,z)=>structures.blocked(x,z,terrain.surface(x,z))||(treePositions.nearby?.(x,z)||[]).some(t=>Math.hypot(t.x-x,t.z-z)<3));skier.airborne=false;skier.crashReason='structure';skier.crashRemaining=skier.crashDuration=3.2;skier.vx=skier.vz=skier.speed=0;keys.clear();snowEffects.breakTrail();powder.breakTrail();toast(`撞到${contact.collider.label||'设施'} · 稍后在附近重新站起`);}}
  if(traffic&&traffic.collide(previousPosition,skier)!==null&&!pendingRecovery){
    pendingRecovery=safeRecovery(route,skier,terrain,(x,z)=>(treePositions.nearby?.(x,z)||[]).some(t=>Math.hypot(t.x-x,t.z-z)<3)||traffic.states.some(s=>s.point&&!s.indoor&&Math.hypot(s.point.x-x,s.point.z-z)<5)||structures?.blocked(x,z,terrain.surface(x,z)));
    skier.freestyleScore=(skier.freestyleScore||0)-TRAFFIC_PENALTY;skier.collisionCount=(skier.collisionCount||0)+1;skier.airborne=false;skier.crashReason='traffic';skier.crashRemaining=3.2;skier.crashDuration=3.2;skier.vx=skier.vz=skier.speed=0;keys.clear();snowEffects.breakTrail();powder.breakTrail();toast(`碰撞雪友 −${TRAFFIC_PENALTY} 分 · 稍后在附近重新站起`);
  }
  if(skier.airEvent?.type==='takeoff'||skier.airEvent?.type==='land'||skier.airEvent?.type==='crash'){snowEffects.breakTrail();powder.breakTrail();}
  if(skier.airEvent?.type==='land'&&skier.airEvent.points&&!pendingRecovery)toast(`平稳落地 +${skier.airEvent.points}${skier.airEvent.rotation?' · '+skier.airEvent.rotation+'°':''}${skier.airEvent.grab?' · 抓板':''}`);
  if(skier.airEvent?.type==='jump-blocked')toast('起跳需要至少 18 km/h · 先撑杖或顺坡加速');
  if(skier.airEvent?.type==='land'&&skier.airEvent.quality==='recover')toast('落地稍偏 · 屈膝缓冲、搓雪恢复');
  if(skier.airEvent?.type==='crash'){const reasons={impact:'触地冲击过大',crossed:'高速横板落地',combined:'横板与冲击叠加',rotation:'空中旋转尚未收住'};toast(`落地摔倒：${reasons[skier.airEvent.reason]||'失去支撑'} · 正在起身`);}elapsed+=dt;peakSpeed=Math.max(peakSpeed,skier.speed);totalDistance=skier.distance;
  challenge?.step(previousPosition,skier,dt);challengeRenderer?.update(challenge);
  const boundsX=(terrain.width-1)*terrain.spacing/2-20,boundsZ=(terrain.height-1)*terrain.spacing/2-20;
  if(Math.abs(skier.x)>boundsX||Math.abs(skier.z)>boundsZ){resetPosition();toast('已到地形边界，返回检查点');return;}
  const goal=route.points.at(-1);if(!skier.airborne&&!skier.crashRemaining&&Math.hypot(skier.x-goal.x,skier.z-goal.z)<18){finishRun();return;}
  const p=route.points[Math.min(checkpoint+1,route.points.length-1)];
  if(!skier.airborne&&!skier.crashRemaining&&Math.hypot(skier.x-p.x,skier.z-p.z)<(checkpoint===route.points.length-2?18:55)){
    checkpoint++;
    if(checkpoint===route.points.length-1){finishRun();return;}
    toast(`检查点 ${checkpoint} / ${route.points.length-1}`);
  }
  if(skier.speed>2){
    for(const tree of treePositions.nearby?.(skier.x,skier.z)||treePositions){if(hitsTreeTrunk(previousPosition,skier,tree)){resetPosition();toast('撞到树干，已返回检查点');break;}}
  }
}

function boardingTarget(){
  const terminals=scene?.userData.liftTerminals||[],id=String(route.returnLiftId||route.liftId),lower=terminals.find(s=>s.role==='lower'&&s.liftId===id),upper=terminals.find(s=>s.role==='upper'&&s.liftId===id),destination=routes.find(r=>String(r.liftId)===id&&r.id===route.id)||routes.find(r=>String(r.liftId)===id);
  return lower?.service&&upper?.service&&destination&&Math.hypot(skier.x-lower.x,skier.z-lower.z)<75?{lower,upper,destination}:null;
}
function liftWalkClear(point){
  return !structures.blocked(point.x,point.z,terrain.surface(point.x,point.z),false,.14)&&
    !(treePositions.nearby?.(point.x,point.z)||[]).some(tree=>Math.hypot(tree.x-point.x,tree.z-point.z)<(tree.trunkRadius||.25)+.5);
}
function boardLift(){
  const target=boardingTarget();if(!target||!['running','finished'].includes(mode)||skier.speed>3.5||skier.airborne||skier.crashRemaining){toast('请在下站登乘区停稳后乘车');return;}
  if(!liftJourney.begin(target.lower,target.upper,target.destination,{...skier,y:athlete.position.y},liftWalkClear)){
    toast('这里无法进入排队区，请靠近站台入口');return;
  }
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  view='follow';lookYaw=lookPitch=lookDistance=0;crestCamera=0;liftClockRate=1;mode='lift';keys.clear();skier.vx=skier.vz=skier.speed=0;snowEffects.breakTrail();powder.breakTrail();toast('请在栏杆内候车 · 椅子靠站后自动上车');
}
function updateLift(dt){
  if(mode!=='lift'||!liftJourney.active)return;const frame=liftJourney.update(dt,resortUpdate.allCarriers||[],(x,z)=>powder.surface(x,z));
  if(frame){skier.x=frame.x;skier.z=frame.z;skier.heading=frame.heading;skier.vx=skier.vz=skier.speed=0;}
  if(liftJourney.phase==='complete'){const id=liftJourney.route.id;selectRoute(id);startRun(false);toast('已到上站 · 从缓坡继续下一趟');}
}
function updateAthlete(dt){
  for(const arm of athlete.userData.arms)arm.pole.visible=arm.basket.visible=!liftView();
  if(liftView()&&liftJourney.frame){const f=liftJourney.frame;athlete.position.set(f.x,f.y,f.z);athlete.rotation.set(0,f.heading,0);updateAthletePose(athlete,{pedestrian:true,sitAmount:f.sit,ridePose:f.sit,walkAmount:f.stride,walkPhase:f.walkPhase,holding:'ride',speed:0},dt,yAt);return;}
  const g=terrain.gradient(skier.x,skier.z),heading=skier.heading+(skier.airborne?skier.trickYaw||0:0),fx=Math.sin(heading),fz=Math.cos(heading);
  skier.downhillHeading=Math.hypot(g.x,g.z)>.08?Math.atan2(-g.x,-g.z):skier.heading;
  athlete.position.set(skier.x,skier.airborne?skier.airY-1200-.07:yAt(skier.x,skier.z)-.07,skier.z);
  groundNormal.set(skier.airborne?0:-g.x,1,skier.airborne?0:-g.z).normalize();skiForward.set(fx,skier.airborne?0:g.x*fx+g.z*fz,fz).normalize();skiRight.crossVectors(groundNormal,skiForward).normalize();
  skiBasis.makeBasis(skiRight,groundNormal,skiForward);athlete.quaternion.setFromRotationMatrix(skiBasis);
  const fall=fallAnimation(skier.crashRemaining,skier.crashDuration||1.15);skier.fallAmount=fall.amount;skier.fallBrace=fall.brace;skier.fallCrouch=fall.crouch;skier.fallImpact=fall.impact;skier.fallPhase=fall.phase;if(fall.amount)athlete.rotateZ((skier.crashSide||1)*(fall.amount*1.35+fall.impact*.06));
  updateAthletePose(athlete,skier,mode==='running'?dt:0,yAt);
}

function updateCamera(dt,snap=false){
  const p=athlete.position;
  if(!lookDrag&&mode==='running'){lookIdle+=dt;const recovered=recoverLook(lookYaw,lookPitch,lookIdle,dt,true);lookYaw=recovered.yaw;lookPitch=recovered.pitch;}
  if(liftView()){
    const orbit=liftOrbit(p,skier.heading,lookYaw,lookPitch,lookDistance);
    targetCamera.copy(orbit.eye);
    lookTarget.copy(orbit.target);
  }else if(sceneryView){
    if(droneMode==='free'){
      const key=(a,b)=>Number(keys.has(a))-Number(keys.has(b));
      flyDrone(drone,{forward:key('KeyW','KeyS')+key('ArrowUp','ArrowDown'),right:key('KeyD','KeyA')+key('ArrowRight','ArrowLeft'),up:key('KeyE','KeyQ'),fast:keys.has('ShiftLeft')||keys.has('ShiftRight')},scene.userData.droneTerrain||terrain,dt);
      camera.position.set(drone.x,drone.y,drone.z);camera.lookAt(drone.x+Math.sin(drone.yaw)*Math.cos(drone.pitch)*100,drone.y+Math.sin(drone.pitch)*100,drone.z+Math.cos(drone.yaw)*Math.cos(drone.pitch)*100);displayLook.copy(camera.position);camera.fov=58;camera.updateProjectionMatrix();return;
    }
    const heading=skier.speed>1?Math.atan2(skier.vx,skier.vz):skier.heading,angle=heading+lookYaw,distance=clamp(48+lookDistance*3,22,90);
    targetCamera.set(p.x-Math.sin(angle)*distance,p.y+clamp(28+lookPitch*45,10,65),p.z-Math.cos(angle)*distance);targetCamera.y=Math.max(targetCamera.y,yAt(targetCamera.x,targetCamera.z)+8);lookTarget.copy(p);lookTarget.y+=1;
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
    const desiredHeading=skier.airborne||Math.cos(skidAngle)<0?velocityHeading:skier.heading+skidAngle*.40;
    if(cameraHeading===null||snap)cameraHeading=desiredHeading;
    cameraHeading+=Math.atan2(Math.sin(desiredHeading-cameraHeading),Math.cos(desiredHeading-cameraHeading))*(snap?1:1-Math.exp(-dt*5));
    forward.set(Math.sin(cameraHeading+lookYaw),0,Math.cos(cameraHeading+lookYaw));
    const closeZoom=clamp((-lookDistance-3)/5.5,0,1);
    targetCamera.copy(p).addScaledVector(forward,-10.5-Math.min(skier.speed*.12,4.5)*(1-closeZoom)-lookDistance);targetCamera.y+=4.5+Math.min(0,lookDistance)*.32-skier.tuck*.55;
    targetCamera.y=Math.max(targetCamera.y,yAt(targetCamera.x,targetCamera.z)+3-closeZoom*1.8);
    lookTarget.copy(p).addScaledVector(forward,(8+Math.min(skier.speed*.20,5))*clamp((10.5+lookDistance)/10.5,.18,1.5)*(1-closeZoom));lookTarget.y+=1.8-closeZoom*.7+lookPitch*(20-closeZoom*16);
    const crest=crestView(terrain,skier,cameraHeading),allowed=mode!=='equipment'&&!skier.airborne&&Math.abs(Math.atan2(Math.sin(lookYaw),Math.cos(lookYaw)))<.55&&closeZoom<.2;
    crestCamera+=(allowed?crest.factor-crestCamera:-crestCamera)*(snap?1:1-Math.exp(-dt*2.5));
    targetCamera.addScaledVector(forward,-crestCamera*3);targetCamera.y+=crestCamera*5.5;
    const aheadX=p.x+Math.sin(cameraHeading)*crest.ahead,aheadZ=p.z+Math.cos(cameraHeading)*crest.ahead;
    lookTarget.lerp(new THREE.Vector3(aheadX,crest.ground-baseElevation+2+lookPitch*20,aheadZ),crestCamera*.85);
    if(crestCamera>.02)targetCamera.y=Math.max(targetCamera.y,clearCameraSight(terrain,targetCamera,lookTarget));

  }
  const a=snap?1:1-Math.exp(-dt*(mode==='intro'?2:7));
  if(!snap&&!sceneryView&&mode!=='intro'&&view==='follow'){
    // Follow an orbit arc: a straight lerp can pass through the skier on a close 180-degree drag.
    const ox=camera.position.x-p.x,oz=camera.position.z-p.z,tx=targetCamera.x-p.x,tz=targetCamera.z-p.z;
    const oldAngle=Math.atan2(ox,oz),targetAngle=Math.atan2(tx,tz),angle=oldAngle+Math.atan2(Math.sin(targetAngle-oldAngle),Math.cos(targetAngle-oldAngle))*a;
    const radius=Math.max(1.6,THREE.MathUtils.lerp(Math.hypot(ox,oz),Math.hypot(tx,tz),a));
    camera.position.set(p.x+Math.sin(angle)*radius,THREE.MathUtils.lerp(camera.position.y,targetCamera.y,a),p.z+Math.cos(angle)*radius);
    camera.position.y=Math.max(camera.position.y,yAt(camera.position.x,camera.position.z)+3-clamp((-lookDistance-3)/5.5,0,1)*1.8);
  }else camera.position.lerp(targetCamera,a);
  displayLook.lerp(lookTarget,a);
  if(!liftView()&&crestCamera>.05&&!sceneryView&&view==='follow'&&mode!=='intro')camera.position.y=Math.max(camera.position.y,clearCameraSight(terrain,camera.position,displayLook));camera.lookAt(displayLook);if(!liftView()&&!sceneryView&&mode!=='intro'&&view==='follow')camera.rotateZ(-skier.turn*skier.edge*.022);
  const fov=sceneryView?58:58+(mode==='intro'?0:Math.min(skier.speed*.28,11)+skier.tuck*2);
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
  $('speed').textContent=Math.round(skier.speed*3.6);$('altitude').textContent=Math.round(skier.airborne?skier.airY:terrain.sample(skier.x,skier.z));
  const g=terrain.gradient(skier.x,skier.z);$('slope').textContent=Math.round(Math.atan(Math.hypot(g.x,g.z))*180/Math.PI);
  $('challenge-status').textContent=challenge?.label||'';
  const boarding=mode==='running'&&boardingTarget()&&skier.speed<3.5;$('board-lift').hidden=!boarding;$('lift-controls').hidden=!liftView();
  $('lift-status').textContent=({queue:'前往候车位置',approaching:'按指引进入上车位',waiting:'候车 · 请勿越过栏杆',boarding:liftJourney.transferAge?'正在上车':'载具正在靠站 · 请在标线等候',riding:'乘缆车上山 · 拖动环视',dismounting:'到站 · 起身下车',unloading:'正在滑离下车区'})[liftJourney.phase]||'';
  $('timer').textContent=clockFormat(elapsed);$('distance').textContent=`${Math.round(totalDistance)} m`;
  $('stance').textContent=skier.crashRemaining>0?(skier.crashReason==='traffic'?'碰撞倒地':skier.crashReason==='structure'?'撞到设施':'落地失衡'):skier.airborne?`腾空${skier.grab>.3?' · 抓板':''}`:skier.poling>.2?'双杖蹬撑':skier.edge>.5&&skier.speed<.35?'立刃停稳':skier.edge>.5?`${skier.slip>.5||skier.edgeBrake?'横板搓雪':'加强立刃'} · ${Math.round(skier.edgeAngle*180/Math.PI)}°`:skier.tuck>.5?'收身 · 低风阻':skier.slip>1.5?'侧滑控速':Math.abs(skier.turn)>.15?'沿弧转弯':'直滑';
  if(frameSamples.length>10){const sorted=[...frameSamples].sort((a,b)=>a-b);frameP95=sorted[Math.floor(sorted.length*.95)];frameMax=sorted.at(-1);slowFrames=sorted.filter(x=>x>25).length;}
  $('weather-status').textContent=`${WEATHER_PRESETS[weather.id].label}${weather.progress<1?' · 过渡中':''}`;
  $('freestyle').textContent=`特技 ${skier.freestyleScore||0} 分${skier.airborne?' · '+Math.max(0,skier.airY-terrain.surface(skier.x,skier.z)).toFixed(1)+' m 腾空':''}${skier.switchStance?' · Switch':''}${skier.collisionCount?' · 碰撞 '+skier.collisionCount+' 次':''}`;
  $('performance').textContent=`${Math.round(1/frameTime)} FPS`;$('performance').title=`近180帧：P95 ${frameP95.toFixed(1)} ms · 最大 ${frameMax.toFixed(1)} ms · 超25ms ${slowFrames}帧 · CPU雪友 ${(traffic?.lastPoseMs||0).toFixed(2)} ms · CPU粉雪 ${powderMs.toFixed(2)} ms · 物理 ${physicsMs.toFixed(2)} ms · 渲染 ${renderScale.toFixed(2)}×`;
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
  requestAnimationFrame(animate);const rawDt=(time-lastTime)/1000||0,dt=Math.min(rawDt,.1)*(import.meta.env.DEV&&qaSlow?.25:1);lastTime=time;
  demoCapture?.beforeFrame(time);
  const touchActive=(mode==='running'||mode==='drone')&&!document.querySelector('dialog[open]');
  $('touch').classList.toggle('active',touchActive);$('touch').dataset.controlMode=mode==='drone'?'drone':'ski';
  document.body.classList.toggle('playing',!['intro','help','equipment'].includes(mode));
  for(const b of $('touch').querySelectorAll('[data-key]')){b.classList.toggle('pressed',keys.has(b.dataset.key));b.setAttribute('aria-pressed',String(keys.has(b.dataset.key)));}

  if(['running','inspection','intro','scenery'].includes(mode)){frameSamples.push(rawDt*1000);if(frameSamples.length>180)frameSamples.shift();}else frameSamples=[];
  qualityClock+=dt;
  if(qualityClock>3&&frameSamples.length>90){
    qualityClock=0;
    if(frameP95>21.5&&renderScale>.85){renderScale=Math.max(.85,renderScale-.15);renderer.setPixelRatio(renderScale);speedRenderer.setPixelRatio(renderScale);frameSamples=[];}
  }
  frameTime=frameTime*.94+Math.max(Math.min(rawDt,.1),.001)*.06;const physicsStart=performance.now();
  if(mode==='running'){
    accumulator+=dt;
    while(accumulator>=fixedStep){if(mode==='running')updatePhysics(fixedStep);accumulator-=fixedStep;}
  }else accumulator=0;
  physicsMs=physicsMs*.9+(performance.now()-physicsStart)*.1;
  const worldActive=['running','lift','drone','inspection','finished'].includes(mode);
  const storm=worldActive&&isCrystal?dt*weather.state.snow:0;
  if(storm){powder.cover(storm);snowEffects.cover(storm);}
  const trackObserver=mode==='drone'?camera.position:skier;
  const crowdTracks=isCrystal&&gear.npcs&&worldActive&&traffic
    ?snowEffects.recordCrowd(dt,traffic.states,trackObserver):undefined;
  const powderStart=performance.now();
  powder.update(skier,mode==='running'&&!skier.airborne&&!skier.crashRemaining,snow,crowdTracks);
  powderMs=performance.now()-powderStart;
  if(mode!=='paused'){
    stationClock+=dt;
    const rate=mode==='lift'?liftJourney.clockRate():1;
    liftClockRate+=(rate-liftClockRate)*(1-Math.exp(-dt*8));
    liftClock+=dt*liftClockRate;
    resortUpdate(liftClock);
    updateLift(dt);
  }
  if(mode==='lift'){
    const pitchInput=Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'));
    lookPitch=clamp(lookPitch+pitchInput*dt*.8,-.45,.65);
  }
  if(mode==='lift'||(isCrystal&&['drone','inspection','finished'].includes(mode))){
    traffic?.step(dt,{x:1e9,z:1e9},gear.npcs,(x,z)=>treePositions.nearby?.(x,z)||[]);
  }
  if(mode!=='paused')updateAthlete(dt);
  updateCamera(dt);snowEffects.update(dt,skier,mode==='running',snow,athlete.userData.poleContact);snowEffects.mesh.material.opacity=snow==='soft'?.29:.65;liftPassengers?.update(liftClock,camera,gear.npcs);stationLife?.update(stationClock,skier,resortUpdate.allCarriers,gear.npcs,mode==='paused'?0:dt);stationAudio?.update(scene.userData.liftTerminals||[],mode==='drone'?camera.position:skier,soundOn&&worldActive,time/1000,liftJourney.phase==='boarding');
  if(arrivalZone){arrivalZone.visible=mode==='running';arrivalZone.children[0].material.opacity=.55+.15*Math.sin(time*.002);}
  if(mode!=='paused')traffic?.update(0,skier,worldActive&&(isCrystal||mode!=='finished'),gear.npcs,camera,dt);
  updateSlopeExperience(dt,worldActive);
  weather.update(mode==='paused'?0:dt,camera,athlete.position,worldActive||mode==='paused'?slopeConditions:undefined);
  snowEffects.sprayMaterial.color.copy(weather.state.cloud).lerp(weather.state.sun,.2);
  uiClock+=dt;if(uiClock>.1){updateUI();uiClock=0;}
  if(noiseGain)noiseGain.gain.setTargetAtTime(soundOn&&mode==='running'?.006+Math.min(skier.speed/42,1)*.065:0,audio.currentTime,.15);
  speedRenderer.render(skier.speed,mode==='running'&&view==='follow');
  demoCapture?.afterFrame(time);
}

function updateSlopeExperience(dt, active){
  if(!isCrystal)return;
  const listener=mode==='drone'?camera.position:skier;
  slopeSampleTime-=dt;
  if(active&&slopeSampleTime<=0){
    slopeSampleTime=.2;
    slopeTarget=sampleSlopeConditions(terrain,route,listener,(x,z)=>treePositions.nearby?.(x,z)||[],weather.state);
    slopeConditions??={...slopeTarget};
    localStation=null;
    for(const station of scene.userData.liftTerminals||[]){
      const distance=Math.hypot(station.x-listener.x,station.z-listener.z);
      if(distance<65&&(!localStation||distance<localStation.distance))localStation={...station,distance};
    }
    localChair=localStation?chairAtStation(localStation,resortUpdate.allCarriers)?.carrier:null;
  }
  if(active&&slopeTarget){
    const blend=1-Math.exp(-dt*2);
    for(const key of ['shelter','shade','basin','exposure'])slopeConditions[key]+=(slopeTarget[key]-slopeConditions[key])*blend;
  }
  const inStation=localStation?clamp(1-localStation.distance/55,0,1):0;
  soundtrack.mix(active&&soundOn?inStation:0,dt);
  slopeAudio?.update({
    enabled:active&&soundOn,skier,grounded:mode==='running'&&!skier.airborne&&!skier.crashRemaining,
    snow,conditions:slopeConditions,camera,states:gear.npcs?(traffic?.states||[]):[],
    wind:weather.state.wind,station:localStation,carrier:localChair,poleContact:athlete.userData.poleContact,
  });
}

function enableAudio(){
  if(!audio){
    audio=new AudioContext();stationAudio=new StationAudio(audio);
    if(isCrystal)slopeAudio=new SlopeAudio(audio);
    else {
      const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),samples=buffer.getChannelData(0),rng=random(89);
      for(let i=0;i<samples.length;i++)samples[i]=(rng()*2-1);
      const noise=audio.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;
      noiseGain=audio.createGain();noiseGain.gain.value=0;noise.connect(filter).connect(noiseGain).connect(audio.destination);noise.start();
    }
  }
  audio.resume().catch(()=>toast('浏览器暂时无法播放环境音'));
}

function syncGearForm(){for(const k of ['jacket','pants','helmet','skis','board'])$(`gear-${k}`).value=gear[k];$('gear-npcs').checked=gear.npcs;}
function updateGear(){for(const k of ['jacket','pants','helmet','skis','board'])gear[k]=$(`gear-${k}`).value;gear.npcs=$('gear-npcs').checked;applyGear(athlete,gear);if(skier)skier.skiSidecut=SKI_PROFILES[gear.board].sidecut;saveGear(gear);weather?.prepareMaterials();}
function closeGear(){if(!$('gear-dialog').open)return;$('gear-dialog').close();mode=gearFrom;({view,lookYaw,lookPitch,lookDistance}=gearCamera);lookIdle=0;if(mode==='intro')$('intro').classList.remove('hidden');keys.clear();}
$('equipment').addEventListener('click',()=>{if(liftView())return;if(!athlete||document.querySelector('dialog[open]'))return;if(sceneryView)toggleScenery();gearFrom=mode;gearCamera={view,lookYaw,lookPitch,lookDistance};mode='equipment';view='follow';lookYaw=2.6;lookPitch=0;lookDistance=-7.2;keys.clear();$('intro').classList.add('hidden');syncGearForm();updateCamera(1,true);$('gear-dialog').showModal();});
for(const k of ['jacket','pants','helmet','skis','board','npcs'])$(`gear-${k}`).addEventListener('input',updateGear);
for(const b of document.querySelectorAll('[data-gear-view]'))b.addEventListener('click',()=>{lookYaw=Number(b.dataset.gearView);lookPitch=0;});
for(const b of document.querySelectorAll('[data-gear-preset]'))b.addEventListener('click',()=>{gear={...GEAR_PRESETS[b.dataset.gearPreset],npcs:gear.npcs};syncGearForm();updateGear();});
$('gear-close').addEventListener('click',closeGear);$('gear-done').addEventListener('click',closeGear);$('gear-dialog').addEventListener('cancel',e=>{e.preventDefault();closeGear();});
$('mountain').addEventListener('change',e=>{const url=new URL(location.href);url.searchParams.set('mountain',resolveMountain(e.target.value));url.searchParams.delete('visual-qa');url.searchParams.delete('record-demo');location.assign(url.href);});
$('start').addEventListener('click',startRun);$('again').addEventListener('click',startRun);$('choose').addEventListener('click',goIntro);$('leave').addEventListener('click',goIntro);
$('pause').addEventListener('click',pauseRun);$('resume').addEventListener('click',resumeRun);$('pause-restart').addEventListener('click',startRun);$('pause-exit').addEventListener('click',goIntro);
$('restart').addEventListener('click',()=>{startRun();toast('已从起点重新开始');});
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeRun();});
$('result').addEventListener('cancel',e=>{e.preventDefault();goIntro();});

function setDroneMode(next){
  droneMode=next;keys.clear();accumulator=0;
  if(next==='free'){mode='drone';const direction=new THREE.Vector3();camera.getWorldDirection(direction);drone={x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw:Math.atan2(direction.x,direction.z),pitch:Math.asin(clamp(direction.y,-1,1))};}
  else mode=sceneryFrom==='running'?'running':'inspection';
  for(const b of document.querySelectorAll('[data-drone]'))b.setAttribute('aria-pressed',b.dataset.drone===next);
  $('drone-help').textContent=next==='free'?'滑行已暂停 · WASD / 方向键飞行 · Q 降 / E 升 · Shift 加速 · 鼠标拖动看四周':'高位跟拍 · 正常滑雪操作 · 鼠标拖动环绕 / 滚轮调整距离';
}
function toggleScenery(){if(liftView())return;
  if(!athlete||document.querySelector('dialog[open]'))return;
  sceneryView=!sceneryView;document.body.classList.toggle('scenery-view',sceneryView);keys.clear();accumulator=0;
  if(sceneryView){sceneryFrom=mode;droneCamera={view,lookYaw,lookPitch,lookDistance};lookYaw=lookPitch=lookDistance=0;setDroneMode('follow');}
  else{mode=sceneryFrom;({view,lookYaw,lookPitch,lookDistance}=droneCamera);}
  $('intro').classList.toggle('hidden',mode!=='intro');$('session').classList.toggle('hidden',sceneryView||!['running','paused'].includes(mode));
  $('touch').classList.toggle('active',mode==='running');$('scenery-caption').classList.toggle('hidden',!sceneryView);
  $('scenery').innerHTML=sceneryView?'返回滑行 <kbd>V</kbd>':'无人机 <kbd>V</kbd>';$('scenery').setAttribute('aria-pressed',sceneryView);updateCamera(0,true);
}
for(const b of document.querySelectorAll('[data-drone]'))b.addEventListener('click',()=>setDroneMode(b.dataset.drone));
$('scenery').addEventListener('click',toggleScenery);
$('scenery-return').addEventListener('click',toggleScenery);

function openHelp(){if(liftView())return;pausedFrom=mode;if(mode==='running')mode='help';keys.clear();$('help-dialog').showModal();}
function closeHelp(){ $('help-dialog').close();if(mode==='help')mode=pausedFrom;keys.clear();}
$('share').addEventListener('click',async()=>{const url=new URL(import.meta.env.BASE_URL,location.origin);url.searchParams.set('mountain',mountainId);if(route)url.searchParams.set('route',route.id);try{await navigator.clipboard.writeText(url.href);toast('已复制雪场与线路链接 · 发给朋友即可试玩');}catch{$('share-link').value=url.href;$('share-dialog').showModal();$('share-link').select();}});
$('share-close').addEventListener('click',()=>$('share-dialog').close());
$('help').addEventListener('click',openHelp);document.querySelectorAll('.close-dialog,.close-help').forEach(b=>b.addEventListener('click',closeHelp));
$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('overview').addEventListener('click',()=>{if(liftView())return;if(mode==='intro'){toast('开始滑行后，可以切换跟随 / 俯瞰镜头');return;}view=view==='follow'?'overview':'follow';$('overview').innerHTML=view==='overview'?'跟随 <kbd>O</kbd>':'俯瞰 <kbd>O</kbd>';});
$('blur').addEventListener('click',()=>{speedRenderer.enabled=!speedRenderer.enabled;$('blur').textContent=speedRenderer.enabled?'速度模糊开':'速度模糊关';$('blur').setAttribute('aria-pressed',speedRenderer.enabled);});
$('map-layer').addEventListener('click',()=>{mapLayer=mapLayer==='terrain'?'aerial':'terrain';$('map-layer').textContent=mapLayer==='terrain'?(hasSatellite?'卫星图':mountain.referenceMap?'参考图':'航拍图'):'地形图';drawMap();});
$('weather').addEventListener('change',event=>{const id=event.target.value;weather.set(id);event.target.blur();$('weather-status').textContent=`${WEATHER_PRESETS[id].label} · 环境过渡中`;toast(`正在转为${WEATHER_PRESETS[id].label}，天空、光照与能见度同步变化`);});
$('challenge').addEventListener('change',e=>{challengeMode=e.target.value;resetPosition(true);weather?.prepareMaterials();});
$('board-lift').addEventListener('click',boardLift);$('board-result').addEventListener('click',boardLift);
$('skip-lift').addEventListener('click',()=>liftJourney.skip((x,z)=>powder.surface(x,z)));
$('cancel-lift').addEventListener('click',()=>{liftJourney.cancel();goIntro();});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;if(soundOn)enableAudio();$('sound').textContent=soundOn?'声音开':'声音关';$('sound').setAttribute('aria-pressed',soundOn);});
document.querySelectorAll('[data-snow]').forEach(b=>b.addEventListener('click',()=>{snow=b.dataset.snow;document.querySelectorAll('[data-snow]').forEach(el=>el.classList.toggle('selected',el===b));}));
bindTouchControls($('touch'),keys,()=>['running','drone'].includes(mode)&&!document.querySelector('dialog[open]'));
$('touch-recenter').addEventListener('click',()=>{lookYaw=lookPitch=lookDistance=0;});
$('mobile-menu').addEventListener('click',()=>{const open=document.body.classList.toggle('mobile-menu-open');$('mobile-menu').setAttribute('aria-expanded',String(open));});
$('mobile-map').addEventListener('click',()=>{const open=document.body.classList.toggle('mobile-map-open');$('mobile-map').setAttribute('aria-expanded',String(open));});
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
  if(['Space','ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='KeyB'&&!e.repeat){boardLift();return;}
  if(e.code==='KeyV'&&!liftView()){toggleScenery();return;}
  if(e.code==='KeyC'){lookYaw=lookPitch=lookDistance=0;return;}
  if(e.code==='Escape'&&sceneryView){toggleScenery();return;}
  if(e.code==='Escape'||e.code==='KeyP'){if(mode==='running'||mode==='lift'){e.preventDefault();pauseRun();}else if(mode==='paused'){e.preventDefault();resumeRun();}return;}
  if(e.code==='KeyH'&&!document.querySelector('dialog[open]')){openHelp();return;}
  if(e.code==='KeyO'&&!sceneryView&&!document.querySelector('dialog[open]')){$('overview').click();return;}
  if(e.code==='KeyR'&&mode==='running'){resetPosition();toast('已返回最近检查点');return;}
  if(e.code==='KeyN'&&(mode==='running'||mode==='paused'||mode==='finished')){startRun();toast('已从起点重新开始');return;}
  if(mode==='running'||mode==='drone'||mode==='lift') keys.hold(`keyboard:${e.code}`,e.code);
});
addEventListener('keyup',e=>keys.release(`keyboard:${e.code}`));addEventListener('blur',()=>{keys.clear();pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pauseRun();}});
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);speedRenderer?.resize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').innerHTML=`山体载入失败。${escapeHTML(error.message)}<br>需要支持 WebGL 的浏览器。<br><button id="reload-game">重新载入</button>`;$('reload-game').addEventListener('click',()=>location.reload());});
