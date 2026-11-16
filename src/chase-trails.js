import {sweptContact} from './traffic-brain.js';

export const CHASE_TRAILS={
  flametrail:{name:'烈焰滑痕',color:'#ff6a27',symbol:'♨',duration:3.8,linger:4.5,radius:2.9,damage:8,
    description:'沿雪板留下火焰。踩中的雪友在 2.5 秒内持续受伤；碰到挂霜目标时触发融裂'},
  frosttrail:{name:'霜冻滑痕',color:'#68dcff',symbol:'❄',duration:4.2,linger:5.5,radius:3.2,damage:10,
    description:'留下一道冰带。踩中扣 10 点血、减速并挂霜，可接火焰触发融裂'},
  miragetrail:{name:'幻光滑痕',color:'#c08aff',symbol:'◇',duration:3.8,linger:5,radius:3,damage:9,
    description:'使踩中的追赶者偏离路线并扣 9 点血。趁他迷向，用雪浪或雪弹炮追击可触发破幻'},
};
const SPACING=2.6,MAX_SEGMENTS=192;

export function layTrails(segments,effects,player,time){
  const live=segments.filter(segment=>segment.until>time);
  const {x,z}=player;
  for(const [type,item] of Object.entries(CHASE_TRAILS)){
    const effect=effects[type];
    if(!effect)continue;
    const last=effect.last,dx=x-last.x,dz=z-last.z,gap=Math.hypot(dx,dz);
    if(player.airborne||player.crashRemaining||gap>14){effect.last={x,z};continue;}
    const count=Math.floor(gap/SPACING);
    const heading=Math.atan2(dx,dz);
    for(let i=1;i<=count;i++){
      const progress=i*SPACING/gap,x2=last.x+dx*progress,z2=last.z+dz*progress;
      const a=effect.last,b={x:x2,z:z2};
      live.push({type,a,b,x:(a.x+b.x)/2,z:(a.z+b.z)/2,heading,radius:item.radius,
        start:time,until:time+effect.linger,damage:item.damage+effect.extra});
      effect.last=b;
    }
  }
  return live.length>MAX_SEGMENTS?live.slice(-MAX_SEGMENTS):live;
}

export function trailContact(segments,agent,next,surface){
  const contacts={};
  for(let i=segments.length-1;i>=0;i--){
    const segment=segments[i];
    if(contacts[segment.type]||!sweptContact(agent,next,segment,segment.radius))continue;
    if(Math.abs(surface(segment.x,segment.z)-surface(agent.x,agent.z))>3.3)continue;
    contacts[segment.type]=segment;
  }
  return contacts;
}
