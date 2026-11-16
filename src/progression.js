const KEY='terrain-sessions:progress:v1';

export const UPGRADE_CAP=3;

export const TALENTS={
  stamina:{name:'耐力',bonuses:[15,25,35],describe:amount=>`被追赶时少掉 ${amount}% 生命`},
  recovery:{name:'恢复',bonuses:[10,20,30],describe:amount=>`血包额外回复 ${amount} 点生命`},
  agility:{name:'敏捷',bonuses:[.75,1.5,2.25],describe:amount=>`踢开基础冷却缩短 ${amount} 秒`},
};
export const DEFAULT_TALENTS=Object.freeze(['stamina']);

export const ITEM_UPGRADES={
  boost:{bonuses:[.3,.6,.9],describe:amount=>`加速延长 ${amount} 秒`,price:12},
  decoy:{bonuses:[1,2,3],describe:amount=>`信标延长 ${amount} 秒`,price:14},
  shield:{bonuses:[.8,1.6,2.4],describe:amount=>`护盾延长 ${amount} 秒`,price:18},
  mist:{bonuses:[1,2,3],describe:amount=>`雪雾延长 ${amount} 秒`,price:16},
  banana:{bonuses:[1,2,3],describe:amount=>`一次丢 ${amount+1} 片香蕉皮`,price:12},
  snowball:{bonuses:[1,2,3],describe:amount=>`一次投 ${amount+1} 个冰雪球`,price:14},
  pulse:{bonuses:[5,10,15],describe:amount=>`雪浪半径增加 ${amount} 米`,price:20},
  avalanche:{bonuses:[5,10,15],describe:amount=>`雪崩半径增加 ${amount} 米`,price:54},
};
const UPGRADES={...TALENTS,...ITEM_UPGRADES};
const MAX_UPGRADE_POINTS=Object.keys(UPGRADES).length*UPGRADE_CAP;

export function upgradeRank(upgrades,id){
  return Math.min(UPGRADE_CAP,upgrades.reduce((rank,upgrade)=>rank+Number(upgrade===id),0));
}

export function upgradeBonus(upgrades,id){
  return validUpgrade(id)?UPGRADES[id].bonuses[upgradeRank(upgrades,id)-1]??0:0;
}

export function describeUpgrade(id,rank){
  if(!validUpgrade(id)||rank<1||rank>UPGRADE_CAP)return '';
  const upgrade=UPGRADES[id];
  return upgrade.describe(upgrade.bonuses[rank-1]);
}

export const ITEM_CAPACITY=3;
export const ITEM_STACK_LIMIT=3;

export function itemStacks(items){
  const stacks=new Map();
  for(const type of items)stacks.set(type,(stacks.get(type)??0)+1);
  return [...stacks].map(([type,count])=>({type,count}));
}

export function canStoreItem(items,type){
  const stacks=itemStacks(items);
  const existing=stacks.find(stack=>stack.type===type);
  return existing?existing.count<ITEM_STACK_LIMIT:stacks.length<ITEM_CAPACITY;
}
export const KNOCKDOWN_XP=8;
export const KNOCKDOWN_COINS=6;

const validUpgrade=id=>typeof id==='string'&&Object.hasOwn(UPGRADES,id);
const counter=value=>Number.isFinite(value)?Math.max(0,Math.min(1_000_000,Math.floor(value))):0;

export function levelProgress(xp){
  let level=1,needed=60;
  while(xp>=needed){xp-=needed;level++;needed+=20;}
  return {level,xp,needed};
}

export function upgradePoints(profile){
  return Math.max(0,Math.min(MAX_UPGRADE_POINTS,levelProgress(profile.xp).level-1)-profile.upgrades.length);
}

export function chooseUpgrade(profile,id){
  if(!validUpgrade(id)||upgradeRank(profile.upgrades,id)>=UPGRADE_CAP||!upgradePoints(profile))return false;
  profile.upgrades.push(id);
  return true;
}

export function buyItem(profile,id){
  const item=Object.hasOwn(ITEM_UPGRADES,id)&&ITEM_UPGRADES[id];
  if(!item||profile.coins<item.price||!canStoreItem(profile.supplies,id))return false;
  profile.coins-=item.price;
  profile.supplies.push(id);
  return true;
}

export function readProgress(storage){
  let saved;
  try{saved=JSON.parse(storage?.getItem(KEY));}catch{}
  const xp=counter(saved?.xp);
  const upgrades=[];
  if(Array.isArray(saved?.upgrades)){
    const budget=Math.min(MAX_UPGRADE_POINTS,levelProgress(xp).level-1);
    for(const id of saved.upgrades){
      if(upgrades.length>=budget)break;
      if(validUpgrade(id)&&upgradeRank(upgrades,id)<UPGRADE_CAP)upgrades.push(id);
    }
  }
  const supplies=[];
  if(Array.isArray(saved?.supplies)){
    for(const id of saved.supplies){
      if(Object.hasOwn(ITEM_UPGRADES,id)&&canStoreItem(supplies,id))supplies.push(id);
    }
  }
  return {xp,coins:counter(saved?.coins),upgrades,supplies};
}

export function saveProgress(storage,profile){
  try{storage?.setItem(KEY,JSON.stringify(profile));}catch{}
}

export class RunExperience {
  constructor(){
    this.landingXP=0;
    this.escapeXP=0;
    this.knockedDown=new Set();
    this.awarded=false;
  }

  landing(event){
    if(event?.type==='land'&&event.quality==='clean'&&event.airTime>=.35){
      this.landingXP=Math.min(12,this.landingXP+(event.rotation>=180||event.grab?4:2));
    }
  }

  escape(){this.escapeXP=Math.min(12,this.escapeXP+6);}

  knockdown(target){
    if(this.knockedDown.has(target))return false;
    this.knockedDown.add(target);
    return true;
  }

  settle(profile,completed,chase){
    if(this.awarded)return {xp:0,coins:0,knockdowns:0};
    this.awarded=true;
    const knockdowns=chase?this.knockedDown.size:0;
    const xp=this.landingXP+this.escapeXP+knockdowns*KNOCKDOWN_XP+(completed?(chase?40:30):0);
    const coins=knockdowns*KNOCKDOWN_COINS+(completed&&chase?20:0);
    profile.xp=counter(profile.xp+xp);
    profile.coins=counter(profile.coins+coins);
    return {xp,coins,knockdowns};
  }
}
