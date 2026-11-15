import {clamp} from './physics.js';
import {DEFAULT_TALENTS} from './progression.js';

export const KICK_RANGE = 3.2;
export const AVALANCHE_RADIUS = 20;
export const AVALANCHE_DURATION = .95;
const COOLDOWN = 5;
const WINDUP = .16;
const RECOVERY = .57;
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

  reset(talents=DEFAULT_TALENTS) {
    for(const target of this.flights?.keys()??[])delete target.launch;
    this.flights=new Map();
    this.time=0;
    this.readyAt=0;
    this.recoverAt=0;
    this.charge=0;
    this.baseCooldown=COOLDOWN-(talents.includes('agility')?.75:0);
    this.action=null;
  }

  get cooldown(){return this.charge?0:Math.max(0,this.readyAt-this.time);}
  get ready(){return !this.cooldown&&this.time>=this.recoverAt;}

  chargeLanding(event){
    if(event?.type!=='land'||event.quality!=='clean'||!(event.airTime>=.35))return 0;
    const earned=event.rotation>=180||event.grab?2:1;
    const stored=Math.min(3-this.charge,earned);
    this.charge+=stored;
    return stored;
  }

  get pose(){
    if(!this.action)return null;
    const age=this.time-this.action.start;
    if(age>=RECOVERY)return null;
    const amount=age<WINDUP?age/WINDUP:Math.max(0,1-(age-WINDUP)/(RECOVERY-WINDUP));
    return {side:this.action.side,amount:amount*amount*(3-2*amount)};
  }

  inReach(player,point,reach){
    return distance(player,point)<=reach&&
      Math.abs(this.surface(player.x,player.z)-this.surface(point.x,point.z))<1.6;
  }

  start(player,targets){
    if(!this.ready||player.airborne||player.crashRemaining)return false;
    const target=targets.filter(agent=>!agent.launch&&this.inReach(player,position(agent),KICK_RANGE))
      .sort((a,b)=>distance(position(a),player)-distance(position(b),player))[0];
    if(!target)return false;
    const point=position(target);
    const across=(point.x-player.x)*Math.cos(player.heading)-(point.z-player.z)*Math.sin(player.heading);
    this.action={target,start:this.time,side:across<0?-1:1,resolved:false};
    if(this.charge)this.charge--;
    this.recoverAt=this.time+RECOVERY;
    this.readyAt=this.charge?0:this.time+this.baseCooldown;
    return true;
  }

  launch(target,heading,reach=14,lift=3.8,duration=FLIGHT){
    const {x,z}=position(target),start={x,z};
    const end=[1,.8,.58,.36].map(scale=>({
      x:x+Math.sin(heading)*reach*scale,z:z+Math.cos(heading)*reach*scale,
    })).find(this.clear)??start;
    const flight=target.launch={start,end,x,z,fromY:this.surface(x,z),
      toY:this.surface(end.x,end.z),heading,at:this.time,progress:0,height:0,lift,duration};
    this.flights.set(target,flight);
    return flight;
  }

  avalanche(player,targets,radius=AVALANCHE_RADIUS){
    const ground=this.surface(player.x,player.z);
    const hit=new Set();
    for(const target of targets){
      const point=position(target),range=distance(point,player);
      if(target.launch||range>radius||
        Math.abs(this.surface(point.x,point.z)-ground)>14+range*.35)continue;
      const force=1-range/radius;
      const heading=range>.1?Math.atan2(point.x-player.x,point.z-player.z):player.heading;
      this.launch(target,heading,12+force*10,3.5+force*2.5,1.05);
      hit.add(target);
    }
    return hit;
  }

  step(dt,player,eligible,onLand=()=>{}){
    this.time+=dt;
    for(const [target,flight] of this.flights){
      if(this.advanceFlight(flight))onLand(flight);
      if(flight.finished)this.flights.delete(target);
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
      return {type:'hit',target,flight:this.launch(target,heading)};
    }
    return null;
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
