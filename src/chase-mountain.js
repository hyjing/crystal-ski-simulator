import {clamp} from './physics.js';
import {createTerrain,difficultyStyles,pointAlongRoute} from './terrain.js';

const START=-1536, FINISH=1536;
const WIDTH=385, HEIGHT=513, SPACING=8;
const emptyInfrastructure={type:'FeatureCollection',features:[]};
const smooth=(t)=>{const v=clamp(t,0,1);return v*v*(3-2*v);};
const hill=(delta,width)=>Math.exp(-((delta/width)**2));

const trails=[
  {id:'windward-bowl',name:'风脊大道',label:'绿道 · 宽坡直线',difficulty:'easy',
    x:-760,halfWidth:38,top:2180,drop:650,curve:18,rhythm:2,rollers:0},
  {id:'pine-switchbacks',name:'松林折线',label:'蓝道 · 连续弯与林间岔路',difficulty:'intermediate',
    x:0,halfWidth:16,top:2230,drop:780,curve:98,rhythm:4,rollers:4},
  {id:'frost-chute',name:'霜沟',label:'黑道 · 窄沟与连续坡坎',difficulty:'advanced',
    x:740,halfWidth:12,top:2300,drop:940,curve:31,rhythm:3,rollers:10},
];

function descent(t){
  const transition=.065;
  if(t<transition)return t*t/(2*transition*(1-transition));
  if(t>1-transition)return 1-descent(1-t);
  return (t-transition/2)/(1-transition);
}

function centerline(trail,t){
  const envelope=smooth(t/.10)*smooth((1-t)/.10);
  return trail.x+trail.curve*Math.sin(t*trail.rhythm*2*Math.PI)*envelope;
}

function routeElevation(trail,t){
  return trail.top-trail.drop*descent(t)+trail.rollers*
    Math.sin(t*26*Math.PI)*smooth(t/.14)*smooth((1-t)/.14);
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
  return 1390+690*(1-descent(t))*hill(x,3500)+massif*155+distantPeaks+shoulders+relief;
}

function topography(width,height,spacing,forest=false){
  const halfX=(width-1)*spacing/2,halfZ=(height-1)*spacing/2;
  const heights=new Float32Array(width*height),values=forest?new Float32Array(width*height):null;
  for(let row=0;row<height;row++){
    const z=row*spacing-halfZ,t=clamp((z-START)/(FINISH-START),0,1);
    const profiles=trails.map(trail=>({...trail,center:centerline(trail,t),height:routeElevation(trail,t)}));
    for(let col=0;col<width;col++){
      const x=col*spacing-halfX,index=row*width+col;
      let elevation=alpineBase(x,z,t),coverage=1;
      for(const trail of profiles){
        const gap=Math.abs(x-trail.center);
        const blend=1-smooth((gap-trail.halfWidth-9)/130);
        const walls=trail.id==='frost-chute'?17*smooth((gap-trail.halfWidth)/24):0;
        elevation+=(trail.height+walls-elevation)*blend;
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
      label:trail.label,difficulty:trail.difficulty,halfWidth:trail.halfWidth,points,length,drop:trail.drop,patrolOnly:true};
    route.spawn=pointAlongRoute(route,35);
    return route;
  });
  const [xmin,ymax]=local.originUTM;
  const extent={xmin,ymax,xmax:xmin+(WIDTH-1)*SPACING,ymin:ymax-(HEIGHT-1)*SPACING};
  const landcover={width:WIDTH,height:HEIGHT,extent,values:local.values};
  const context=topography(129,129,128);
  return {terrain,routes,landcover,context,infrastructure:emptyInfrastructure};
}
