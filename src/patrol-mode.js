import {clamp, nearestOnRoute, PHYSICS} from './physics.js';
import {pointAlongRoute} from './terrain.js';
import {AVALANCHE_DURATION,AVALANCHE_RADIUS} from './kick.js';
import {sweptContact} from './traffic-brain.js';
import {DEFAULT_TALENTS,ITEM_STACK_LIMIT,canStoreItem,itemStacks,upgradeBonus} from './progression.js';

export const PATROL_ROUTE_ID = 'crystal-angry-skiers';
export const resolveChaseRoute = id => id === 'crystal-patrol-descent' ? PATROL_ROUTE_ID : id;
export function longestChaseRoute(routes,mountainId){
  const longest=routes.reduce((best,route)=>!best||route.length>best.length?route:best,null);
  return longest&&{...longest,id:`${mountainId}-angry-skiers`,patrolOnly:true,label:'愤怒的雪友 · 长距离'};
}
const CAPTURE_RADIUS = 5;
export const MAX_HEALTH = 100;
export const PURSUER_HEALTH=100;
export const MAX_PURSUERS=7;
const KICK_DAMAGE=55;
export const DAMAGE_PER_SECOND = 12.5;
const MEDKIT_HEAL = 35;
const TRAP_RADIUS = 2.1;
const TRIP_DURATION=2.4;
const TRIP_SLIDE=.45;
export const DASH_WARNING=.85;
const DASH_DURATION=.85;
const REPLACEMENT_DELAY = 1.2;
const GUARD_DURATION=2;
export const PATROL_ITEMS = {
  boost: {name:'加速充能',color:'#ffe16d',symbol:'»',duration:1.05,description:'短时猛冲；适合出弯和脱离贴身追赶'},
  decoy: {name:'幻影信标',color:'#c9a4ff',symbol:'◇',duration:2.6,radius:120,description:'在侧后方放下假目标，引开 120 米内的追赶者'},
  shield: {name:'护盾',color:'#83dcff',symbol:'+',duration:1.7,radius:6,description:'阻止截停，并弹开靠近的追赶者'},
  pulse: {name:'雪浪脉冲',color:'#b0fff0',symbol:'◎',duration:.62,radius:19,damage:45,description:'环形击退并造成 45 点伤害，能打断近身围追'},
  avalanche: {name:'雪崩弹',color:'#ff986e',symbol:'✹',duration:AVALANCHE_DURATION,description:'稀有 · 落地直接击倒范围内未受护盾保护的雪友'},
  snowball: {name:'冰雪球',color:'#8cd9ff',symbol:'●',duration:.65,description:'拦停落点旁最近的雪友，打断冲刺并大幅减速 3.2 秒'},
  mist: {name:'雪雾弹',color:'#e3e6f7',symbol:'☁',duration:3,radius:14,description:'留下 3 秒减速雾区。雪友会穿过或绕行，视线被挡时搜索你最后出现的位置'},
  banana: {name:'香蕉皮',color:'#ffcd36',symbol:'⌣',duration:12,description:'绊倒第一个滑过的雪友 2.4 秒，之后他会重新站起来'},
};
export const MEDKIT = {name:'血包',color:'#f95178'};
export const SUPPLY = {name:'道具补给',color:'#f1c77c'};
const range = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
const turnAngle = (a, b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));

function fogBlocks(mist,observer,target){
  return Boolean(mist&&range(observer,target)>4&&sweptContact(observer,target,mist,PATROL_ITEMS.mist.radius));
}

function routePoint(route, distance, offset=0) {
  const p = pointAlongRoute(route, clamp(distance,0,route.length));
  const a = route.points[p.segment], b = route.points[p.segment+1];
  const heading = Math.atan2(b.x-a.x,b.z-a.z);
  return {x:p.x+Math.cos(heading)*offset,z:p.z-Math.sin(heading)*offset,heading};
}

