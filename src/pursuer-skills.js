import {sweptContact} from './traffic-brain.js';
import {clamp} from './physics.js';

export const PURSUER_SKILLS={
  ice:{warning:'冰带手准备横切',active:'冰带已铺开',color:'#73dcff',windup:.9,duration:.28},
  escort:{warning:'护航手准备支援',active:'护航盾已连接',color:'#83dcff',windup:.65,duration:.3},
  snowball:{warning:'雪团即将落下',active:'雪团飞来',color:'#f0f7ff',windup:.65,duration:.42},
  laser:{warning:'激光炮正在瞄准',active:'激光持续扫射',color:'#ff7498',windup:1.05,duration:2.15},
};
const range=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const laserRange=66;
const laserDamagePerSecond=28;
export const pursuerLaserOrigin=(agent,surface)=>({x:agent.x,z:agent.z,y:agent.flightY??(surface(agent.x,agent.z)+1.25)});
const height=(player,surface)=>surface(player.x,player.z)+(player.airborne?player.airClearance??0:0)+.95;

function firingLine(from,to,surface){
  for(let i=1;i<8;i++){
    const t=i/8,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
    if(surface(x,z)>from.y+(to.y-from.y)*t-.16)return false;
  }
  return true;
}

function beamHits(from,to,player,surface){
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
  const x=player.x-from.x,y=height(player,surface)-from.y,z=player.z-from.z;
  const t=clamp((x*dx+y*dy+z*dz)/Math.max(.001,dx*dx+dy*dy+dz*dz),0,1);
  return Math.hypot(x-dx*t,y-dy*t,z-dz*t)<1.6;
}

export function planPursuerSkill(run,agent,player,surface){
  const kind=agent.role,config=PURSUER_SKILLS[kind];
  if(!config||run.stars<(kind==='laser'?4:3))return null;
  const gap=range(agent,player);
  if(kind==='escort'){
    const target=run.agents.filter(other=>other!==agent&&!other.launch&&other.mount!=='helicopter'&&other.health!==0&&
      !(other.guardUntil>run.time)&&!(other.stunUntil>run.time)&&range(agent,other)<20&&
      Math.abs(surface(agent.x,agent.z)-surface(other.x,other.z))<6)
      .sort((a,b)=>range(a,player)-range(b,player))[0];
    return target&&gap<38?{kind,target}:null;
  }
  if(gap<(kind==='laser'?18:10)||gap>(kind==='laser'?52:kind==='ice'?30:45))return null;
  const heading=Math.hypot(player.vx,player.vz)>1?Math.atan2(player.vx,player.vz):player.heading;
  const ahead=kind==='ice'?clamp(player.speed*1.1,9,28):clamp(player.speed*(kind==='laser'?1.02:1.05),0,38);
  const point={x:player.x+Math.sin(heading)*ahead,z:player.z+Math.cos(heading)*ahead};
  if(kind==='ice'){
    const lateral=(agent.x-player.x)*Math.cos(heading)-(agent.z-player.z)*Math.sin(heading);
    if(Math.abs(lateral)<5)return null;
    return run.pathClear(point)?{kind,point,heading:heading+Math.sign(lateral)*Math.PI*.5}:null;
  }
  if(kind==='laser'){
    point.y=surface(point.x,point.z)+.95;
    const from=pursuerLaserOrigin(agent,surface);
    if(range(from,point)>laserRange||!firingLine(from,point,surface))return null;
  }else if(!run.pathClear(point))return null;
  return {kind,point,heading};
}

function shot(run,kind,from,end,delay,result){
  const start=run.time+delay;
  run.shots.push({...from,end,kind,start,impact:start+.07,until:start+.32,result});
}

