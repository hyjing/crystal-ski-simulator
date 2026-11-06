import * as THREE from 'three';
export const SKI_PROFILES={allmountain:{label:'全山 · 176 cm',length:1,width:1,sidecut:19},powder:{label:'粉雪 · 188 cm',length:1.07,width:1.18,sidecut:23},park:{label:'公园双翘 · 165 cm',length:.94,width:.82,sidecut:16}};
export const GEAR_PRESETS={blue:{label:'深蓝 / 炭黑',jacket:'#367fbc',pants:'#282d34',helmet:'#e7e9e5',skis:'#202e38',board:'allmountain'},cream:{label:'奶油白 / 橄榄',jacket:'#e3dfcf',pants:'#515b49',helmet:'#303735',skis:'#cb7841',board:'powder'},rust:{label:'铁锈橘 / 墨蓝',jacket:'#bd613d',pants:'#293747',helmet:'#dddcd3',skis:'#dce6e3',board:'park'}};
export function sanitizeGear(value={}){const out={...GEAR_PRESETS.blue,npcs:value.npcs!==false};for(const k of ['jacket','pants','helmet','skis'])if(typeof value[k]==='string'&&/^#[0-9a-f]{6}$/i.test(value[k]))out[k]=value[k];if(Object.hasOwn(SKI_PROFILES,value.board))out.board=value.board;return out;}
export function readGear(storage){try{return sanitizeGear(JSON.parse((storage??localStorage).getItem('crystal-gear-v1')||'{}'));}catch{return sanitizeGear();}}
export function saveGear(settings,storage){try{(storage??localStorage).setItem('crystal-gear-v1',JSON.stringify(sanitizeGear(settings)));return true;}catch{return false;}}
export function applyGear(actor,value){
 const gear=sanitizeGear(value),rig=actor.userData.humanRig;if(!rig)return;
 const suit=rig.model.getObjectByName('Unified_ski_suit');
 if(!suit.userData.gearBase){suit.geometry=suit.geometry.clone();suit.userData.gearBase=suit.geometry.attributes.color.array.slice();}
 const base=suit.userData.gearBase,c=suit.geometry.attributes.color,p=suit.geometry.attributes.position,coat=new THREE.Color(gear.jacket),pants=new THREE.Color(gear.pants);
 for(let i=0;i<c.count;i++){const jacket=base[i*3+2]>.12&&p.getY(i)>.85,reference=jacket?.75:.123,shade=THREE.MathUtils.clamp(Math.sqrt((base[i*3]+base[i*3+1]+base[i*3+2])/reference),.78,1.08),color=jacket?coat:pants;c.setXYZ(i,color.r*shade,color.g*shade,color.b*shade);}c.needsUpdate=true;
 const head=rig.model.getObjectByName('Integrated_helmet_and_goggles');const shell=head?.children.find(o=>o.isMesh);if(shell){if(!shell.userData.ownHelmet){const original=shell.material;shell.material=original.clone();shell.material.onBeforeCompile=original.onBeforeCompile;shell.material.customProgramCacheKey=original.customProgramCacheKey;shell.userData.ownHelmet=true;}shell.material.color.set(gear.helmet);}
 const profile=SKI_PROFILES[gear.board];for(const ski of actor.userData.skis){const board=ski.children[3],stripe=ski.children[4];if(!board)continue;if(!board.userData.gearBase)board.userData.gearBase=board.geometry.attributes.position.array.slice();const positions=board.geometry.attributes.position,b=board.userData.gearBase;
  for(let i=0;i<positions.count;i++){const t=(b[i*3+2]+1.35)/3.38,tail=gear.board==='park'?.09*Math.pow(Math.max(0,(.18-t)/.18),2):0;positions.setXYZ(i,b[i*3]*profile.width,b[i*3+1]+tail,b[i*3+2]*profile.length);}positions.needsUpdate=true;board.geometry.computeVertexNormals();board.material.color.set(gear.skis);if(stripe){stripe.scale.set(profile.width,1,profile.length);stripe.material.color.set(gear.jacket);}
 }
 actor.userData.gear=gear;return gear;
}