export class PatrolRun {
  constructor(route, clear, pathClear=clear, talents=DEFAULT_TALENTS,itemUpgrades=[]) {
    this.route = route;
    this.clear = clear;
    this.pathClear = pathClear;
    this.time = 0;
    this.stars = 0;
    this.peakStars = 0;
    this.contact = 0;
    this.damageRate=DAMAGE_PER_SECOND*(1-upgradeBonus(talents,'stamina')/100);
    this.medkitHeal=MEDKIT_HEAL+upgradeBonus(talents,'recovery');
    this.escapeArmed=false;
    this.escapes=0;
    this.health = MAX_HEALTH;
    this.traps=[];
    this.bombs=[];
    this.blasts=[];
    this.waves=[];
    this.itemUpgrades=itemUpgrades.slice();
    this.nextDash=7;
    this.dash=null;
    this.evadeUntil = 0;
    this.outcome = '';
    this.furthest = route.spawn.distance;
    this.lastSeen = 0;
    this.spawnAfter = 0;
    this.rearmAt = route.spawn.distance+22;
    this.agents = [];
    this.inventory = [];
    this.lastPickup = null;
    this.blockedPickup=null;
    this.guardBlocks=0;
    this.hits=[];
    this.effects={};
    this.nextIncident = 0;
    this.nextAgent = 0;
    const types = ['boost','pulse','decoy','shield','banana','snowball','mist','boost'];
    this.pickups = [];
    let itemIndex=0;
    for(let d=route.spawn.distance+115;d<route.length-90;d+=225){
      const index=this.pickups.length,side=index%2?1:-1;
      const point=[side*3,-side*3,0].map(offset=>routePoint(route,d,offset)).find(clear);
      if(!point)continue;
      if(index%3===2)this.pickups.push({...point,type:'supply',fallback:types[itemIndex%types.length],taken:false});
      else this.pickups.push({...point,type:types[itemIndex++%types.length],taken:false});
    }
    const rare=route.spawn.distance+(route.length-route.spawn.distance)*.68;
    const rarePoint=[-6,6,0].map(offset=>routePoint(route,rare,offset)).find(clear);
    if(rarePoint)this.pickups.push({...rarePoint,type:'avalanche',taken:false});
    for(let d=route.spawn.distance+225;d<route.length-55;d+=295){
      const point=[0,4,-4].map(offset=>routePoint(route,d,offset)).find(clear);
      if(point)this.pickups.push({...point,type:'medkit',taken:false});
    }
    for(const branch of route.branches??[]){
      const point=branch.points.slice(6,11).find(clear);
      branch.medkit=point?{...point,type:'medkit',taken:false}:null;
      if(branch.medkit)this.pickups.push(branch.medkit);
    }
  }

  get stacks(){return itemStacks(this.inventory);}

  blockAttack(agent){
    if(!(agent.guardUntil>this.time))return false;
    agent.guardUntil=0;
    agent.guardFlashUntil=this.time+.4;
    this.guardBlocks++;
    return true;
  }

  damage(agent,source,amount){
    if(agent.launch||agent.health===0||this.blockAttack(agent))return 'blocked';
    const health=agent.health??PURSUER_HEALTH;
    agent.health=Math.max(0,health-amount);
    const down=agent.health===0;
    if(down){
      agent.downUntil=this.time+1.7;
      agent.fallDuration=1.7;
      agent.stunUntil=agent.downUntil;
      agent.repelUntil=0;
      agent.speed=0;
      agent.tucking=false;
    }
    this.hits.push({agent,source,damage:health-agent.health,down});
    return down?'down':'hit';
  }

  kickHit(agent,player){
    const result=this.damage(agent,'kick',KICK_DAMAGE);
    if(result==='hit')this.repel(agent,player,.55,16,.20);
    if(result!=='blocked')this.contact=0;
    return result;
  }

  get captureRemaining(){
    return this.contact > 0 ? this.health/this.damageRate : null;
  }

  heal(amount){
    const restored=Math.min(MAX_HEALTH-this.health,amount);
    this.health+=restored;
    return restored;
  }

  evadeLanding(event){
    if(event?.type==='land'&&event.quality==='clean'&&event.airTime>=.35){
      this.evadeUntil=this.time+.35;
      this.contact=0;
      return this.heal(event.rotation>=180||event.grab?20:12);
    }
    return 0;
  }

