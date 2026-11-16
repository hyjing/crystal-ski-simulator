import {pointAlongRoute} from './terrain.js';

const goals={
  'windward-bowl':{key:'speed',target:3,label:'108 km/h 持续 3 秒',coins:18},
  'pine-switchbacks':{key:'shortcuts',target:2,label:'穿过两条林间捷径',coins:22},
  'frost-chute':{key:'escapes',target:2,label:'两次摆脱近身追赶',coins:22},
  'skyline-park':{key:'landings',target:2,label:'连续两次干净落地',coins:24},
  'blueglass-traverse':{key:'health',target:85,label:'以 85 点生命完赛',coins:18},
  'split-basin':{key:'cargo',target:2,label:'走捷径并携带雪崩弹完赛',coins:28},
};

export function chaseGoal(route){return Object.hasOwn(goals,route.id)?goals[route.id]:null;}

export function authoredChaseBranches(route,terrain){
  const choices=route.id==='pine-switchbacks'?[
    {from:.148,to:.227,name:'松针捷径',kind:'shortcut'},
    {from:.404,to:.479,name:'林场补给线',kind:'aid'},
    {from:.648,to:.727,name:'白桦捷径',kind:'shortcut'},
  ]:route.id==='split-basin'?[
    {from:.418,to:.530,name:'沟底捷径',kind:'shortcut'},
    {from:.775,to:.854,name:'盆地补给线',kind:'aid'},
  ]:null;
  return choices?.map(({from,to,name,kind})=>{
    const lo=route.length*from,hi=route.length*to;
    const start=pointAlongRoute(route,lo),end=pointAlongRoute(route,hi);
    const middle=pointAlongRoute(route,(lo+hi)/2);
    const dx=end.x-start.x,dz=end.z-start.z,length=Math.hypot(dx,dz);
    const side=Math.sign((middle.x-start.x)*dz-(middle.z-start.z)*dx)||1;
    const points=Array.from({length:25},(_,i)=>{
      const t=i/24,p=pointAlongRoute(route,lo+(hi-lo)*t);
      const chord={x:start.x+dx*t,z:start.z+dz*t};
      const blend=Math.sin(Math.PI*t)**.65;
      const x=kind==='shortcut'?p.x+(chord.x-p.x)*blend:p.x+side*38*dz/length*blend;
      const z=kind==='shortcut'?p.z+(chord.z-p.z)*blend:p.z-side*38*dx/length*blend;
      return {x,z,y:terrain.surface(x,z)};
    });
    return {name,kind,lo,hi,points,gate:points[12],halfWidth:7};
  });
}

export class ChaseGoal {
  constructor(config){
    this.config=config;
    this.speed=0;
    this.landings=0;
  }
  step(dt,player,run){
    this.speed=run.stars>0&&player.speed>=30&&!player.crashRemaining&&run.contact===0
      ?Math.min(3,this.speed+dt):this.speed<3?0:3;
  }
  landing(event){
    if(this.landings>=2)return;
    if(event.type==='crash'||event.type==='land'&&event.quality!=='clean')this.landings=0;
    else if(event.type==='land'&&event.airTime>=.35)this.landings=Math.min(2,this.landings+1);
  }
  status(run){
    const shortcuts=run.shortcuts.size;
    const value={
      speed:Math.floor(this.speed*10)/10,shortcuts,escapes:run.escapes,landings:this.landings,
      health:Math.floor(run.health),cargo:Number(shortcuts>0)+Number(run.inventory.includes('avalanche')),
    }[this.config.key];
    return {value,target:this.config.target,complete:value>=this.config.target};
  }
  reward(run,completed){return completed&&this.status(run).complete?this.config.coins:0;}
}
