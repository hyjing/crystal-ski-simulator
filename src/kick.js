import {clamp} from './physics.js';

export const KICK_RANGE = 3.2;
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
    if(this.action?.target.launch) delete this.action.target.launch;
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

  step(dt,player,eligible){
    this.time+=dt;
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
      const start={x:point.x,z:point.z};
      const end=[14,11,8,5].map(d=>({
        x:start.x+Math.sin(heading)*d,z:start.z+Math.cos(heading)*d,
      })).find(this.clear)??start;
      target.launch={start,end,x:start.x,z:start.z,fromY:this.surface(start.x,start.z),
        toY:this.surface(end.x,end.z),heading,at:this.time,progress:0,height:0};
      return {type:'hit',target,flight:target.launch};
    }
    const flight=target.launch;
    if(!flight||flight.finished)return null;
    const age=this.time-flight.at;
    const wasAirborne=flight.progress<1;
    const t=flight.progress=clamp(age/FLIGHT,0,1);
    const travel=1-Math.pow(1-t,1.35);
    flight.x=flight.start.x+(flight.end.x-flight.start.x)*travel;
    flight.z=flight.start.z+(flight.end.z-flight.start.z)*travel;
    const arcY=flight.fromY+(flight.toY-flight.fromY)*travel+15.2*t*(1-t);
    flight.height=Math.max(0,arcY-this.surface(flight.x,flight.z));
    flight.finished=age>=FLIGHT+SETTLE;
    if(wasAirborne&&t===1)return {type:'land',flight};
    return null;
  }
}

export function poseKickedSkier(actor,flight,surface){
  const t=flight.progress,spin=1-(1-t)*(1-t);
  actor.position.set(flight.x,surface(flight.x,flight.z)+flight.height,flight.z);
  actor.rotation.set(spin*2*Math.PI+1.28*t,flight.heading,t*1.6,'YXZ');
}
