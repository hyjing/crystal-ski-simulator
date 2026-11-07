import * as THREE from 'three';
let library;
export function loadMotionClips(){
 return library??=fetch(`${import.meta.env.BASE_URL}assets/skier-motion.json?v=1`).then(r=>{if(!r.ok)throw Error('motion library');return r.json();}).then(data=>data.clips.map(c=>THREE.AnimationClip.parse(c))).catch(error=>{console.warn('Motion clips unavailable; retaining procedural fallback',error);return null;});
}
export class SkierMotion{
 constructor(model,clips){this.model=model;this.mixer=new THREE.AnimationMixer(model);this.actions=new Map();this.weights=new Map();this.mode=null;this.active=false;const reference=clips.find(c=>c.name==='ski-glide');for(let clip of clips){if(clip.name.startsWith('ski-plant-')&&reference){clip=clip.clone();const side=clip.name.endsWith('left')?'l':'r';clip.tracks=clip.tracks.filter(t=>new RegExp(`^(clavicle|upperarm|lowerarm|hand)_${side}\\.`).test(t.name));THREE.AnimationUtils.makeClipAdditive(clip,0,reference,30);} const action=this.mixer.clipAction(clip);action.play();action.setEffectiveWeight(0);this.actions.set(clip.name,action);this.weights.set(clip.name,0);}}
 apply(s,dt){
  const visitor=s.pedestrian&&!s.holding&&!(s.sitAmount>.01),ski=!s.pedestrian&&!s.airborne&&!s.ride;
  if((!visitor&&!ski)||s.fall>0||s.crouch>0||s.grab>0){this.active=false;return null;}
  const mode=visitor?'visitor':'ski',target=new Map(),set=(n,w)=>target.set(n,w);
  if(visitor){const walk=THREE.MathUtils.clamp(s.walkAmount||0,0,1);set('visitor-walk',walk);set('visitor-idle',1-walk);}
  else{const tuck=THREE.MathUtils.clamp(s.tuck||0,0,1),pole=THREE.MathUtils.clamp(s.poling||0,0,1),carve=THREE.MathUtils.clamp(Math.abs(s.edgeRoll||0)/.75,0,1),ground=(1-tuck)*(1-pole);set('ski-glide',(1-carve)*ground);set(s.edgeRoll>0?'ski-carve-right':'ski-carve-left',carve*ground);set('ski-tuck',tuck*(1-pole));set('ski-pole-push',pole);}
  set('ski-plant-left',ski&&s.plantActive&&s.plantSide>0?1:0);set('ski-plant-right',ski&&s.plantActive&&s.plantSide<0?1:0);
  if([...target].some(([n,w])=>w>0&&!this.actions.has(n))){this.active=false;return null;}
  const snap=!this.active||this.mode!==mode||dt<=0,a=snap?1:1-Math.exp(-dt*10);let total=0;
  for(const [n] of this.actions){const w=THREE.MathUtils.lerp(this.weights.get(n),target.get(n)||0,a);this.weights.set(n,w);if(!n.startsWith('ski-plant-'))total+=w;}
  for(const [n,action] of this.actions){action.enabled=true;action.setEffectiveWeight(n.startsWith('ski-plant-')?this.weights.get(n):this.weights.get(n)/Math.max(total,1e-9));if(n.startsWith('ski-plant-'))action.time=Math.min(.999,s.plantPhase||0)*action.getClip().duration;if(n==='ski-pole-push')action.time=(s.polePhase||0)*action.getClip().duration;if(n==='visitor-walk')action.time=(((s.walkPhase||0)/(2*Math.PI))%1+1)%1*action.getClip().duration;}
  // Phase-locked strokes / steps are sampled at their physics phase. Held ski
  // poses and idle breathing loop independently. No root travel is in the clips.
  const locked=['ski-pole-push','visitor-walk','ski-plant-left','ski-plant-right'];for(const n of locked)this.actions.get(n)?.setEffectiveTimeScale(0);
  this.mixer.update(Math.max(0,dt));this.mode=mode;this.active=true;return mode;
 }
}
