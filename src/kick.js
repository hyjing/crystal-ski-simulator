import {clamp} from './physics.js';

export const KICK_RANGE = 3.2;
export const AVALANCHE_RADIUS = 20;
export const AVALANCHE_DURATION = .95;
const COOLDOWN = 5;
const WINDUP = .16;
const FLIGHT = .86;
const SETTLE = .22;
const position = target => target.point ?? target;
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

export class SkierKick {
  constructor(surface,clear) {
    this.surface=surface;
    this.clear=clear;
    this.reset();
  }

  reset() {
    if(this.action?.flight) delete this.action.target.launch;
    for(const target of this.burstTargets??[])delete target.launch;
    this.burstTargets=new Set();
    this.time=0;
    this.readyAt=0;
    this.action=null;
  }

  get cooldown(){return Math.max(0,this.readyAt-this.time);}

  get pose(){
    if(!this.action)return null;
    const age=this.time-this.action.start;
    if(age>=.57)return null;
    const amount=age<WINDUP?age/WINDUP:Math.max(0,1-(age-WINDUP)/.41);
    return {side:this.action.side,amount:amount*amount*(3-2*amount)};
  }

  inReach(player,point,reach){
    return distance(player,point)<=reach&&
      Math.abs(this.surface(player.x,player.z)-this.surface(point.x,point.z))<1.6;
  }

  start(player,targets){
    if(this.cooldown||player.airborne||player.crashRemaining)return false;
    const target=targets.filter(agent=>!agent.launch&&this.inReach(player,position(agent),KICK_RANGE))
      .sort((a,b)=>distance(position(a),player)-distance(position(b),player))[0];
    if(!target)return false;
    const point=position(target);
    const across=(point.x-player.x)*Math.cos(player.heading)-(point.z-player.z)*Math.sin(player.heading);
    this.action={target,start:this.time,side:across<0?-1:1,resolved:false};
    this.readyAt=this.time+COOLDOWN;
    return true;
  }

  launch(target,heading,reach=14,lift=3.8,duration=FLIGHT){
    const {x,z}=position(target),start={x,z};
    const end=[1,.8,.58,.36].map(scale=>({
      x:x+Math.sin(heading)*reach*scale,z:z+Math.cos(heading)*reach*scale,
    })).find(this.clear)??start;
    return target.launch={start,end,x,z,fromY:this.surface(x,z),
      toY:this.surface(end.x,end.z),heading,at:this.time,progress:0,height:0,lift,duration};
  }

  avalanche(player,targets){
    const ground=this.surface(player.x,player.z);
    const hit=new Set();
    for(const target of targets){
      const point=position(target),range=distance(point,player);
      if(target.launch||range>AVALANCHE_RADIUS||
        Math.abs(this.surface(point.x,point.z)-ground)>10)continue;
      const force=1-range/AVALANCHE_RADIUS;
      const heading=range>.1?Math.atan2(point.x-player.x,point.z-player.z):player.heading;
      this.launch(target,heading,12+force*10,3.5+force*2.5,1.05);
      this.burstTargets.add(target);
      hit.add(target);
    }
    return hit;
  }

  step(dt,player,eligible,onBurstLand=()=>{}){
    this.time+=dt;
    for(const target of this.burstTargets){
      const flight=target.launch;
      if(flight&&this.advanceFlight(flight))onBurstLand(flight);
      if(!flight||flight.finished)this.burstTargets.delete(target);
    }
    const action=this.action;
    if(!action)return null;
    const {target,side}=action;
    if(!action.resolved&&this.time-action.start>=WINDUP){
      action.resolved=true;
      const point=position(target);
      if(player.airborne||player.crashRemaining||!eligible(target)||!this.inReach(player,point,KICK_RANGE+.5)){
        return {type:'miss'};
      }
      const dx=point.x-player.x,dz=point.z-player.z,r=Math.hypot(dx,dz);
      const heading=r>.1?Math.atan2(dx+Math.cos(player.heading)*side*r*.7,
        dz-Math.sin(player.heading)*side*r*.7):player.heading+side*Math.PI/2;
      action.flight=this.launch(target,heading);
      return {type:'hit',target,flight:action.flight};
    }
    const flight=action.flight;
    return flight&&this.advanceFlight(flight)?{type:'land',flight}:null;
  }

  advanceFlight(flight){
    if(flight.finished)return false;
    const age=this.time-flight.at;
    const wasAirborne=flight.progress<1;
    const t=flight.progress=clamp(age/flight.duration,0,1);
    const travel=1-Math.pow(1-t,1.35);
    flight.x=flight.start.x+(flight.end.x-flight.start.x)*travel;
    flight.z=flight.start.z+(flight.end.z-flight.start.z)*travel;
    const arcY=flight.fromY+(flight.toY-flight.fromY)*travel+4*flight.lift*t*(1-t);
    flight.height=Math.max(0,arcY-this.surface(flight.x,flight.z));
    flight.finished=age>=flight.duration+SETTLE;
    return wasAirborne&&t===1;
  }
}

export function poseKickedSkier(actor,flight,surface){
  const t=flight.progress,spin=1-(1-t)*(1-t);
  actor.position.set(flight.x,surface(flight.x,flight.z)+flight.height,flight.z);
  actor.rotation.set(spin*2*Math.PI+1.28*t,flight.heading,t*1.6,'YXZ');
}