  reinforcement(player,progress,offscreen,surface){
    const heading=player.heading,ground=surface(player.x,player.z);
    const behind=Math.max(0,progress-45-this.agents.length*12);
    const candidates=[
      ...[-5,5,0].map(offset=>routePoint(this.route,behind,offset)),
      ...[-.65,.65,0,-1.2,1.2].map(angle=>({
        x:player.x-Math.sin(heading+angle)*32,
        z:player.z-Math.cos(heading+angle)*32,
        heading:heading+angle,
      })),
      ...[-7,7,0].map(offset=>routePoint(this.route,progress+46,offset)),
    ];
    return candidates.find(point=>{
      const gap=range(point,player);
      return gap>=26&&gap<=105&&this.agents.every(agent=>range(agent,point)>9)&&
        offscreen(point)&&this.clear(point)&&Math.abs(surface(point.x,point.z)-ground)<gap*.65+3;
    });
  }

  repel(agent,player,duration,speed,pushTime){
    const dx=agent.x-player.x,dz=agent.z-player.z;
    agent.fallDuration=0;
    agent.tucking=false;
    agent.repelHeading=Math.hypot(dx,dz)>.1?Math.atan2(dx,dz):player.heading+Math.PI;
    agent.repelUntil=this.time+pushTime;
    agent.stunUntil=this.time+duration;
    agent.repelSpeed=speed;
    agent.speed=0;
    agent.aimAt=0;
  }

  addStar(){
    this.stars=Math.min(5,this.stars+1);
    this.peakStars=Math.max(this.peakStars,this.stars);
    this.lastSeen=this.time;
  }

  incident(){
    if(this.outcome||this.time<this.nextIncident)return;
    this.nextIncident=this.time+5;
    this.addStar();
  }

  use(player,slot=0){
    const type=this.stacks[slot]?.type;
    if(!type||this.outcome||player.crashRemaining)return false;
    this.inventory.splice(this.inventory.lastIndexOf(type),1);
    const bonus=upgradeBonus(this.itemUpgrades,type);
    const {x,z,heading}=player;
    const travel=Math.hypot(player.vx,player.vz)>2?Math.atan2(player.vx,player.vz):heading;
    const behind=(distance,offset=0)=>({x:x-Math.sin(travel)*distance+Math.cos(travel)*offset,
      z:z-Math.cos(travel)*distance-Math.sin(travel)*offset});
    if(type==='banana'){
      const spots=Array.from({length:1+bonus},(_,i)=>[(i+1)*3,bonus?1.55*(i%2?1:-1):0]);
      for(const [distance,offset] of spots){
        const point=[behind(distance,offset),behind(distance*.55,offset),{x,z}].find(this.clear)??{x,z};
        this.traps.push({...point,until:this.time+PATROL_ITEMS.banana.duration});
      }
    }else if(type==='avalanche'||type==='snowball'){
      const icy=type==='snowball';
      const offsets=icy?Array.from({length:1+bonus},(_,i)=>6*i-3*bonus):[0];
      const frozen=icy?new Set():null;
      for(const offset of offsets){
        const end=[behind(icy?14:9,offset),behind(6,offset),behind(3),{x,z}].find(this.clear)??{x,z};
        this.bombs.push({type,x,z,end,start:this.time,until:this.time+(icy?.26:.35),
          height:player.airborne?Math.max(0,player.airClearance||0):0,
          radius:icy?12:AVALANCHE_RADIUS+4+bonus,heading:travel,frozen});
      }
    }else{
      const duration=PATROL_ITEMS[type].duration+(type==='pulse'?0:bonus);
      const side=player.turn<0?1:-1;
      const center=type==='decoy'
        ?[behind(4,12*side),behind(4,-12*side),behind(5)].find(this.clear)??{x,z}
        :{x,z};
      const effect={type,start:this.time,until:this.time+duration,duration,...center,heading};
      if(type==='pulse')this.waves.push({...effect,radius:PATROL_ITEMS.pulse.radius+bonus,hit:new Set()});
      else{
        if(type!=='decoy'&&this.effects[type])effect.until=this.effects[type].until+duration;
        this.effects[type]=effect;
      }
      if(type==='shield')this.contact=0;
    }
    return true;
  }

