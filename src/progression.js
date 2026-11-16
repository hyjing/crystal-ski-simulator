const KEY='terrain-sessions:progress:v1';

export const TALENTS={
  stamina:{name:'耐力',description:'被追赶时少掉 15% 生命'},
  recovery:{name:'恢复',description:'血包额外回复 10 点生命'},
  agility:{name:'敏捷',description:'踢开基础冷却缩短 0.75 秒'},
};
export const DEFAULT_TALENTS=Object.freeze(['stamina']);

export const ITEM_UPGRADES={
  boost:{kind:'持续时间',description:'加速延长 0.3 秒',price:12},
  decoy:{kind:'持续时间',description:'信标延长 1 秒',price:14},
  shield:{kind:'持续时间',description:'护盾延长 0.8 秒',price:18},
  mist:{kind:'持续时间',description:'雪雾延长 1 秒',price:16},
  banana:{kind:'数量',description:'一次丢两片香蕉皮',price:12},
  snowball:{kind:'数量',description:'一次投两个冰雪球',price:14},
  pulse:{kind:'威力',description:'雪浪半径增加 5 米',price:20},
  avalanche:{kind:'威力',description:'雪崩半径增加 5 米',price:54},
};
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

const validUpgrade=id=>Object.hasOwn(TALENTS,id)||Object.hasOwn(ITEM_UPGRADES,id);
const counter=value=>Number.isFinite(value)?Math.max(0,Math.min(1_000_000,Math.floor(value))):0;

export function levelProgress(xp){
  let level=1,needed=60;
  while(xp>=needed){xp-=needed;level++;needed+=20;}
  return {level,xp,needed};
}

export function upgradePoints(profile){
  return Math.max(0,levelProgress(profile.xp).level-1-profile.upgrades.length);
}

export function chooseUpgrade(profile,id){
  if(!validUpgrade(id)||profile.upgrades.includes(id)||!upgradePoints(profile))return false;
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
  const upgrades=Array.isArray(saved?.upgrades)
    ?[...new Set(saved.upgrades.filter(validUpgrade))].slice(0,levelProgress(xp).level-1):[];
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
