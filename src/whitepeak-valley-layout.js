import {clamp} from './physics.js';

export const VALLEY_EDGE=2280;
export const RIVER_MIN=-2480,RIVER_MAX=2480;
const smooth=t=>{const u=clamp(t,0,1);return u*u*(3-2*u);};
export const riverZ=x=>2730+67*Math.sin(x/545)+25*Math.sin(x/189+.4);
export const valleyRoadZ=x=>riverZ(x)-111+12*Math.sin(x/266);
export const riverLevel=x=>1360-x*.023;
export function riverHalfWidth(x){
  return 13+5*Math.sin(x/270)**2+52*Math.exp(-(((x+460)/145)**2));
}

export function valleyElevation(x,z,elevation){
  if(z<=VALLEY_EDGE)return elevation;
  const riverDistance=Math.abs(z-riverZ(x)),channel=riverHalfWidth(x);
  const shore=1-smooth((riverDistance-channel+5)/28);
  const floodplain=1-smooth((riverDistance-100)/155);
  const bed=riverLevel(x)+7-13*shore;
  const northApproach=smooth((z-VALLEY_EDGE)/220);
  return elevation+(bed-elevation)*northApproach*floodplain;
}

export function valleyCanopy(x,z,coverage){
  const bank=Math.abs(z-riverZ(x))-riverHalfWidth(x);
  const road=Math.abs(z-valleyRoadZ(x));
  // Leave a tree-free snow apron beside the route and open water below.
  const valley=smooth((z-1420)/750);
  const grove=.62+.24*Math.sin(x/125+z/145)+.14*Math.sin(z/79-x/135);
  const gain=valley*smooth((grove-.27)/.55)*smooth(bank/28)*smooth((road-10)/22);
  return {gain,terrain:smooth(bank/20)*smooth((road-6)/13)*coverage};
}

export function valleyLodges(routes){
  return routes.flatMap((route,cluster)=>{
    const end=route.points.at(-1),x=end.x;
    const offsets=cluster===1?[[-96,35],[-42,-22],[22,34],[75,-20],[128,34]]
      :[[-56,-23],[-6,31],[47,-19]];
    return offsets.map(([shift,depth],i)=>{
      const site=x+shift;
      const w=(cluster===1&&i===1?40:16)+((i+cluster*3)%4)*4;
      return {x:site,z:valleyRoadZ(site)+depth,w,d:15+(i*3+cluster)%8,h:5+((i+cluster)%4),
        heading:Math.sin(i*2+cluster)*.32,central:cluster===1&&i===1};
    });
  });
}
