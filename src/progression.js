const RETIRED_ITEMS={decoy:14,snowball:14,frosttrail:16,autofrost:24};
const KEY='terrain-sessions:progress:v1';

export const UPGRADE_CAP=3;

export const TALENTS={
  stamina:{name:'耐力',bonuses:[15,25,35],describe:amount=>`被追赶时少掉 ${amount}% 生命`},
  recovery:{name:'恢复',bonuses:[10,20,30],describe:amount=>`血包额外回复 ${amount} 点生命`},
  agility:{name:'敏捷',bonuses:[.75,1.5,2.25],describe:amount=>`踢开基础冷却缩短 ${amount} 秒`},
  frosttrail:{name:'霜冻滑痕',requires:'agility',bonuses:[1.4,1.8,2.2],cooldowns:[6,5,4],damage:[10,13,16],
    describe:(duration,damage,cooldown)=>`平稳落地后铺冰 ${duration} 秒，踩中伤害 ${damage}，冷却 ${cooldown} 秒`},
  autofrost:{name:'追尾雪弹炮',requires:'stamina',bonuses:[12,15,18],cooldowns:[2.8,2.3,1.85],
    describe:(damage,_,cooldown)=>`两星起向身后雪友自动发射，伤害 ${damage}，间隔 ${cooldown} 秒`},
};
export const DEFAULT_TALENTS=Object.freeze(['stamina']);

export const SKILL_BRANCHES=[
  {name:'追击反制',nodes:['stamina','autofrost']},
  {name:'雪上操控',nodes:['agility','frosttrail']},
  {name:'生存',nodes:['recovery']},
];

export function passiveCooldown(upgrades,id){
  return TALENTS[id]?.cooldowns?.[upgradeRank(upgrades,id)-1]??0;
}

export const ITEM_UPGRADES={
  boost:{bonuses:[.45,.95,1.55],extra:[6,12,18],describe:(time,thrust)=>`加速延长 ${time} 秒，推力 +${thrust}`,price:12},
  shield:{bonuses:[.8,1.8,3],extra:[1.5,3,4.5],describe:(time,radius)=>`护盾延长 ${time} 秒，击退范围 +${radius} 米`,price:18},
  mist:{bonuses:[1,2.5,4],extra:[3,6,9],describe:(time,radius)=>`雪雾延长 ${time} 秒，半径 +${radius} 米`,price:16},
  banana:{bonuses:[1,2,3],extra:[.35,.7,1.05],describe:(amount,time)=>`一次丢 ${amount+1} 片，滑倒延长 ${time} 秒`,price:12},
  pulse:{bonuses:[5,11,18],extra:[7,14,21],describe:(radius,damage)=>`雪浪半径 +${radius} 米，伤害 +${damage}`,price:20},
  avalanche:{bonuses:[5,12,20],describe:amount=>`雪崩半径增加 ${amount} 米`,price:54},
  glider:{bonuses:[.55,1.15,1.85],describe:time=>`可控滑翔延长 ${time} 秒`,price:22},
  flametrail:{bonuses:[.6,1.3,2.2],extra:[2,4,7],describe:(time,damage)=>`铺火延长 ${time} 秒，每跳伤害 +${damage}`,price:18},
  miragetrail:{bonuses:[.6,1.3,2.2],extra:[3,6,10],describe:(time,damage)=>`铺幻光延长 ${time} 秒，踩中伤害 +${damage}`,price:17},
  crew:{bonuses:[1,2,3],extra:[.5,1,1.5],describe:(amount,time)=>`召唤 ${amount+1} 名雪友，持续时间 +${time} 秒`,price:20},
};
const UPGRADES={...TALENTS,...ITEM_UPGRADES};
const MAX_UPGRADE_POINTS=Object.keys(UPGRADES).length*UPGRADE_CAP;

export function upgradeRank(upgrades,id){
  return Math.min(UPGRADE_CAP,upgrades.reduce((rank,upgrade)=>rank+Number(upgrade===id),0));
}