  freezeNearest(blast,frozen,surface){
    const ground=surface(blast.x,blast.z);
    let nearest=null,gap=blast.radius;
    for(const agent of this.agents){
      if(agent.launch||agent.health===0||frozen.has(agent))continue;
      const distance=range(agent,blast);
      if(distance>gap||Math.abs(surface(agent.x,agent.z)-ground)>=8)continue;
      nearest=agent;
      gap=distance;
    }
    if(!nearest)return;
    frozen.add(nearest);
    if(this.blockAttack(nearest))return;
    nearest.slowUntil=this.time+3.2;
    nearest.freezeUntil=this.time+.9;
    nearest.speed*=.28;
    nearest.tucking=false;
    this.iceHits++;
  }

  searchThroughMist(agent,mist){
    if(agent.mistSearch?.cloud!==mist){
      const lastSeen=agent.lastTarget??mist;
      const dx=mist.x-agent.x,dz=mist.z-agent.z,distance=Math.hypot(dx,dz);
      const heading=distance>.1?Math.atan2(dx,dz):mist.heading;
      const radius=PATROL_ITEMS.mist.radius;
      const side=(agent.id??0)%4<2?1:-1;
      const flank=(forward,lateral)=>({
        x:mist.x+Math.sin(heading)*forward+Math.cos(heading)*lateral,
        z:mist.z+Math.cos(heading)*forward-Math.sin(heading)*lateral,
      });
      const detour=(agent.id??0)%2===1&&distance>radius+4
        ? [side,-side].map(sign=>flank(1,sign*(radius+6))).find(this.clear)
        : null;
      const exit=detour?{x:detour.x+Math.sin(heading)*radius,z:detour.z+Math.cos(heading)*radius}
        :flank(radius+5,side*3);
      agent.mistSearch={cloud:mist,waypoint:detour??lastSeen,detour:Boolean(detour),exit:this.clear(exit)?exit:null};
    }
    const search=agent.mistSearch;
    if(range(agent,search.waypoint)<5&&search.exit){
      search.waypoint=search.exit;
      search.exit=null;
    }
    return search.waypoint;
  }

  boost(player,dt){
    if(!this.effects.boost||player.crashRemaining)return;
    const gain=Math.min(22*dt,Math.max(0,PHYSICS.maxHorizontalSpeed-Math.hypot(player.vx,player.vz)));
    player.vx+=Math.sin(player.heading)*gain;
    player.vz+=Math.cos(player.heading)*gain;
    player.speed=Math.hypot(player.vx,player.vz);
  }

