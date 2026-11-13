import {clamp, nearestOnRoute} from './physics.js';
import {pointAlongRoute} from './terrain.js';

export const PATROL_ROUTE_ID = 'crystal-patrol-descent';
const CAPTURE_RADIUS = 5;
const CAPTURE_SECONDS = 3;
const KICK_COOLDOWN = 5;
const KICK_RANGE = 3.2;
export const PATROL_ITEMS = {
  boost: {name: '加速充能', color: '#ffe16d', symbol: '»'},
  decoy: {name: '幻影信标', color: '#c9a4ff', symbol: '◇'},
  shield: {name: '护盾', color: '#83dcff', symbol: '+'},
  pulse: {name: '雪浪脉冲', color: '#b0fff0', symbol: '◎'},
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
    this.item = null;
    this.effect = null;
    this.boostEnergy = 0;
    this.nextIncident = 0;
    this.kickReadyAt = 0;
    this.kick = null;
    this.nextAgent = 0;
    const types = ['boost','pulse','decoy','shield'];
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

  get kickCooldown(){
    return Math.max(0,this.kickReadyAt-this.time);
  }

  startKick(player,surface=()=>0){
    if(this.kickCooldown>0||this.outcome||player.airborne||player.crashRemaining)return false;
    const height=surface(player.x,player.z);
    const target=this.agents.filter(agent=>(agent.stunUntil??0)<=this.time)
      .filter(agent=>range(agent,player)<=KICK_RANGE&&Math.abs(surface(agent.x,agent.z)-height)<1.6)
      .sort((a,b)=>range(a,player)-range(b,player))[0];
    if(!target)return false;
    const across=(target.x-player.x)*Math.cos(player.heading)-(target.z-player.z)*Math.sin(player.heading);
    this.kick={target,start:this.time,side:across<0?-1:1,resolved:false};
    this.kickReadyAt=this.time+KICK_COOLDOWN;
    return true;
  }

  get kickPose(){
    if(!this.kick)return null;
    const age=this.time-this.kick.start;
    if(age>=.57)return null;
    const amount=age<.16?age/.16:Math.max(0,1-(age-.16)/.41);
    return {side:this.kick.side,amount:amount*amount*(3-2*amount)};
  }

  repel(agent,player,duration,speed){
    const dx=agent.x-player.x,dz=agent.z-player.z;
    agent.fallDuration=0;
    agent.repelHeading=Math.hypot(dx,dz)>.1?Math.atan2(dx,dz):player.heading+Math.PI;
    agent.repelUntil=this.time+.48;
    agent.stunUntil=this.time+duration;
    agent.repelSpeed=speed;
    agent.speed=0;
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
    if(type==='pulse'){
      const nearby=this.agents.filter(agent=>range(agent,player)<=15);
      if(!nearby.length)return false;
      this.contact=0;
      for(const agent of nearby)this.repel(agent,player,2.4,16);
    }
    this.item=null;
    const duration={boost:2.1,decoy:5,shield:6,pulse:.62}[type];
    this.effect={type,until:this.time+duration,x:player.x,z:player.z};
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

  step(dt,player,offscreen=()=>true,surface=()=>0,collision=()=>null){
    if(this.outcome)return null;
    this.time+=dt;
    const kick=this.kick;
    if(kick&&!kick.resolved&&this.time-kick.start>=.16){
      kick.resolved=true;
      if(!player.airborne&&!player.crashRemaining&&this.agents.includes(kick.target)&&range(kick.target,player)<=KICK_RANGE+.5&&
        Math.abs(surface(kick.target.x,kick.target.z)-surface(player.x,player.z))<1.6){
        this.repel(kick.target,player,1.9,12);
        this.contact=0;
        kick.hit=true;
      }
    }
    if(this.effect&&this.time>=this.effect.until){this.effect=null;this.boostEnergy=0;}
    const along=nearestOnRoute(player,this.route.points);
    const previous=this.furthest;
    if(along.distance<58)this.furthest=Math.max(previous,along.progress);
    for(let i=this.agents.length-1;i>=0;i--){
      const agent=this.agents[i];
      if(range(agent,player)>230&&offscreen(agent)){
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
      this.spawnAfter=this.time+3.5;
      const distance=Math.max(this.route.spawn.distance-12,along.progress-78-this.agents.length*16);
      const point=[-5,5,0].map(offset=>routePoint(this.route,distance,offset)).find(p=>range(p,player)>38&&offscreen(p)&&this.clear(p));
      if(point)this.agents.push({...point,speed:Math.max(9,player.speed*.75),bank:0,id:this.nextAgent++});
    }

    const lure=this.effect?.type==='decoy'?this.effect:null;
    let threat=Infinity,contactDistance=Infinity;
    const playerHeight=surface(player.x,player.z);
    for(const agent of this.agents){
      const separation=range(agent,player);
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
      const distracted=lure&&range(agent,lure)<85;
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
      const pace=distracted&&range(agent,lure)<5?0:clamp(4+this.stars*1.45+player.speed*.78,12,49);
      agent.speed+=(pace-agent.speed)*Math.min(1,dt*1.7);
      const step=agent.speed*dt;
      const turnRate=Math.min(1.6,Math.max(5,agent.speed)/16);
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
      if(this.agents.length>Math.min(5,this.stars+1))this.agents.pop();
      if(!this.stars)this.agents.length=0;
    }
    const inReach = this.stars > 0 && contactDistance <= CAPTURE_RADIUS &&
      !player.airborne && this.effect?.type !== 'shield';
    this.contact = inReach ? this.contact + dt : 0;
    if(this.contact >= CAPTURE_SECONDS - 1e-9){
      this.contact = CAPTURE_SECONDS;
      this.outcome = 'caught';
      return 'caught';
    }

    if(!this.item&&!player.airborne&&!player.crashRemaining){
      const pickup=this.pickups.find(p=>!p.taken&&range(p,player)<5.5);
      if(pickup){pickup.taken=true;this.item=pickup.type;return 'pickup';}
    }
    return null;
  }
}
