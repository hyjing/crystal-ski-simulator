import {clamp, nearestOnRoute, PHYSICS} from './physics.js';
import {pointAlongRoute} from './terrain.js';
import {AVALANCHE_DURATION} from './kick.js';

export const PATROL_ROUTE_ID = 'crystal-angry-skiers';
export const resolveChaseRoute = id => id === 'crystal-patrol-descent' ? PATROL_ROUTE_ID : id;
export function longestChaseRoute(routes,mountainId){
  const longest=routes.reduce((best,route)=>!best||route.length>best.length?route:best,null);
  return longest&&{...longest,id:`${mountainId}-angry-skiers`,patrolOnly:true,label:'愤怒的雪友 · 长距离'};
}
const CAPTURE_RADIUS = 5;
const CAPTURE_SECONDS = 3;
const REPLACEMENT_DELAY = 1.2;
export const ITEM_CAPACITY = 3;
export const PATROL_ITEMS = {
  boost: {name:'加速充能',color:'#ffe16d',symbol:'»',duration:.85,description:'短时间猛冲，最高额外加速约 55 km/h'},
  decoy: {name:'幻影信标',color:'#c9a4ff',symbol:'◇',duration:2.1,radius:120,description:'120 米内的追赶者立即急刹，转向信标'},
  shield: {name:'护盾',color:'#83dcff',symbol:'+',duration:1.7,radius:6,description:'阻止截停，并弹开靠近的追赶者'},
  pulse: {name:'雪浪脉冲',color:'#b0fff0',symbol:'◎',duration:.32,radius:17,description:'瞬间推开 17 米内的追赶者'},
  avalanche: {name:'雪崩弹',color:'#ff986e',symbol:'✹',duration:AVALANCHE_DURATION,description:'掀飞周围的追赶者和普通雪友'},
};
const range = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
const turnAngle = (a, b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));

function routePoint(route, distance, offset=0) {
  const p = pointAlongRoute(route, clamp(distance,0,route.length));
  const a = route.points[p.segment], b = route.points[p.segment+1];
  const heading = Math.atan2(b.x-a.x,b.z-a.z);
  return {x:p.x+Math.cos(heading)*offset,z:p.z-Math.sin(heading)*offset,heading};
}

export class PatrolRun {
  constructor(route, clear, pathClear=clear) {
    this.route = route;
    this.clear = clear;
    this.pathClear = pathClear;
    this.time = 0;
    this.stars = 0;
    this.peakStars = 0;
    this.contact = 0;
    this.outcome = '';
    this.furthest = route.spawn.distance;
    this.lastSeen = 0;
    this.spawnAfter = 0;
    this.agents = [];
    this.inventory = [];
    this.lastPickup = null;
    this.effect = null;
    this.nextIncident = 0;
    this.nextAgent = 0;
    const types = ['boost','pulse','decoy','shield','avalanche','boost','avalanche'];
    this.pickups = [];
    for(let d=route.spawn.distance+115;d<route.length-90;d+=180){
      const side=this.pickups.length%2?1:-1;
      const point=[side*3,-side*3,0].map(offset=>routePoint(route,d,offset)).find(clear);
      if(point)this.pickups.push({...point,type:types[this.pickups.length%types.length],taken:false});
    }
  }

  get captureRemaining(){
    return this.contact > 0 ? Math.max(0, CAPTURE_SECONDS - this.contact) : null;
  }

  repel(agent,player,duration,speed,pushTime){
    const dx=agent.x-player.x,dz=agent.z-player.z;
    agent.fallDuration=0;
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

  use(player,slot=0,launchAvalanche){
    const type=this.inventory[slot];
    if(!type||this.effect||this.outcome||player.crashRemaining||player.airborne)return false;
    if(type==='avalanche'){
      const hit=launchAvalanche?.();
      if(!hit?.size)return false;
      if(this.agents.some(agent=>hit.has(agent)))this.contact=0;
    }
    if(type==='pulse'){
      const nearby=this.agents.filter(agent=>!agent.launch&&range(agent,player)<=PATROL_ITEMS.pulse.radius);
      if(!nearby.length)return false;
      this.contact=0;
      for(const agent of nearby)this.repel(agent,player,.9,36,PATROL_ITEMS.pulse.duration);
    }
    this.inventory.splice(slot,1);
    const {duration}=PATROL_ITEMS[type];
    this.effect={type,until:this.time+duration,x:player.x,z:player.z};
    if(type==='shield')this.contact=0;
    return true;
  }

  boost(player,dt){
    if(this.effect?.type!=='boost'||player.airborne||player.crashRemaining)return;
    const gain=Math.min(18*dt,Math.max(0,PHYSICS.maxHorizontalSpeed-Math.hypot(player.vx,player.vz)));
    player.vx+=Math.sin(player.heading)*gain;
    player.vz+=Math.cos(player.heading)*gain;
    player.speed=Math.hypot(player.vx,player.vz);
  }

  step(dt,player,offscreen=()=>true,surface=()=>0,collision=()=>null){
    if(this.outcome)return null;
    this.time+=dt;
    if(this.effect&&this.time>=this.effect.until){
      if(this.effect.type==='decoy')for(const agent of this.agents)agent.aimAt=0;
      this.effect=null;
    }
    const along=nearestOnRoute(player,this.route.points);
    const previous=this.furthest;
    if(along.distance<58)this.furthest=Math.max(previous,along.progress);
    for(let i=this.agents.length-1;i>=0;i--){
      const agent=this.agents[i];
      if(agent.launch?.finished){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+REPLACEMENT_DELAY);
      }else if(!agent.launch&&range(agent,player)>230&&offscreen(agent)){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+2.5);
      }
    }
    if(!this.stars&&this.peakStars===0&&this.furthest>this.route.spawn.distance+22)this.addStar();
    for(const fraction of [.24,.44,.64,.81]){
      const marker=this.route.length*fraction;
      if(previous<marker&&this.furthest>=marker)this.addStar();
    }

