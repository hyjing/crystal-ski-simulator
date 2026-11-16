import {chaseGoal,authoredChaseBranches} from './chase-goals.js';
import {routeBranchCandidates} from './route-experience.js';
import {clamp} from './physics.js';
import {createTerrain,difficultyStyles,pointAlongRoute} from './terrain.js';

const START=-2304, FINISH=2304;
const WIDTH=641, HEIGHT=769, SPACING=8;
const emptyInfrastructure={type:'FeatureCollection',features:[]};
const smooth=(t)=>{const v=clamp(t,0,1);return v*v*(3-2*v);};
const hill=(delta,width)=>Math.exp(-((delta/width)**2));

const trails=[
  {id:'windward-bowl',name:'风脊大道',label:'绿道 · 宽坡直线',difficulty:'easy',
    x:-760,halfWidth:38,top:2350,drop:880,curve:18,rhythm:2,rollers:0},
  {id:'pine-switchbacks',name:'松林折线',label:'蓝道 · 连续弯与林间岔路',difficulty:'intermediate',
    x:0,halfWidth:16,top:2390,drop:1040,curve:98,rhythm:4,rollers:5.5},
  {id:'frost-chute',name:'霜沟',label:'黑道 · 窄沟与连续坡坎',difficulty:'advanced',
    x:740,halfWidth:12,top:2490,drop:1270,curve:31,rhythm:3,rollers:14,walls:17},
  {id:'skyline-park',name:'天际跳台',label:'蓝道 · 三组跳台与长落地区',difficulty:'intermediate',
    x:-1650,halfWidth:29,top:2440,drop:1060,curve:42,rhythm:2,rollers:0,jumps:[.25,.48,.71],gliderAt:.18},
  {id:'blueglass-traverse',name:'蓝冰横切',label:'绿道 · 横切长弯与缓坡',difficulty:'easy',
    x:1520,halfWidth:30,top:2300,drop:820,curve:76,rhythm:1.55,rollers:2,drift:300,camber:3.2},
  {id:'split-basin',name:'双岔盆地',label:'黑道 · 宽窄交替与岔路',difficulty:'advanced',
    x:2170,halfWidth:18,top:2460,drop:1170,curve:95,rhythm:2.65,rollers:6,pinch:7,walls:12},
];

function descent(t){
  const transition=.065;
  if(t<transition)return t*t/(2*transition*(1-transition));
  if(t>1-transition)return 1-descent(1-t);
  return (t-transition/2)/(1-transition);
}

function centerline(trail,t){
  const envelope=smooth(t/.10)*smooth((1-t)/.10);
  return trail.x+(trail.drift??0)*(smooth((t-.12)/.72)-.5)+trail.curve*Math.sin(t*trail.rhythm*2*Math.PI)*envelope;
}

function pisteWidth(trail,t){
  return trail.halfWidth+(trail.pinch??0)*Math.sin(t*8*Math.PI)*smooth(t/.12)*smooth((1-t)/.12);
}

function routeElevation(trail,t){
  let ramps=0;
  for(const center of trail.jumps??[]){
    const distance=(t-center)*(FINISH-START);
    ramps+=12*hill(distance,distance<0?26:19);
  }
  return trail.top-trail.drop*descent(t)+ramps+trail.rollers*
    Math.sin(t*26*Math.PI)*smooth(t/.14)*smooth((1-t)/.14);
}

const skyline=[
  [-5100,3900,2400,1850,1900,.38],[-6800,5200,1900,2100,1610,-.23],
  [-2600,6200,1900,2400,1500,-.31],[-800,7200,1750,2290,1780,.31],
  [1900,7800,2700,2050,2390,.4],[4050,7400,2150,2010,1650,-.40],
  [6700,4800,2300,1700,2080,-.40],[9100,6500,2700,2000,2470,.55],
  [-8400,-1900,2400,2850,2350,.25],[-5000,-4500,2110,1880,2180,-.5],
  [5700,-5700,2480,2130,2500,.38],[12700,8800,3000,2410,3130,-.3],
  [-11500,10200,2450,2510,2770,.20],[3900,13100,2800,3200,2730,.18],
].map(([x,z,height,w,d,angle])=>({x,z,height,w,d,c:Math.cos(angle),s:Math.sin(angle)}));