export function resolvePursuerSkill(run,skill,surface){
  const {kind,agent,point,target}=skill,time=run.time;
  if(kind==='escort'){
    if(!run.agents.includes(target)||target.launch||target.health===0||target.guardUntil>time||range(agent,target)>=25)return;
    target.guardUntil=time+2.4;
    target.escort=agent;
  }else if(kind==='ice'){
    const segments=[],until=time+3.2;
    const dx=Math.sin(skill.heading)*2.6,dz=Math.cos(skill.heading)*2.6;
    for(let i=-2;i<=2;i++){
      const x=point.x+i*dx,z=point.z+i*dz;
      if(!run.pathClear({x,z}))continue;
      segments.push({type:'frosttrail',x,z,heading:skill.heading,until,
        a:{x:x-dx*.5,z:z-dz*.5},b:{x:x+dx*.5,z:z+dz*.5}});
    }
    if(segments.length)run.enemyIce.push({segments,until,hit:false});
  }else if(kind==='snowball'){
    run.snowballs.push({from:{x:agent.x,z:agent.z,y:surface(agent.x,agent.z)+1.3},point,
      start:time,impact:time+.42,until:time+.68});
  }
}

export function sweepPursuerLaser(run,skill,player,surface,shield,dt){
  const active=Math.max(0,Math.min(run.time,skill.until)-Math.max(run.time-dt,skill.at));
  if(!active)return;
  const {agent,point,heading}=skill;
  const fx=Math.sin(heading),fz=Math.cos(heading);
  // Lead can advance down the ski line, but lateral turret travel is deliberately slow.
  const tx=player.x+(player.vx||0)*.14-point.x,tz=player.z+(player.vz||0)*.14-point.z;
  const along=clamp(tx*fx+tz*fz,-14*active,36*active);
  const across=clamp(tx*fz-tz*fx,-3.8*active,3.8*active);
  point.x+=fx*along+fz*across;
  point.z+=fz*along-fx*across;
  point.y=surface(point.x,point.z)+.95;
  const from=pursuerLaserOrigin(agent,surface);
  if(range(from,point)>laserRange||!firingLine(from,point,surface))return;
  const playerPoint={x:player.x,z:player.z,y:height(player,surface)};
  const contact=!player.crashRemaining&&beamHits(from,point,player,surface);
  run.laserBeam={...from,end:contact?playerPoint:{...point},kind:'laser',result:contact?(shield?'reflected':'hit'):'miss'};
  if(!contact)return;
  if(!shield){
    run.health=Math.max(0,run.health-laserDamagePerSecond*active);
  }else{
    if(!skill.reflected){
      skill.reflected=true;
      shield.reflectedAt=run.time;
      const result=run.damage(agent,'shield',38);
      if(result!=='blocked')run.hits.at(-1).combo='激光反射';
      shot(run,'reflection',playerPoint,from,.055,result);
    }
    run.reflectedBeam={...playerPoint,end:from,kind:'reflection',result:'hit'};
  }
}

export function updatePursuerHazards(run,player,surface,shield,previous){
  run.enemyIce=run.enemyIce.filter(patch=>patch.until>run.time);
  const airborne=Boolean(player.airborne),ground=surface(player.x,player.z);
  if(!airborne&&!shield&&!player.crashRemaining&&range(previous,player)<18){
    for(const patch of run.enemyIce){
      if(patch.hit||!patch.segments.some(p=>sweptContact(previous,player,p,1.55)&&Math.abs(surface(p.x,p.z)-ground)<2))continue;
      patch.hit=true;
      run.slipUntil=run.time+.95;
    }
  }
  run.snowballs=run.snowballs.filter(ball=>ball.until>run.time||!ball.resolved);
  for(const ball of run.snowballs){
    if(ball.resolved||run.time<ball.impact)continue;
    ball.resolved=true;
    const {point}=ball;
    if(shield||airborne||player.crashRemaining||range(point,player)>4.6||Math.abs(surface(point.x,point.z)-ground)>2.5)continue;
    run.health=Math.max(0,run.health-5);
    run.snowSlowUntil=run.time+1.2;
  }
}
