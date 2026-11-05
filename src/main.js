import * as THREE from 'three';
import './style.css';
import { createTerrain, getRoutes } from './terrain.js';
import { createSkier, stepSkier, nearestOnRoute, clamp } from './physics.js';

const $ = id => document.getElementById(id);
const keys = new Set();
let terrain, routes, route, skier, renderer, scene, camera, athlete, routeGroup, snow='packed';
let mode='intro', view='follow', elapsed=0, peakSpeed=0, checkpoint=0, totalDistance=0, uiClock=0;
let lastTime=0, accumulator=0, pausedFrom='running', soundOn=false, audio, noiseGain, toastTimeout;
let treePositions=[], trailPoints=[], trailLine, trailGeometry, mapBackground;
const drawDistance=3800, baseElevation=1200, fixedStep=1/120;
const forward = new THREE.Vector3(), targetCamera = new THREE.Vector3(), lookTarget = new THREE.Vector3();
const displayLook = new THREE.Vector3();
const clockFormat = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const yAt=(x,z)=>terrain.sample(x,z)-baseElevation;

function toast(text){ $('toast').textContent=text; $('toast').classList.add('show'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),3500); }
function random(seed=42){ return ()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;}; }

async function init(){
  $('start').disabled=true;
  const response=await fetch(`${import.meta.env.BASE_URL}data/crystal-dem.json`);
  if(!response.ok) throw new Error('无法载入高程数据，请刷新重试。');
  terrain=createTerrain(await response.json()); routes=getRoutes(terrain); route=routes[0];
  scene=new THREE.Scene(); scene.background=new THREE.Color('#cbdcde'); scene.fog=new THREE.Fog('#cbdcde',1400,drawDistance+1600);
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,1,12000);
  renderer=new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
  $('world').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#e5f3ff','#637f83',2.5));
  const sun=new THREE.DirectionalLight('#fff6d9',3.2); sun.position.set(-1600,2400,-1600); scene.add(sun);
  createMountain(); createTrees(); createAthlete(); createTrack(); createMapBackground();
  $('routes').innerHTML=routes.map((r,i)=>`<button class="route ${i===0?'active':''}" data-route="${r.id}" aria-pressed="${i===0}" style="--route:${r.color}"><span class="route-dot"></span><span class="route-text"><span class="route-name">${r.name}</span><span class="route-sub">${r.subtitle} · ${r.label}</span></span><span class="route-stat">${(r.length/1000).toFixed(1)} km<small>↓ ${Math.round(r.drop)} m</small></span></button>`).join('');
  document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>selectRoute(b.dataset.route)));
  selectRoute(route.id); $('loading').classList.add('hidden'); $('start').disabled=false;
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
  const mountain=new THREE.Mesh(mesh,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0}));
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
  scene.add(new THREE.Mesh(skirt,new THREE.MeshStandardMaterial({color:'#a4bcc0',roughness:1,side:THREE.DoubleSide})));
}

function createTrees(){
  const rng=random(), candidates=[];
  for(let i=0;i<5200;i++){
    const p=terrain.world(15+rng()*220,60+rng()*210),e=terrain.sample(p.x,p.z),g=terrain.gradient(p.x,p.z);
    if(e>1950||Math.hypot(g.x,g.z)>.85||e<1220)continue;
    if(routes.some(r=>nearestOnRoute(p,r.points).distance<48))continue;
    candidates.push({...p,size:.7+rng()*.9});
  }
  treePositions=candidates;
  const leaves=new THREE.InstancedMesh(new THREE.ConeGeometry(3.8,12,6),new THREE.MeshStandardMaterial({color:'#315b58',roughness:1}),candidates.length*2);
  const caps=new THREE.InstancedMesh(new THREE.ConeGeometry(3.25,8.6,6),new THREE.MeshStandardMaterial({color:'#e0ebe6',roughness:1}),candidates.length*2);
  const dummy=new THREE.Object3D();
  candidates.forEach((p,i)=>{
    const y=yAt(p.x,p.z);
    for(let j=0;j<2;j++){
      dummy.position.set(p.x,y+(6+j*5)*p.size,p.z); dummy.scale.setScalar(p.size*(j? .75:1)); dummy.updateMatrix();leaves.setMatrixAt(i*2+j,dummy.matrix);
      dummy.position.y+=1.9*p.size;dummy.updateMatrix(); caps.setMatrixAt(i*2+j,dummy.matrix);
    }
  });
  scene.add(leaves,caps);
}