function mountainRanges(x,z){
  if(Math.max(Math.abs(x),Math.abs(z))<3150)return 0;
  let height=0;
  for(const peak of skyline){
    const dx=x-peak.x,dz=z-peak.z;
    const a=(dx*peak.c+dz*peak.s)/peak.w,b=(dz*peak.c-dx*peak.s)/peak.d;
    const radius=Math.hypot(a,b);
    if(radius>=1)continue;
    const angle=Math.atan2(b,a),rib=.07*Math.sin(angle*5+radius*4)+.045*Math.sin(angle*9-radius*9);
    const cone=Math.max(0,1-radius+rib*radius*(1-radius));
    const gullies=(.06*Math.sin(x/240+z/410)+.035*Math.sin(x/110-z/185))*Math.sin(Math.PI*radius);
    height=Math.max(height,peak.height*(cone**1.1+gullies));
  }
  return height*smooth((Math.max(Math.abs(x),Math.abs(z))-3150)/950);
}

function alpineBase(x,z,t){
  const westRidge=hill(x+1160+90*Math.sin(z/820),225);
  const eastRidge=hill(x-1140-95*Math.cos(z/800),240);
  const divide=hill(x-360-140*Math.sin(z/530),155);
  const massif=hill(x+120,2650)*hill(z+1800,2450);
  const distantPeaks=520*hill(x+3800,1180)*hill(z-2100,2400)+
    970*hill(x-3800,1700)*hill(z+2500,2650)+670*hill(x+850,2050)*hill(z-5300,1500);
  const shoulders=(190*westRidge+285*eastRidge+140*divide)*hill(z+430,2800);
  const relief=16*Math.sin(x/98+z/167)+11*Math.sin(x/74-z/123);
  return 1390+690*(1-descent(t))*hill(x,3500)+massif*155+distantPeaks+shoulders+relief+mountainRanges(x,z);
}

function topography(width,height,spacing,forest=false){
  const halfX=(width-1)*spacing/2,halfZ=(height-1)*spacing/2;
  const heights=new Float32Array(width*height),values=forest?new Float32Array(width*height):null;
  for(let row=0;row<height;row++){
    const z=row*spacing-halfZ,t=clamp((z-START)/(FINISH-START),0,1);
    const profiles=trails.map(trail=>({...trail,center:centerline(trail,t),height:routeElevation(trail,t),halfWidth:pisteWidth(trail,t)}));
    for(let col=0;col<width;col++){
      const x=col*spacing-halfX,index=row*width+col;
      let elevation=alpineBase(x,z,t),coverage=1;
      for(const trail of profiles){
        const gap=Math.abs(x-trail.center);
        const blend=1-smooth((gap-trail.halfWidth-9)/130);
        const walls=(trail.walls??0)*smooth((gap-trail.halfWidth)/24);
        const bank=(trail.camber??0)*clamp((x-trail.center)/trail.halfWidth,-1,1)*
          Math.sin(t*trail.rhythm*2*Math.PI)*smooth(t/.12)*smooth((1-t)/.12);
        elevation+=(trail.height+walls+bank-elevation)*blend;
        coverage=Math.min(coverage,smooth((gap-trail.halfWidth-2)/30));
      }
      heights[index]=elevation;
      if(values){
        const grove=.51+.24*Math.sin(x/115+Math.sin(z/180)*1.8)+.24*Math.cos(z/121+x/250);
        const timberline=1-smooth((elevation-1950)/340);
        const habitat=.34+.66*hill(x,450);
        values[index]=smooth((grove-.28)/.60)*coverage*timberline*habitat;
      }
    }
  }
  return {width,height,spacing,heights,originUTM:[-halfX,halfZ],values};
}

export function createChaseMountain(){
  const local=topography(WIDTH,HEIGHT,SPACING,true);
  const terrain=createTerrain({...local,treeMinElevation:0});
  const routes=trails.map(trail=>{
    const points=Array.from({length:193},(_,i)=>{
      const t=i/192;
      return{x:centerline(trail,t),z:START+(FINISH-START)*t};
    });
    const length=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
    const route={...difficultyStyles[trail.difficulty],id:trail.id,name:trail.name,subtitle:trail.label,
      label:trail.label,difficulty:trail.difficulty,halfWidth:trail.halfWidth,
      pickupSpacing:190,pisteWidth:distance=>pisteWidth(trail,clamp(distance/length,0,1)),gliderAt:trail.gliderAt,
      points,length,drop:trail.drop,patrolOnly:true};
    route.spawn=pointAlongRoute(route,35);
    route.goal=chaseGoal(route);
    if(route.halfWidth<22){
      route.branches=authoredChaseBranches(route,terrain)??routeBranchCandidates(route,terrain);
    }
    return route;
  });
  const [xmin,ymax]=local.originUTM;
  const extent={xmin,ymax,xmax:xmin+(WIDTH-1)*SPACING,ymin:ymax-(HEIGHT-1)*SPACING};
  const landcover={width:WIDTH,height:HEIGHT,extent,values:local.values};
  const context=topography(257,257,128);
  return {terrain,routes,landcover,context,infrastructure:emptyInfrastructure};
}
