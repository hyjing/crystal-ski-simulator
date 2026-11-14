import {clamp,nearestOnRoute} from './physics.js';
import {pointAlongRoute} from './terrain.js';

export const LUCKY_SECTORS=[
  {from:360,to:725,width:10,name:'林间窄道',marker:380},
  {from:855,to:1090,width:17,name:'开阔坡肩',marker:920},
  {from:1110,to:1460,width:20,name:'连续落坡',marker:1130},
];

export function luckyWidth(progress){
  let width=13;
  for(const sector of LUCKY_SECTORS){
    const blend=clamp(Math.min(progress-sector.from,sector.to-progress)/42,0,1);
    width+=(sector.width-13)*blend;
  }
  return width;
}

export function luckyShade(progress){
  const grove=LUCKY_SECTORS[0];
  return .22*clamp(Math.min(progress-grove.from,grove.to-progress)/55,0,1);
}

export function routeBranchCandidates(route,terrain){
  const branches=[];
  for(const [a,b] of [[.31,.377],[.49,.558],[.69,.758],[.81,.878]]){
    const lo=route.length*a,hi=route.length*b;
    let best;
    for(const side of [-1,1]){
      const points=[];
      let minGap=Infinity,steepest=0;
      for(let i=0;i<=16;i++){
        const t=i/16,d=lo+(hi-lo)*t,p=pointAlongRoute(route,d);
        const start=pointAlongRoute(route,d-9),end=pointAlongRoute(route,d+9);
        const dx=end.x-start.x,dz=end.z-start.z,n=Math.hypot(dx,dz)||1;
        const offset=side*21*Math.sin(Math.PI*t)**1.8;
        const x=p.x+dz/n*offset,z=p.z-dx/n*offset;
        const y=terrain.surface(x,z);
        const before=points.at(-1);
        if(before)steepest=Math.max(steepest,Math.abs(y-before.y)/Math.max(.1,Math.hypot(x-before.x,z-before.z)));
        if(i>=6&&i<=10)minGap=Math.min(minGap,nearestOnRoute({x,z},route.points).distance);
        points.push({x,z,y});
      }
      const drop=points[0].y-points.at(-1).y;
      if(minGap>=13&&drop>=8&&steepest<.82&&(!best||steepest<best.steepest)){
        best={points,lo,hi,steepest,halfWidth:6,name:'林间支线'};
      }
    }
    if(best)branches.push(best);
    if(branches.length===2)break;
  }
  return branches;
}

export function chaseDirection(player,agents,heading,time){
  let closest=null,distance=48;
  for(const agent of agents){
    if(agent.launch||agent.stunUntil>time)continue;
    const gap=Math.hypot(agent.x-player.x,agent.z-player.z);
    if(gap<distance){closest=agent;distance=gap;}
  }
  if(!closest)return null;
  const angle=heading-Math.atan2(closest.x-player.x,closest.z-player.z);
  const relative=Math.atan2(Math.sin(angle),Math.cos(angle));
  const sector=Math.round(relative/(Math.PI/4));
  const directions=['前方','右前','右侧','右后','后方','左后','左侧','左前'];
  return {label:directions[(sector+8)%8],distance:Math.round(distance),angle:relative};
}
