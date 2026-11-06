import {clamp} from './physics.js';
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export function sitePoint(site,x,z){const sn=Math.sin(site.heading),cs=Math.cos(site.heading);return{x:site.x+cs*x+sn*z,z:site.z-sn*x+cs*z};}
export function siteLocal(site,p){const sn=Math.sin(site.heading),cs=Math.cos(site.heading),x=p.x-site.x,z=p.z-site.z;return{x:cs*x-sn*z,z:sn*x+cs*z};}
export function makeVisitorSite(anchor,terrain,id){const site={...anchor,id,heading:Math.atan2(anchor.station?.fx||0,anchor.station?.fz||1),doorOpen:0};const corners=[[-2.6,-2.5],[2.6,-2.5],[-2.6,-6.5],[2.6,-6.5]].map(([x,z])=>sitePoint(site,x,z));site.floor=Math.max(...corners.map(p=>terrain.surface(p.x,p.z)))+.06;return site;}
export function visitorSurface(site,x,z,surface){const p=siteLocal(site,{x,z}),ground=surface(x,z);if(Math.abs(p.x)<2.55&&p.z< -2.5&&p.z> -6.5)return site.floor;if(Math.abs(p.x)<.85&&p.z<=.5&&p.z>=-2.5){const t=clamp((.5-p.z)/3,0,1);return ground+(site.floor-ground)*t;}return ground;}
export function visitorSteps(site,index){const seatX=-3.5-(index%2)*1.3,seat=sitePoint(site,seatX,-.4),seatFront=sitePoint(site,seatX,1.8),seatApproach=sitePoint(site,seatX,.15),move=(p,door=false)=>({type:'move',point:p,door}),turn={type:'turn',heading:site.heading,duration:.65},sit={type:'sit',duration:1.3,point:seat},stand={type:'stand',duration:1.1,point:seatApproach},rest={type:'rest',duration:10+(index%3)*3};
 const stroll=[move(seatFront),move(sitePoint(site,-4,3.2)),move(sitePoint(site,2.8,3.2)),move(seatFront),move(seatApproach),turn,sit];
 if(index%3===1)return{seat,prop:index%2?'cup':'sandwich',steps:[stand,move(seatFront),move(sitePoint(site,0,.4)),{type:'door'},move(sitePoint(site,0,-3.6),true),move(sitePoint(site,0,-5),true),{type:'indoors',duration:8},{type:'door'},move(sitePoint(site,0,-3.6),true),move(sitePoint(site,0,.4),true),move(seatFront),move(seatApproach),turn,sit,{type:'rest',duration:8,consume:true}]};
 return{seat,prop:index%3===2?(index%2?'sandwich':'cup'):null,steps:[{...rest,consume:index%3===2},stand,...stroll]};
}
export function beginVisitor(state,site,index){const plan=visitorSteps(site,index);state.site=site;state.sequence=plan.steps;state.sequenceIndex=0;state.actionTime=0;state.sit=1;state.indoor=false;state.wantDoor=false;state.prop=plan.prop;state.consume=0;state.point={...plan.seat,heading:site.heading};state.heading=site.heading;state.action=plan.steps[0].type;}
export function advanceVisitor(s,dt,canMove){
 const step=s.sequence[s.sequenceIndex];s.action=step.type;s.riseLean=0;if(s.actionTime===0&&(step.type==='sit'||step.type==='stand'))s.transitionStart={...s.point};s.wantDoor=step.type==='door'||!!step.door;s.speed=0;s.consume=0;
 let done=false;
 if(step.type==='move'){
  s.indoor=false;const dx=step.point.x-s.point.x,dz=step.point.z-s.point.z,d=Math.hypot(dx,dz),travel=Math.min(d,dt*.85),next={x:s.point.x+dx/Math.max(d,.0001)*travel,z:s.point.z+dz/Math.max(d,.0001)*travel};
  const before=siteLocal(s.site,s.point),after=siteLocal(s.site,next),crossing=(before.z+2.5)*(after.z+2.5)<=0&&before.z!==after.z;
  if((!crossing||s.site.doorOpen>.9)&&canMove(next,!!step.door,s)){s.point.x=next.x;s.point.z=next.z;s.speed=travel/Math.max(dt,.001);if(travel>.0001)s.heading+=Math.atan2(Math.sin(Math.atan2(dx,dz)-s.heading),Math.cos(Math.atan2(dx,dz)-s.heading))*(1-Math.exp(-dt*6));done=d<.035;}
 }else if(step.type==='door'){s.indoor=false;done=s.site.doorOpen>.95;}
 else{
  s.actionTime+=dt;const t=smooth(s.actionTime/(step.duration||1));
  if(step.type==='sit'||step.type==='stand'){s.sit=step.type==='sit'?t:1-t;s.riseLean=Math.sin(t*Math.PI);if(step.point){s.point.x=s.transitionStart.x+(step.point.x-s.transitionStart.x)*t;s.point.z=s.transitionStart.z+(step.point.z-s.transitionStart.z)*t;}}
  if(step.type==='turn')s.heading+=Math.atan2(Math.sin(step.heading-s.heading),Math.cos(step.heading-s.heading))*(1-Math.exp(-dt*8));
  if(step.type==='indoors')s.indoor=true;
  if(step.consume){const sip=s.actionTime%5;s.consume=smooth(sip/.8)*(1-smooth((sip-1.8)/.8));}
  done=s.actionTime>=(step.duration||1);
 }
 s.point.heading=s.heading;s.walkAmount+=(clamp(s.speed/.7,0,1)-s.walkAmount)*(1-Math.exp(-dt*9));s.walkPhase+=s.speed*dt*6;
 if(done){s.sequenceIndex=(s.sequenceIndex+1)%s.sequence.length;s.actionTime=0;}
}
export const SKIER_PROFILES=[{name:'careful',speed:.65},{name:'cruiser',speed:1},{name:'fast',speed:1.5},{name:'rest-stop',speed:.85,pause:true},{name:'sport',speed:1.25},{name:'occasional-fall',speed:.80,fall:true}];
export function advanceSkierRoutine(s,index,dt){
 const profile=SKIER_PROFILES[index%SKIER_PROFILES.length];s.routineClock=(s.routineClock||0)+dt;s.activity??='ski';s.nextPause??=18+index%4*3;s.nextFall??=26+index%5*5;
 if(profile.pause&&s.activity==='ski'&&s.routineClock>=s.nextPause&&s.progress<s.route.length-100){s.activity='pull-over';s.routineAge=0;s.parkingSide=index%2?1:-1;}
 if(s.activity==='pull-over'){s.routineAge+=dt;if(s.routineAge>3&&s.speed<2.5){s.activity='pause';s.routineAge=0;}}
 else if(s.activity==='pause'){s.routineAge+=dt;if(s.routineAge>7+index%3){s.activity='ski';s.nextPause=s.routineClock+48;}}
 if(profile.fall&&s.routineClock>=s.nextFall&&s.speed>3&&s.progress>50&&s.progress<s.route.length-80&&s.slope<.5){s.fall=3.8;s.fallDuration=3.8;s.nextFall=s.routineClock+65;s.speed=0;s.activity='fall';}
 if(s.activity==='fall'&&!s.fall)s.activity='ski';return profile;
}
export function fallAnimation(remaining,duration=1.5){if(!(remaining>0))return{amount:0,brace:0};const elapsed=Math.max(0,duration-remaining),fall=smooth(elapsed/.28),rise=smooth(remaining/.75),amount=fall*rise;return{amount,brace:amount*(.45+.55*(1-rise))};}