function createAthlete(){
  athlete=new THREE.Group(); const body=new THREE.Group(); athlete.add(body); athlete.userData.body=body;
  const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.65});
  const jacket=mat('#dc794c'),pants=mat('#243e43'),helmet=mat('#f2eddb'),skiMat=mat('#203c3d');
  const add=(geometry,material,x,y,z,parent=body)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
  add(new THREE.CapsuleGeometry(.48,.8,4,8),jacket,0,2.35,0);
  add(new THREE.SphereGeometry(.42,12,8),helmet,0,3.35,.06);
  add(new THREE.BoxGeometry(.66,.23,.26),mat('#314d52'),0,3.37,.38);
  for(const sign of [-1,1]){
    const leg=add(new THREE.CapsuleGeometry(.18,.85,3,6),pants,sign*.28,1.12,.08);leg.rotation.x=-.22;
    const arm=add(new THREE.CapsuleGeometry(.14,.75,3,6),jacket,sign*.65,2.25,.18);arm.rotation.z=sign*.3;arm.rotation.x=-.45;
    const pole=add(new THREE.CylinderGeometry(.025,.025,1.95,5),skiMat,sign*.93,1.15,-.15);pole.rotation.x=.35;
    const ski=add(new THREE.BoxGeometry(.23,.10,2.9),skiMat,sign*.32,.22,.25,athlete);
    const tip=add(new THREE.BoxGeometry(.23,.09,.42),mat('#bce879'),sign*.32,.28,1.86,athlete);tip.rotation.x=-.25;
  }
  scene.add(athlete);
}

function createTrack(){
  trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6000*3),3));trailGeometry.setDrawRange(0,0);
  trailLine=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:'#71969b',transparent:true,opacity:.6}));trailLine.frustumCulled=false;scene.add(trailLine);
}

function setRouteMarkers(){
  if(routeGroup){ scene.remove(routeGroup);routeGroup.traverse(obj=>{obj.geometry?.dispose();if(obj.material) obj.material.dispose();}); }
  routeGroup=new THREE.Group();
  const curve=new THREE.CatmullRomCurve3(route.points.map(p=>new THREE.Vector3(p.x,yAt(p.x,p.z)+1.5,p.z)),false,'centripetal');
  const pts=curve.getPoints(Math.ceil(route.length/8)).map(p=>new THREE.Vector3(p.x,yAt(p.x,p.z)+1.5,p.z));
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineDashedMaterial({color:route.color,dashSize:8,gapSize:10,transparent:true,opacity:.7}));line.computeLineDistances();routeGroup.add(line);
  route.points.forEach((p,i)=>{
    const y=yAt(p.x,p.z);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,8,5),new THREE.MeshStandardMaterial({color:'#3e6059'}));pole.position.set(p.x,y+4,p.z);routeGroup.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(6,3),new THREE.MeshBasicMaterial({color:route.color,side:THREE.DoubleSide}));flag.position.set(p.x+3,y+7,p.z);routeGroup.add(flag);
    if(i===route.points.length-1){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(11,.4,6,40),new THREE.MeshBasicMaterial({color:route.color}));ring.position.set(p.x,y+12,p.z);ring.rotation.y=Math.PI/2;routeGroup.add(ring);
    }
  });
  scene.add(routeGroup);
}