export function upgradeBonus(upgrades,id){
  return validUpgrade(id)?UPGRADES[id].bonuses[upgradeRank(upgrades,id)-1]??0:0;
}

export function itemUpgradeExtra(upgrades,id){
  return ITEM_UPGRADES[id]?.extra?.[upgradeRank(upgrades,id)-1]??0;
}

export function describeUpgrade(id,rank){
  if(!validUpgrade(id)||rank<1||rank>UPGRADE_CAP)return '';
  const upgrade=UPGRADES[id];
  return upgrade.describe(upgrade.bonuses[rank-1],upgrade.extra?.[rank-1]??upgrade.damage?.[rank-1],upgrade.cooldowns?.[rank-1]);
}

export const ITEM_CAPACITY=3;
export const ITEM_STACK_LIMIT=3;

export function itemStacks(items){
  const stacks=new Map();
  for(const type of items)stacks.set(type,(stacks.get(type)??0)+1);
  return [...stacks].map(([type,count])=>({type,count}));
}

export function itemRoom(items,type){
  const stacks=itemStacks(items);
  const existing=stacks.find(stack=>stack.type===type);
  if(existing)return ITEM_STACK_LIMIT-existing.count;
  return stacks.length<ITEM_CAPACITY?ITEM_STACK_LIMIT:0;
}

export function canStoreItem(items,type){
  return itemRoom(items,type)>0;
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

export function upgradeUnlocked(upgrades,id){
  const parent=TALENTS[id]?.requires;
  return !parent||upgradeRank(upgrades,parent)>0||upgradeRank(upgrades,id)>0;
}

export function chooseUpgrade(profile,id){
  if(!validUpgrade(id)||!upgradeUnlocked(profile.upgrades,id)||upgradeRank(profile.upgrades,id)>=UPGRADE_CAP||!upgradePoints(profile))return false;
  profile.upgrades.push(id);
  return true;
}

export function shopStock(profile,id){
  const item=Object.hasOwn(ITEM_UPGRADES,id)&&ITEM_UPGRADES[id];
  if(!item)return {room:0,affordable:0,max:0};
  const room=itemRoom(profile.supplies,id),affordable=Math.floor(profile.coins/item.price);
  return {room,affordable,max:Math.min(room,affordable)};
}

export function buyItem(profile,id,quantity=1){
  if(!Number.isInteger(quantity)||quantity<1||quantity>shopStock(profile,id).max)return false;
  profile.coins-=ITEM_UPGRADES[id].price*quantity;
  for(let i=0;i<quantity;i++)profile.supplies.push(id);
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
  const refunded=new Map();
  let coins=counter(saved?.coins);
  if(Array.isArray(saved?.supplies)){
    for(const id of saved.supplies){
      if(typeof id!=='string')continue;
      if(Object.hasOwn(ITEM_UPGRADES,id)&&canStoreItem(supplies,id))supplies.push(id);
      else if(Object.hasOwn(RETIRED_ITEMS,id)&&(refunded.get(id)??0)<ITEM_STACK_LIMIT){
        refunded.set(id,(refunded.get(id)??0)+1);
        coins+=RETIRED_ITEMS[id];
      }
    }
  }
  return {xp,coins:counter(coins),upgrades,supplies};
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

  settle(profile,completed,chase,bonusCoins=0){
    if(this.awarded)return {xp:0,coins:0,knockdowns:0};
    this.awarded=true;
    const knockdowns=chase?this.knockedDown.size:0;
    const xp=this.landingXP+this.escapeXP+knockdowns*KNOCKDOWN_XP+(completed?(chase?40:30):0);
    const coins=knockdowns*KNOCKDOWN_COINS+(completed&&chase?20+counter(bonusCoins):0);
    profile.xp=counter(profile.xp+xp);
    profile.coins=counter(profile.coins+coins);
    return {xp,coins,knockdowns};
  }
}
