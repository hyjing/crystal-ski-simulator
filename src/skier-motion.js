import * as THREE from 'three';
let library;
export function loadMotionClips(){
 return library??=fetch(`${import.meta.env.BASE_URL}assets/skier-motion.json?v=4`).then(r=>{if(!r.ok)throw Error('motion library');return r.json();}).then(data=>data.clips.map(c=>THREE.AnimationClip.parse(c))).catch(error=>{console.warn('Motion clips unavailable; retaining procedural fallback',error);return null;});
}
export class SkierMotion{
 constructor(model,clips){this.model=model;this.mixer=new THREE.AnimationMixer(model);this.actions=new Map();this.weights=new Map();this.mode=null;this.active=false;const reference=clips.find(c=>c.name==='ski-glide');for(let clip of clips){if(clip.name.startsWith('ski-plant-')&&reference){clip=clip.clone();const side=clip.name.endsWith('left')?'l':'r';clip.tracks=clip.tracks.filter(t=>new RegExp(`^(clavicle|upperarm|lowerarm|hand)_${side}\\.`).test(t.name));THREE.AnimationUtils.makeClipAdditive(clip,0,reference,30);}const action=this.mixer.clipAction(clip);action.play();action.setEffectiveWeight(0);this.actions.set(clip.name,action);this.weights.set(clip.name,0);}}
 modeFor(s){if(s.grab>0)return null;if(s.pedestrian)return !s.holding&&!(s.sitAmount>.01)?'visitor':null;return !s.ride?'ski':null;}
 apply(s,dt){
  const requested=this.modeFor(s),visitor=requested==='visitor',ski=requested==='ski';
  if(!requested){this.active=false;return null;}
  const mode=visitor?'visitor':'ski',target=new Map(),set=(n,w)=>target.set(n,w),clamp=THREE.MathUtils.clamp;
  this.stage=mode;
  if(visitor){const walk=clamp(s.walkAmount||0,0,1);set('visitor-walk',walk);set('visitor-idle',1-walk);}
  else if(s.crashRemaining>0||s.fall>0||s.crouch>0){
   this.stage='fall';const phase=s.fallPhase||'impact';
   if(phase==='balance')set('ski-fall-brace',1);
   else if(phase==='impact'||phase==='settle')set('ski-fall-down',1);
   else if(phase==='brace')set('ski-fall-rise',1);
   else{set('ski-fall-rise',clamp(s.crouch||s.fall||0,0,1));set('ski-glide',1-clamp(s.crouch||s.fall||0,0,1));}
  }else if(s.airborne){
   this.stage='air';const rise=1-THREE.MathUtils.smoothstep(s.flightTime||0,.04,.23),ready=(s.airVy<0?1:0)*(1-THREE.MathUtils.smoothstep(s.airClearance??10,.35,2));
   set('ski-air-rise',rise*(1-ready));set('ski-air-float',(1-rise)*(1-ready));set('ski-air-prepare',ready);
  }else if(s.jumpPreparation>0){this.stage='preload';set('ski-preload',1);}
  else{
   const tuck=clamp(s.tuck||0,0,1),pole=clamp(s.poling||0,0,1),carve=clamp(Math.abs(s.edgeRoll||0)/.9,0,1),release=clamp(s.release||0,0,1)*.65,absorb=clamp(Math.max(0,s.absorption||0),0,1),landing=clamp(s.landing||0,0,1),ground=(1-tuck)*(1-pole)*(1-release)*(1-absorb)*(1-landing);
   set('ski-glide',(1-carve)*ground);set(s.edgeRoll>0?'ski-carve-right':'ski-carve-left',carve*ground);set('ski-tuck',tuck*(1-pole)*(1-landing));set('ski-pole-push',pole*(1-landing));set('ski-release',release*(1-pole)*(1-landing));set('ski-absorb',absorb*(1-pole)*(1-landing));set('ski-landing-soft',landing*(1-(s.landingStrength||0)));set('ski-landing-hard',landing*(s.landingStrength||0));
   if(landing>.01)this.stage='landing';
  }
  const canPlant=ski&&this.stage==='ski';set('ski-plant-left',canPlant&&s.plantActive&&s.plantSide>0?1:0);set('ski-plant-right',canPlant&&s.plantActive&&s.plantSide<0?1:0);
  if([...target].some(([n,w])=>w>0&&!this.actions.has(n))){this.active=false;return null;}
  const snap=!this.active||this.mode!==mode||dt<=0,a=snap?1:1-Math.exp(-dt*14);let total=0;
  for(const [n] of this.actions){const w=THREE.MathUtils.lerp(this.weights.get(n),target.get(n)||0,a);this.weights.set(n,w);if(!n.startsWith('ski-plant-'))total+=w;}
  for(const [n,action] of this.actions){action.enabled=true;action.setEffectiveWeight(n.startsWith('ski-plant-')?this.weights.get(n):this.weights.get(n)/Math.max(total,1e-9));if(n.startsWith('ski-plant-'))action.time=Math.min(.999,s.plantPhase||0)*action.getClip().duration;if(n==='ski-pole-push')action.time=(s.polePhase||0)*action.getClip().duration;if(n==='visitor-walk')action.time=(((s.walkPhase||0)/(2*Math.PI))%1+1)%1*action.getClip().duration;if(n.startsWith('ski-landing-'))action.time=Math.min(.999,s.landingPhase||0)*action.getClip().duration;}
  for(const n of ['ski-pole-push','visitor-walk','ski-plant-left','ski-plant-right','ski-landing-soft','ski-landing-hard'])this.actions.get(n)?.setEffectiveTimeScale(0);
  this.mixer.update(Math.max(0,dt));this.mode=mode;this.active=true;return mode;
 }
}
