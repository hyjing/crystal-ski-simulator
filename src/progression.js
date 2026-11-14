const KEY='terrain-sessions:progress:v1';

export const TALENTS={
  stamina:{name:'耐力',description:'被追赶时少掉 15% 生命'},
  recovery:{name:'恢复',description:'血包额外回复 10 点生命'},
  agility:{name:'敏捷',description:'踢开基础冷却缩短 0.75 秒'},
};

export function levelProgress(xp){
  let level=1,needed=60;
  while(xp>=needed){xp-=needed;level++;needed+=20;}
  return {level,xp,needed};
}

export function readProgress(storage){
  try{
    const saved=JSON.parse(storage?.getItem(KEY));
    const xp=Number.isFinite(saved?.xp)?Math.max(0,Math.min(1_000_000,Math.floor(saved.xp))):0;
    const talent=xp>=60&&Object.hasOwn(TALENTS,saved?.talent)?saved.talent:null;
    return {xp,talent};
  }catch{return {xp:0,talent:null};}
}

export function saveProgress(storage,profile){
  try{storage?.setItem(KEY,JSON.stringify(profile));}catch{}
}

export class RunExperience {
  constructor(){this.landingXP=0;this.escapeXP=0;this.awarded=false;}

  landing(event){
    if(event?.type==='land'&&event.quality==='clean'&&event.airTime>=.35){
      this.landingXP=Math.min(12,this.landingXP+(event.rotation>=180||event.grab?4:2));
    }
  }

  escape(){this.escapeXP=Math.min(12,this.escapeXP+6);}

  settle(profile,completed,chase){
    if(this.awarded)return 0;
    this.awarded=true;
    const earned=this.landingXP+this.escapeXP+(completed?(chase?40:30):0);
    profile.xp=Math.min(1_000_000,profile.xp+earned);
    return earned;
  }
}