function selectRoute(id){
  route=routes.find(r=>r.id===id); checkpoint=0;
  document.querySelectorAll('[data-route]').forEach(b=>{const active=b.dataset.route===id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('map-label').textContent=route.name.toUpperCase();$('session-name').textContent=route.name.toUpperCase();
  setRouteMarkers(); resetPosition(true); updateAthlete(0); updateCamera(1,true); drawMap();
}

function resetPosition(full=false){
  const i=full?0:Math.min(checkpoint,route.points.length-2);
  skier=createSkier(route.points[i],route.points[i+1]);
  skier.distance=full?0:totalDistance;
  if(full){elapsed=0;peakSpeed=0;checkpoint=0;totalDistance=0;trailPoints=[];trailGeometry.setDrawRange(0,0);}
  updateAthlete(0); updateCamera(1,true);
}

function startRun(){
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  mode='running';view='follow';resetPosition(true);keys.clear();
  $('intro').classList.add('hidden');$('session').classList.remove('hidden');$('touch').classList.add('active');
  $('overview').innerHTML='俯瞰 <kbd>O</kbd>';
  toast('A / D 转弯 · 空格刹车 · 跟随荧光路标下山');
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
  const steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const brake=keys.has('Space')||keys.has('ArrowDown')?1:0;
  stepSkier(skier,{steer,brake},terrain,dt,snow);elapsed+=dt;peakSpeed=Math.max(peakSpeed,skier.speed);totalDistance=skier.distance;
  const boundsX=(terrain.width-1)*terrain.spacing/2-20,boundsZ=(terrain.height-1)*terrain.spacing/2-20;
  if(Math.abs(skier.x)>boundsX||Math.abs(skier.z)>boundsZ){resetPosition();toast('已到地形边界，返回检查点');return;}
  const p=route.points[Math.min(checkpoint+1,route.points.length-1)];
  if(Math.hypot(skier.x-p.x,skier.z-p.z)<65){
    checkpoint++;
    if(checkpoint===route.points.length-1){finishRun();return;}
    toast(`检查点 ${checkpoint} / ${route.points.length-1}`);
  }
  if(skier.speed>2){
    for(const tree of treePositions){if(Math.abs(tree.x-skier.x)<2.6&&Math.abs(tree.z-skier.z)<2.6){resetPosition();toast('碰到树了，已返回检查点');break;}}
  }
}

function updateAthlete(dt){
  const g=terrain.gradient(skier.x,skier.z),fx=Math.sin(skier.heading),fz=Math.cos(skier.heading);
  athlete.position.set(skier.x,yAt(skier.x,skier.z)+.25,skier.z);athlete.rotation.set(0,skier.heading,0);
  const turn=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  athlete.userData.body.rotation.z=THREE.MathUtils.lerp(athlete.userData.body.rotation.z,turn*.27,1-Math.exp(-dt*8));
  athlete.userData.body.rotation.x=clamp(-Math.atan(g.x*fx+g.z*fz)*.45,-.4,.4);
}

function updateCamera(dt,snap=false){
  const p=athlete.position;
  if(mode==='intro'){
    // View from the valley back toward the ridge. The panel occupies the left third.
    const mid=route.points[Math.floor(route.points.length/2)];
    targetCamera.set(mid.x+780,yAt(mid.x,mid.z)+670,mid.z+680);
    lookTarget.set(mid.x-120,yAt(mid.x,mid.z)+40,mid.z-100);
  }else if(view==='overview'){
    targetCamera.set(p.x+180,p.y+460,p.z+280);lookTarget.copy(p);
  }else{
    forward.set(Math.sin(skier.heading),0,Math.cos(skier.heading));
    targetCamera.copy(p).addScaledVector(forward,-24-Math.min(skier.speed*.22,9));targetCamera.y+=13;
    targetCamera.y=Math.max(targetCamera.y,yAt(targetCamera.x,targetCamera.z)+8);
    lookTarget.copy(p).addScaledVector(forward,24);lookTarget.y+=2;
  }
  const a=snap?1:1-Math.exp(-dt*(mode==='intro'?2:4));
  camera.position.lerp(targetCamera,a);displayLook.lerp(lookTarget,a);camera.lookAt(displayLook);
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
const mapBounds={minX:-1950,maxX:650,minZ:-800,maxZ:850};
function mapPoint(p){return {x:(p.x-mapBounds.minX)/(mapBounds.maxX-mapBounds.minX)*280,y:(p.z-mapBounds.minZ)/(mapBounds.maxZ-mapBounds.minZ)*210};}
function mapToWorld(x,y){return {x:mapBounds.minX+x/280*(mapBounds.maxX-mapBounds.minX),z:mapBounds.minZ+y/210*(mapBounds.maxZ-mapBounds.minZ)};}
function drawMap(){
  const ctx=$('minimap').getContext('2d');ctx.drawImage(mapBackground,0,0);
  for(const r of routes){ctx.beginPath();r.points.forEach((p,i)=>{const m=mapPoint(p);i?ctx.lineTo(m.x,m.y):ctx.moveTo(m.x,m.y);});ctx.strokeStyle=r.id===route.id?'#365b49':'#94ac8b';ctx.lineWidth=r.id===route.id?2.5:1;ctx.setLineDash(r.id===route.id?[]:[3,3]);ctx.stroke();}
  ctx.setLineDash([]);
  if(trailPoints.length>1){ctx.beginPath();trailPoints.forEach((p,i)=>{const m=mapPoint({x:p.x,z:p.z});i?ctx.lineTo(m.x,m.y):ctx.moveTo(m.x,m.y);});ctx.strokeStyle='#d57f4d';ctx.lineWidth=1.5;ctx.stroke();}
  for(const p of [route.points[0],route.points.at(-1)]){const m=mapPoint(p);ctx.beginPath();ctx.arc(m.x,m.y,3,0,Math.PI*2);ctx.fillStyle='#f9fbe8';ctx.fill();ctx.strokeStyle='#365b49';ctx.lineWidth=1.5;ctx.stroke();}
  const m=mapPoint(skier);ctx.save();ctx.translate(m.x,m.y);ctx.rotate(-skier.heading);ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(-5,-5);ctx.lineTo(0,-3);ctx.lineTo(5,-5);ctx.closePath();ctx.fillStyle='#dd7446';ctx.strokeStyle='#fff8e9';ctx.lineWidth=1.5;ctx.fill();ctx.stroke();ctx.restore();
}

function updateUI(){
  $('speed').textContent=Math.round(skier.speed*3.6);$('altitude').textContent=Math.round(terrain.sample(skier.x,skier.z));
  const g=terrain.gradient(skier.x,skier.z);$('slope').textContent=Math.round(Math.atan(Math.hypot(g.x,g.z))*180/Math.PI);
  $('timer').textContent=clockFormat(elapsed);$('distance').textContent=`${Math.round(totalDistance)} m`;
  const n=nearestOnRoute(skier,route.points);$('progress').style.width=`${clamp(n.progress/n.total*100,0,100)}%`;
  if(mode==='running'){
    if(n.distance>150) $('distance').textContent+=' · 已偏离参考线路';
    const prev=trailPoints.at(-1);
    if(!prev||Math.hypot(prev.x-skier.x,prev.z-skier.z)>3){
      if(trailPoints.length>=6000)trailPoints.shift();
      trailPoints.push({x:skier.x,y:yAt(skier.x,skier.z)+.35,z:skier.z});
      const attr=trailGeometry.attributes.position;trailPoints.forEach((p,i)=>attr.setXYZ(i,p.x,p.y,p.z));attr.needsUpdate=true;trailGeometry.setDrawRange(0,trailPoints.length);
    }
  }
  drawMap();
}

function animate(time){
  requestAnimationFrame(animate);const dt=Math.min((time-lastTime)/1000||0,.1);lastTime=time;
  if(mode==='running'){
    accumulator+=dt;
    while(accumulator>=fixedStep){if(mode==='running')updatePhysics(fixedStep);accumulator-=fixedStep;}
  }else accumulator=0;
  updateAthlete(dt);updateCamera(dt);
  uiClock+=dt;if(uiClock>.1){updateUI();uiClock=0;}
  if(noiseGain)noiseGain.gain.setTargetAtTime(soundOn&&mode==='running'?.006+Math.min(skier.speed/42,1)*.065:0,audio.currentTime,.15);
  renderer.render(scene,camera);
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
$('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resumeRun();});
$('result').addEventListener('cancel',e=>{e.preventDefault();goIntro();});
function openHelp(){pausedFrom=mode;if(mode==='running')mode='help';keys.clear();$('help-dialog').showModal();}
function closeHelp(){ $('help-dialog').close();if(mode==='help')mode=pausedFrom;keys.clear();}
$('help').addEventListener('click',openHelp);document.querySelectorAll('.close-dialog,.close-help').forEach(b=>b.addEventListener('click',closeHelp));
$('help-dialog').addEventListener('cancel',e=>{e.preventDefault();closeHelp();});
$('overview').addEventListener('click',()=>{if(mode==='intro'){toast('开始滑行后，可以切换跟随 / 俯瞰镜头');return;}view=view==='follow'?'overview':'follow';$('overview').innerHTML=view==='overview'?'跟随 <kbd>O</kbd>':'俯瞰 <kbd>O</kbd>';});
$('sound').addEventListener('click',()=>{soundOn=!soundOn;if(soundOn)enableAudio();$('sound').textContent=soundOn?'声音开':'声音关';$('sound').setAttribute('aria-pressed',soundOn);});
document.querySelectorAll('[data-snow]').forEach(b=>b.addEventListener('click',()=>{snow=b.dataset.snow;document.querySelectorAll('[data-snow]').forEach(el=>el.classList.toggle('selected',el===b));}));
document.querySelectorAll('[data-key]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>keys.delete(b.dataset.key));
});
addEventListener('keydown',e=>{
  if(['Space','ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Escape'||e.code==='KeyP'){if(mode==='running'){e.preventDefault();pauseRun();}else if(mode==='paused'){e.preventDefault();resumeRun();}return;}
  if(e.code==='KeyH'&&!document.querySelector('dialog[open]')){openHelp();return;}
  if(e.code==='KeyO'&&!document.querySelector('dialog[open]')){$('overview').click();return;}
  if(e.code==='KeyR'&&mode==='running'){resetPosition();toast('已返回最近检查点');return;}
  if(mode==='running') keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();pauseRun();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();pauseRun();}});
addEventListener('resize',()=>{if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
init().catch(error=>{console.error(error);$('loading').innerHTML=`山体载入失败。${error.message}<br>需要支持 WebGL 的浏览器。<br><button onclick="location.reload()">重新载入</button>`;});