  step(dt,player,offscreen=()=>true,surface=()=>0,collision=()=>null,detonate=()=>null){
    if(this.outcome)return null;
    this.trips=[];
    this.shieldHits=0;
    this.iceHits=0;
    this.time+=dt;
    const activeMist=this.effects.mist?.until>this.time?this.effects.mist:null;
    if(this.stars>=2){
      for(const agent of this.agents){
        const gap=range(agent,player);
        if(agent.id%3===1&&!agent.guardUsed&&!agent.launch&&agent.health!==0&&!(agent.stunUntil>this.time)&&
          gap<=21&&!fogBlocks(activeMist,agent,player)&&Math.abs(surface(agent.x,agent.z)-surface(player.x,player.z))<8){
          agent.guardUsed=true;
          agent.guardUntil=this.time+GUARD_DURATION;
        }
      }
    }
    this.traps=this.traps.filter(trap=>this.time<trap.until);
    this.blasts=this.blasts.filter(blast=>this.time<blast.until);
    for(let i=0;i<this.bombs.length;){
      const bomb=this.bombs[i];
      if(this.time<bomb.until){i++;continue;}
      this.bombs.splice(i,1);
      const duration=PATROL_ITEMS[bomb.type].duration;
      const blast={...bomb.end,type:bomb.type,heading:bomb.heading,radius:bomb.radius,start:this.time,
        until:this.time+duration,duration};
      this.blasts.push(blast);
      if(bomb.type==='snowball')this.freezeNearest(blast,bomb.frozen,surface);
      const hit=detonate(blast);
      if(hit&&this.agents.some(agent=>hit.has(agent)))this.contact=0;
    }
    for(const wave of this.waves){
      const radius=wave.radius*clamp((this.time-wave.start)/wave.duration,0,1);
      for(const agent of this.agents){
        const gap=range(agent,wave);
        if(agent.launch||wave.hit.has(agent)||gap>radius||
          Math.abs(surface(agent.x,agent.z)-surface(wave.x,wave.z))>7+gap*.4)continue;
        wave.hit.add(agent);
        const result=this.damage(agent,'pulse',PATROL_ITEMS.pulse.damage);
        if(result==='blocked')continue;
        if(result==='hit')this.repel(agent,wave,1.05,36,wave.duration);
        if(range(agent,player)<=CAPTURE_RADIUS)this.contact=0;
      }
    }
    this.waves=this.waves.filter(wave=>this.time<wave.until);
    for(const [type,effect] of Object.entries(this.effects)){
      if(this.time>=effect.until){
        if(type==='decoy')for(const agent of this.agents)agent.aimAt=0;
        delete this.effects[type];
      }
    }
    const along=nearestOnRoute(player,this.route.points);
    const previous=this.furthest;
    if(along.distance<58)this.furthest=Math.max(previous,along.progress);
    for(let i=this.agents.length-1;i>=0;i--){
      const agent=this.agents[i];
      if(agent.launch?.finished||!agent.launch&&agent.downUntil<=this.time){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+REPLACEMENT_DELAY);
      }else if(!agent.launch&&range(agent,player)>145&&offscreen(agent)){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+.65);
      }
    }
    if(!this.stars&&this.furthest>this.rearmAt)this.addStar();
    for(const fraction of [.24,.44,.64,.81]){
      const marker=this.route.length*fraction;
      if(previous<marker&&this.furthest>=marker)this.addStar();
    }

    const mist=activeMist;
    const concealed=mist&&range(mist,player)<PATROL_ITEMS.mist.radius;
    const desired=this.stars?Math.min(MAX_PURSUERS,this.stars+2):0;
    if(!concealed&&this.agents.length<desired&&this.time>=this.spawnAfter){
      const point=this.reinforcement(player,along.progress,offscreen,surface);
      this.spawnAfter=this.time+(point?2.25:.45);
      if(point){
        this.agents.push({...point,speed:Math.max(9,player.speed*.85),bank:0,id:this.nextAgent++,health:PURSUER_HEALTH});
        this.lastSeen=this.time;
      }
    }

    const lure=this.effects.decoy;
    const shield=Boolean(this.effects.shield);
    const dash=this.dash;
    if(dash&&(this.time>=dash.until||shield||fogBlocks(mist,dash.agent,player)||lure||dash.agent.launch||
      dash.agent.stunUntil>this.time||dash.agent.slowUntil>this.time||!this.agents.includes(dash.agent)))this.dash=null;
    if(!this.dash&&this.stars>=3&&this.time>=this.nextDash&&!shield&&!lure){
      const agent=this.agents.find(agent=>{
        const gap=range(agent,player);
        return gap>=7&&gap<=25&&!fogBlocks(mist,agent,player)&&!agent.launch&&!(agent.stunUntil>this.time)&&!(agent.slowUntil>this.time)&&
          Math.abs(surface(agent.x,agent.z)-surface(player.x,player.z))<8;
      });
      if(agent){
        const at=this.time+DASH_WARNING;
        this.dash={agent,at,until:at+DASH_DURATION};
        this.nextDash=this.time+8;
      }
    }
    let threat=Infinity,contactDistance=Infinity;
    const playerHeight=surface(player.x,player.z);
    for(const agent of this.agents){
      if(agent.launch||agent.health===0)continue;
      const separation=range(agent,player);
      if(shield&&separation<=PATROL_ITEMS.shield.radius&&(agent.stunUntil??0)<=this.time&&
        Math.abs(surface(agent.x,agent.z)-playerHeight)<2){
        this.repel(agent,player,.55,32,.28);
        this.shieldHits++;
      }
      if(agent.stunUntil>this.time){
        if(agent.repelUntil>this.time){
          const sliding=agent.fallDuration>0;
          const factor=sliding?clamp((agent.repelUntil-this.time)/TRIP_SLIDE,0,1):1;
          const step=(agent.repelSpeed||16)*dt*factor;
          const point={x:agent.x+Math.sin(agent.repelHeading)*step,z:agent.z+Math.cos(agent.repelHeading)*step};
          if(this.clear(point))Object.assign(agent,point);
        }
        agent.bank*=Math.exp(-dt*8);
        continue;
      }
      const onRoute=along.distance<24&&separation>32?nearestOnRoute(agent,this.route.points):null;
      const following=onRoute&&onRoute.distance<24&&along.progress>onRoute.progress+12;
      const lureDistance=lure?range(agent,lure):Infinity;
      const distracted=lureDistance<=PATROL_ITEMS.decoy.radius;
      const id=agent.id??0;
      const slowed=agent.slowUntil>this.time;
      const fogged=Boolean(mist&&range(mist,agent)<PATROL_ITEMS.mist.radius);
      const lost=fogBlocks(mist,agent,player);
      agent.fogSlowed=fogged;
      if(!lost){
        agent.lastTarget??={};
        Object.assign(agent.lastTarget,{x:player.x,z:player.z});
        if(agent.mistSearch)agent.aimAt=0;
        agent.mistSearch=null;
      }
      const enableTuck=!lost&&!fogged&&!distracted&&!slowed&&separation>(agent.tucking?21:36);
      if(this.time>=(agent.gapCheckAt??0)){
        agent.losingGround=agent.previousGap===undefined||separation>=agent.previousGap-2;
        agent.previousGap=separation;
        agent.gapCheckAt=this.time+.65;
      }
      if(!lost&&this.time>=(agent.aimAt??0)){
        const lane=Math.sin(id*2.4+this.time*.7)*(3+Math.min(5,agent.speed*.16))*clamp(separation/26,.18,1);
        const lookAhead=enableTuck?32:22;
        const target=distracted?lure:following?routePoint(this.route,onRoute.progress+lookAhead,enableTuck?lane*.35:lane):{
          x:player.x+Math.cos(player.heading)*lane,z:player.z-Math.sin(player.heading)*lane,
        };
        agent.aim=target;
        agent.aimAt=this.time+.30+(id%3)*.09;
      }
      const target=distracted?lure:lost?this.searchThroughMist(agent,mist):agent.aim;
      const dx=target.x-agent.x,dz=target.z-agent.z;
      const aim=Math.atan2(dx,dz);
      const delta=turnAngle(agent.heading,aim);
      const charging=this.dash?.agent===agent&&this.time>=this.dash.at;
      const probe={x:agent.x+Math.sin(agent.heading)*9,z:agent.z+Math.cos(agent.heading)*9};
      const downhill=surface(agent.x,agent.z)-surface(probe.x,probe.z);
      agent.tucking=enableTuck&&(agent.losingGround||agent.tucking)&&
        downhill>.5&&Math.abs(delta)<(agent.tucking?.58:.36)&&this.clear(probe);
      const normal=clamp(4+this.stars*1.45+player.speed*.78,12,49);
      const tuckedPace=clamp(Math.max(normal+11,player.speed+6)+downhill,24,60);
      const cruise=distracted?(lureDistance<7?0:12)
        :slowed?Math.min(normal*.32,9):charging?Math.min(54,normal+12):agent.tucking?tuckedPace:normal;
      const turningAround=lost&&agent.mistSearch?.detour&&!distracted&&Math.abs(delta)>.32;
      const pace=fogged?Math.min(cruise*.42,10):turningAround?Math.min(cruise,14)
        :lost&&range(agent,target)<3?3:cruise;
      agent.speed+=(pace-agent.speed)*Math.min(1,dt*(distracted?9:fogged||turningAround?6:agent.tucking?2.5:1.7));
      const step=agent.speed*dt;
      const turnRate=distracted?3.5:agent.tucking?.63:Math.min(1.6,Math.max(5,agent.speed)/16);
      const heading=agent.heading+clamp(delta,-dt*turnRate,dt*turnRate);
      const point={x:agent.x+Math.sin(heading)*step,z:agent.z+Math.cos(heading)*step};
      const trapIndex=this.traps.findIndex(trap=>sweptContact(agent,point,trap,TRAP_RADIUS)&&
        Math.abs(surface(trap.x,trap.z)-surface(point.x,point.z))<2);
      const trap=trapIndex>=0?this.traps.splice(trapIndex,1)[0]:null;
      const tripped=trap&&!this.blockAttack(agent);
      if(tripped){
        this.trips.push({trap,agent});
        if(this.dash?.agent===agent)this.dash=null;
      }
      const hit=tripped||step>0&&collision(agent,point);
      if(hit){
        if(tripped)Object.assign(agent,point);
        agent.tucking=false;
        agent.fallDuration=tripped?TRIP_DURATION:agent.speed>9?2.2:1.2;
        agent.stunUntil=this.time+agent.fallDuration;
        agent.repelUntil=tripped?this.time+TRIP_SLIDE:0;
        agent.repelHeading=heading;
        agent.repelSpeed=Math.min(agent.speed*.52,12);
        agent.aimAt=0;
        agent.speed=0;
        agent.heading=heading+(id%2?-1.15:1.15);
        continue;
      }
      if(this.pathClear(point)){
        agent.bank=clamp(-turnAngle(agent.heading,heading)*19,-.65,.65);
        Object.assign(agent,point,{heading});
      }else{
        agent.heading=heading;
        agent.speed*=.80;
      }
      if(!distracted&&!lost){
        const gap=range(agent,player);
        threat=Math.min(threat,gap);
        if(gap<=CAPTURE_RADIUS&&!(agent.freezeUntil>this.time)&&Math.abs(surface(agent.x,agent.z)-playerHeight)<2)
          contactDistance=Math.min(contactDistance,gap);
      }
    }

    if(threat<75)this.lastSeen=this.time;
    if(this.stars&&this.agents.some(agent=>!agent.launch&&agent.health!==0)&&this.time-this.lastSeen>12){
      this.stars--;
      this.lastSeen=this.time;
      if(!this.stars){
        this.rearmAt=this.furthest+90;
        this.agents=this.agents.filter(agent=>agent.launch);
      }
      else if(this.agents.length>Math.min(MAX_PURSUERS,this.stars+2)){
        const index=this.agents.findLastIndex(agent=>!agent.launch);
        if(index>=0)this.agents.splice(index,1);
      }
    }
    const inReach = this.stars > 0 && contactDistance <= CAPTURE_RADIUS &&
      !player.airborne && this.time>=this.evadeUntil && !shield;
    this.contact = inReach ? this.contact + dt : 0;
    if(inReach){
      this.health=Math.max(0,this.health-this.damageRate*dt);
      this.escapeArmed=true;
    }else if(this.escapeArmed&&this.agents.every(agent=>agent.launch||agent.stunUntil>this.time||range(agent,player)>12)){
      this.escapes++;
      this.escapeArmed=false;
    }
    if(this.health <= 1e-8){
      this.health=0;
      this.outcome = 'caught';
      return 'caught';
    }

    if(!player.airborne&&!player.crashRemaining){
      const medkit=this.pickups.find(p=>p.type==='medkit'&&!p.taken&&range(p,player)<5.5);
      if(medkit&&this.health<MAX_HEALTH){
        medkit.taken=true;
        return this.heal(this.medkitHeal) ? 'medkit' : null;
      }
      let blocked=null;
      for(const pickup of this.pickups){
        if(pickup.type==='medkit'||pickup.taken||range(pickup,player)>=5.5)continue;
        const type=pickup.type==='supply'?this.refillType(pickup.fallback):pickup.type;
        if(type&&canStoreItem(this.inventory,type)){
          pickup.taken=true;
          this.inventory.push(type);
          this.lastPickup=type;
          this.blockedPickup=null;
          return 'pickup';
        }
        blocked??=pickup;
      }
      if(blocked&&blocked!==this.blockedPickup){
        this.blockedPickup=blocked;
        return 'pickup-full';
      }
      if(blocked)return null;
    }
    this.blockedPickup=null;
    return null;
  }

  refillType(fallback){
    const stacks=this.stacks;
    const partial=stacks.reduce((best,stack)=>stack.type!=='avalanche'&&stack.count<ITEM_STACK_LIMIT&&
      (!best||stack.count<best.count)?stack:best,null);
    return partial?.type??[fallback,...Object.keys(PATROL_ITEMS)]
      .find(type=>type&&type!=='avalanche'&&canStoreItem(this.inventory,type));
  }
}