    const desired=this.stars?Math.min(5,this.stars+1):0;
    if(this.agents.length<desired&&this.time>=this.spawnAfter){
      const distance=Math.max(this.route.spawn.distance-12,along.progress-78-this.agents.length*16);
      const point=[-5,5,0].map(offset=>routePoint(this.route,distance,offset)).find(p=>range(p,player)>38&&offscreen(p)&&this.clear(p));
      this.spawnAfter=this.time+(point?3.5:.5);
      if(point)this.agents.push({...point,speed:Math.max(9,player.speed*.75),bank:0,id:this.nextAgent++});
    }

    const lure=this.effect?.type==='decoy'?this.effect:null;
    const shield=this.effect?.type==='shield';
    let threat=Infinity,contactDistance=Infinity;
    const playerHeight=surface(player.x,player.z);
    for(const agent of this.agents){
      if(agent.launch)continue;
      const separation=range(agent,player);
      if(shield&&separation<=PATROL_ITEMS.shield.radius&&(agent.stunUntil??0)<=this.time&&
        Math.abs(surface(agent.x,agent.z)-playerHeight)<2){
        this.repel(agent,player,.55,32,.28);
      }
      if(agent.stunUntil>this.time){
        if(agent.repelUntil>this.time){
          const step=(agent.repelSpeed||16)*dt;
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
      if(this.time>=(agent.aimAt??0)){
        const lane=Math.sin(id*2.4+this.time*.7)*(3+Math.min(5,agent.speed*.16))*clamp(separation/26,.18,1);
        const target=distracted?lure:following?routePoint(this.route,onRoute.progress+22,lane):{
          x:player.x+Math.cos(player.heading)*lane,z:player.z-Math.sin(player.heading)*lane,
        };
        agent.aim=target;
        agent.aimAt=this.time+.30+(id%3)*.09;
      }
      const target=distracted?lure:agent.aim;
      const dx=target.x-agent.x,dz=target.z-agent.z;
      const aim=Math.atan2(dx,dz);
      const delta=turnAngle(agent.heading,aim);
      const pace=distracted?(lureDistance<7?0:12):clamp(4+this.stars*1.45+player.speed*.78,12,49);
      agent.speed+=(pace-agent.speed)*Math.min(1,dt*(distracted?9:1.7));
      const step=agent.speed*dt;
      const turnRate=distracted?3.5:Math.min(1.6,Math.max(5,agent.speed)/16);
      const heading=agent.heading+clamp(delta,-dt*turnRate,dt*turnRate);
      const point={x:agent.x+Math.sin(heading)*step,z:agent.z+Math.cos(heading)*step};
      const hit=step>0&&collision(agent,point);
      if(hit){
        agent.fallDuration=agent.speed>9?2.2:1.2;
        agent.stunUntil=this.time+agent.fallDuration;
        agent.repelUntil=0;
        agent.aimAt=0;
        agent.speed=0;
        agent.heading+=id%2?-1.15:1.15;
        continue;
      }
      if(this.pathClear(point)){
        agent.bank=clamp(-turnAngle(agent.heading,heading)*19,-.65,.65);
        Object.assign(agent,point,{heading});
      }else{
        agent.heading=heading;
        agent.speed*=.80;
      }
      if(!distracted){
        const gap=range(agent,player);
        threat=Math.min(threat,gap);
        if(gap<=CAPTURE_RADIUS&&Math.abs(surface(agent.x,agent.z)-playerHeight)<2)
          contactDistance=Math.min(contactDistance,gap);
      }
    }

    if(threat<75)this.lastSeen=this.time;
    if(this.stars&&this.time-this.lastSeen>12){
      this.stars--;
      this.lastSeen=this.time;
      if(!this.stars)this.agents=this.agents.filter(agent=>agent.launch);
      else if(this.agents.length>Math.min(5,this.stars+1)){
        const index=this.agents.findLastIndex(agent=>!agent.launch);
        if(index>=0)this.agents.splice(index,1);
      }
    }
    const inReach = this.stars > 0 && contactDistance <= CAPTURE_RADIUS &&
      !player.airborne && this.effect?.type !== 'shield';
    this.contact = inReach ? this.contact + dt : 0;
    if(this.contact >= CAPTURE_SECONDS - 1e-9){
      this.contact = CAPTURE_SECONDS;
      this.outcome = 'caught';
      return 'caught';
    }

    if(this.inventory.length<ITEM_CAPACITY&&!player.airborne&&!player.crashRemaining){
      const pickup=this.pickups.find(p=>!p.taken&&range(p,player)<5.5);
      if(pickup){pickup.taken=true;this.inventory.push(pickup.type);this.lastPickup=pickup.type;return 'pickup';}
    }
    return null;
  }
}
