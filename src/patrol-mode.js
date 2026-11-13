import {clamp, nearestOnRoute} from './physics.js';
import {pointAlongRoute} from './terrain.js';

export const PATROL_ROUTE_ID = 'crystal-patrol-descent';
export const PATROL_ITEMS = {
  boost: {name: '加速充能', color: '#ffe16d', symbol: '»'},
  decoy: {name: '幻影信标', color: '#c9a4ff', symbol: '◇'},
  shield: {name: '护盾', color: '#83dcff', symbol: '+'},
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
  constructor(route, clear) {
    this.route = route;
    this.clear = clear;
    this.time = 0;
    this.stars = 0;
    this.peakStars = 0;
    this.contact = 0;
    this.outcome = '';
    this.furthest = route.spawn.distance;
    this.lastSeen = 0;
    this.spawnAfter = 0;
    this.agents = [];
    this.item = null;
    this.effect = null;
    this.boostEnergy = 0;
    this.nextIncident = 0;
    const types = Object.keys(PATROL_ITEMS);
    this.pickups = [];
    for(let d=route.spawn.distance+115;d<route.length-90;d+=180){
      const side=this.pickups.length%2?1:-1;
      const point=[side*3,-side*3,0].map(offset=>routePoint(route,d,offset)).find(clear);
      if(point)this.pickups.push({...point,type:types[this.pickups.length%types.length],taken:false});
    }
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

  use(player){
    if(!this.item||this.effect||this.outcome||player.crashRemaining||player.airborne)return false;
    const type=this.item;
    this.item=null;
    this.effect={type,until:this.time+(type==='boost'?2.1:type==='decoy'?5:6),x:player.x,z:player.z};
    this.boostEnergy=type==='boost'?7:0;
    if(type==='shield')this.contact=0;
    return true;
  }

  boost(player,dt){
    if(!this.boostEnergy||player.airborne||player.crashRemaining)return;
    const gain=Math.min(this.boostEnergy,3.4*dt,Math.max(0,55-player.speed));
    this.boostEnergy-=gain;
    player.vx+=Math.sin(player.heading)*gain;
    player.vz+=Math.cos(player.heading)*gain;
    player.speed=Math.hypot(player.vx,player.vz);
  }

  step(dt,player,offscreen=()=>true,surface=()=>0){
    if(this.outcome)return null;
    this.time+=dt;
    if(this.effect&&this.time>=this.effect.until){this.effect=null;this.boostEnergy=0;}
    const along=nearestOnRoute(player,this.route.points);
    const previous=this.furthest;
    if(along.distance<58)this.furthest=Math.max(previous,along.progress);
    if(!this.stars&&this.peakStars===0&&this.furthest>this.route.spawn.distance+22)this.addStar();
    for(const fraction of [.24,.44,.64,.81]){
      const marker=this.route.length*fraction;
      if(previous<marker&&this.furthest>=marker)this.addStar();
    }

    const desired=this.stars?Math.min(5,this.stars+1):0;
    if(this.agents.length<desired&&this.time>=this.spawnAfter){
      this.spawnAfter=this.time+3.5;
      const distance=Math.max(this.route.spawn.distance-12,along.progress-78-this.agents.length*16);
      const point=[-5,5,0].map(offset=>routePoint(this.route,distance,offset)).find(p=>range(p,player)>38&&offscreen(p)&&this.clear(p));
      if(point)this.agents.push({...point,speed:Math.max(9,player.speed*.75),bank:0});
    }

    const lure=this.effect?.type==='decoy'?this.effect:null;
    let threat=Infinity,contactDistance=Infinity;
    const playerHeight=surface(player.x,player.z);
    for(const agent of this.agents){
      const separation=range(agent,player);
      const onRoute=along.distance<24&&separation>32?nearestOnRoute(agent,this.route.points):null;
      const following=onRoute&&onRoute.distance<24&&along.progress>onRoute.progress+12;
      const distracted=lure&&range(agent,lure)<85;
      if(!distracted){
        threat=Math.min(threat,separation);
        if(separation<5&&Math.abs(surface(agent.x,agent.z)-playerHeight)<2)
          contactDistance=Math.min(contactDistance,separation);
      }
      const target=distracted?lure:following?routePoint(this.route,onRoute.progress+22):player;
      const dx=target.x-agent.x,dz=target.z-agent.z;
      const aim=Math.atan2(dx,dz);
      const delta=turnAngle(agent.heading,aim);
      const pace=distracted&&range(agent,lure)<5?0:clamp(4+this.stars*1.45+player.speed*.78,12,49);
      agent.speed+=(pace-agent.speed)*Math.min(1,dt*1.7);
      const step=agent.speed*dt;
      const heading=agent.heading+clamp(delta,-dt*2.6,dt*2.6);
      let moved=false;
      for(const offset of [0,-.43,.43,-.95,.95]){
        const candidate=heading+offset;
        const point={x:agent.x+Math.sin(candidate)*step,z:agent.z+Math.cos(candidate)*step};
        if(!this.clear(point))continue;
        agent.bank=clamp(-turnAngle(agent.heading,candidate)*3,-.65,.65);
        Object.assign(agent,point,{heading:candidate});
        moved=true;
        break;
      }
      if(!moved)agent.speed*=.85;
      if(!distracted&&separation>145&&this.stars&&offscreen(agent)){
        const behind=along.progress-92;
        if(behind>this.route.spawn.distance){
          const point=[5,-5,0].map(offset=>routePoint(this.route,behind,offset)).find(p=>range(p,player)>65&&offscreen(p)&&this.clear(p));
          if(point)Object.assign(agent,point,{speed:Math.max(9,player.speed*.8),bank:0});
        }
      }
    }

    if(threat<75)this.lastSeen=this.time;
    if(this.stars&&this.time-this.lastSeen>12){
      this.stars--;
      this.lastSeen=this.time;
      if(this.agents.length>Math.min(5,this.stars+1))this.agents.pop();
      if(!this.stars)this.agents.length=0;
    }
    if(this.stars&&contactDistance<4.4&&!player.airborne&&this.effect?.type!=='shield'){
      this.contact+=dt*(player.speed<4?1.7:1);
    }else this.contact=Math.max(0,this.contact-dt*1.25);
    if(this.contact>=1.75){this.outcome='caught';return 'caught';}

    if(!this.item&&!player.airborne&&!player.crashRemaining){
      const pickup=this.pickups.find(p=>!p.taken&&range(p,player)<5.5);
      if(pickup){pickup.taken=true;this.item=pickup.type;return 'pickup';}
    }
    return null;
  }
}
