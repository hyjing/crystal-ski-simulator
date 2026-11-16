import {clamp, nearestOnRoute, PHYSICS} from './physics.js';
import {CHASE_TRAILS,layTrails,trailContact} from './chase-trails.js';
import {ChaseGoal} from './chase-goals.js';
import {deployGlider} from './airborne.js';
import {pointAlongRoute} from './terrain.js';
import {AVALANCHE_DURATION,AVALANCHE_RADIUS} from './kick.js';
import {sweptContact} from './traffic-brain.js';
import {DEFAULT_TALENTS,ITEM_STACK_LIMIT,canStoreItem,itemStacks,upgradeBonus,itemUpgradeExtra} from './progression.js';

export const PATROL_ROUTE_ID = 'crystal-angry-skiers';
export const resolveChaseRoute = id => id === 'crystal-patrol-descent' ? PATROL_ROUTE_ID : id;
export function longestChaseRoute(routes,mountainId){
  const longest=routes.reduce((best,route)=>!best||route.length>best.length?route:best,null);
  return longest&&{...longest,id:`${mountainId}-angry-skiers`,patrolOnly:true,label:'愤怒的雪友 · 长距离'};
}
const CAPTURE_RADIUS = 5;
export const MAX_HEALTH = 100;
export const PURSUER_HEALTH=100;
export const MAX_PURSUERS=9;
const INTERCEPT_WARNING=1.65;
export const PURSUER_ROLES={
  racer:{name:'直板手',color:'#ffc26c',symbol:'»'},
  guard:{name:'护盾手',color:'#83dcff',symbol:'⬡'},
  scout:{name:'绕行手',color:'#daacf8',symbol:'◇'},
  sprinter:{name:'冲刺手',color:'#ff986c',symbol:'»'},
  cutter:{name:'横切手',color:'#a2f3bb',symbol:'↗'},
};
const ROLES=['racer','cutter','guard','sprinter','scout'];
const roleOf=agent=>agent.role??['racer','guard','scout'][(agent.id??0)%3];
const pursuerCount=stars=>stars?Math.min(MAX_PURSUERS,stars+2+Math.max(0,stars-3)):0;
const MAX_SUMMONED=8;
const ALLY_LURE_RADIUS=48;
const KICK_DAMAGE=55;
export const DAMAGE_PER_SECOND = 12.5;
const MEDKIT_HEAL = 35;
const TRAP_RADIUS = 2.1;
const TRIP_DURATION=2.4;
const TRIP_SLIDE=.45;
export const DASH_WARNING=.85;
const DASH_DURATION=.85;
const REPLACEMENT_DELAY = 1.2;
const GUARD_DURATION=2;
export const PATROL_ITEMS = {
  ...CHASE_TRAILS,
  boost: {name:'加速充能',color:'#ffe16d',symbol:'»',duration:1.05,damage:28,radius:3.4,description:'短时猛冲，擦过身边的追赶者时造成 28 点伤害'},
  shield: {name:'护盾',color:'#83dcff',symbol:'+',duration:1.7,radius:6,damage:25,description:'阻止截停；弹开的追赶者受到 25 点反震伤害，每次释放对每人计一次'},
  pulse: {name:'雪浪脉冲',color:'#b0fff0',symbol:'◎',duration:.62,radius:19,damage:45,description:'环形击退并造成 45 点伤害，能打断近身围追'},
  avalanche: {name:'雪崩弹',color:'#ff986e',symbol:'✹',duration:AVALANCHE_DURATION,description:'稀有 · 自动瞄向 75 米内身后雪友的预计落点，爆炸击倒范围内未受护盾保护的雪友'},
  mist: {name:'雪雾弹',color:'#e3e6f7',symbol:'☁',duration:3,radius:14,damage:6,description:'留下 3 秒雪雾，减速遮挡视线，雾中的雪友每秒受到 6 点伤害'},
  glider: {name:'浮空翼',color:'#91fff3',symbol:'↗',duration:1.35,damage:22,radius:4.5,description:'沿当前滑行方向向前弹射，再展翼滑翔；掠过追赶者上方造成 22 点下冲伤害'},
  autofrost: {name:'追尾雪弹炮',color:'#82b5ff',symbol:'»',duration:3.4,radius:38,damage:15,description:'自动向身后最近的追赶者发射雪弹，每发 15 点伤害'},
  crew: {name:'雪友援手',color:'#6dffc3',symbol:'✦',duration:5.5,damage:32,description:'召唤滑向侧方的雪友，吸引 48 米内的追赶者；被追上时反击一次，造成 32 点伤害'},
  banana: {name:'香蕉皮',color:'#ffcd36',symbol:'⌣',duration:12,damage:18,description:'使第一个滑过的雪友滑倒 2.4 秒并受 18 点伤害；有剩余生命就能起身'},
};
export const MEDKIT = {name:'血包',color:'#f95178'};
export const SUPPLY = {name:'道具补给',color:'#f1c77c'};
const range = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
const turnAngle = (a, b) => Math.atan2(Math.sin(b-a), Math.cos(b-a));

function fogBlocks(mist,observer,target){
  return Boolean(mist&&range(observer,target)>4&&sweptContact(observer,target,mist,mist.radius));
}

function routePoint(route, distance, offset=0) {
  const p = pointAlongRoute(route, clamp(distance,0,route.length));
  const a = route.points[p.segment], b = route.points[p.segment+1];
  const heading = Math.atan2(b.x-a.x,b.z-a.z);
  return {x:p.x+Math.cos(heading)*offset,z:p.z-Math.sin(heading)*offset,heading};
}

export class PatrolRun {
  constructor(route, clear, pathClear=clear, talents=DEFAULT_TALENTS,itemUpgrades=[]) {
    this.route = route;
    this.goal=route.goal?new ChaseGoal(route.goal):null;
    this.shortcuts=new Set();
    this.intercepted=new Set();
    this.intercept=null;
    this.clear = clear;
    this.pathClear = pathClear;
    this.time = 0;
    this.stars = 0;
    this.peakStars = 0;
    this.contact = 0;
    this.damageRate=DAMAGE_PER_SECOND*(1-upgradeBonus(talents,'stamina')/100);
    this.medkitHeal=MEDKIT_HEAL+upgradeBonus(talents,'recovery');
    this.escapeArmed=false;
    this.escapes=0;
    this.health = MAX_HEALTH;
    this.traps=[];
    this.bombs=[];
    this.blasts=[];
    this.waves=[];
    this.trailSegments=[];
    this.allies=[];
    this.shots=[];
    this.itemUpgrades=itemUpgrades.slice();
    this.nextDash=7;
    this.dash=null;
    this.evadeUntil = 0;
    this.outcome = '';
    this.furthest = route.spawn.distance;
    this.lastSeen = 0;
    this.spawnAfter = 0;
    this.rearmAt = route.spawn.distance+22;
    this.agents = [];
    this.inventory = [];
    this.lastPickup = null;
    this.blockedPickup=null;
    this.guardBlocks=0;
    this.hits=[];
    this.effects={};
    this.nextIncident = 0;
    this.nextAgent = 0;
    const types = ['boost','pulse','mist','shield','banana','flametrail','frosttrail','miragetrail','autofrost','crew'];
    this.pickups = [];
    let itemIndex=0;
    for(let d=route.spawn.distance+115;d<route.length-90;d+=(route.pickupSpacing??225)){
      const index=this.pickups.length,side=index%2?1:-1;
      const point=[side*3,-side*3,0].map(offset=>routePoint(route,d,offset)).find(clear);
      if(!point)continue;
      if(index%3===2)this.pickups.push({...point,type:'supply',fallback:types[itemIndex%types.length],taken:false});
      else this.pickups.push({...point,type:types[itemIndex++%types.length],taken:false});
    }
    const gliderDistance=route.spawn.distance+(route.length-route.spawn.distance)*(route.gliderAt??.27);
    const gliderPoint=[[0,8],[0,-8],[0,0],[22,8],[-22,-8]]
      .map(([shift,offset])=>routePoint(route,gliderDistance+shift,offset))
      .find(point=>clear(point)&&this.pickups.every(pickup=>range(point,pickup)>11));
    if(gliderPoint)this.pickups.push({...gliderPoint,type:'glider',taken:false});
    const rare=route.spawn.distance+(route.length-route.spawn.distance)*.68;
    const rarePoint=[-6,6,0].map(offset=>routePoint(route,rare,offset)).find(clear);
    if(rarePoint)this.pickups.push({...rarePoint,type:'avalanche',taken:false});
    for(let d=route.spawn.distance+225;d<route.length-55;d+=295){
      const point=[0,4,-4].map(offset=>routePoint(route,d,offset)).find(clear);
      if(point)this.pickups.push({...point,type:'medkit',taken:false});
    }
    for(const branch of route.branches??[]){
      const point=branch.kind==='shortcut'?null:branch.points.slice(6,11).find(clear);
      branch.medkit=point?{...point,type:'medkit',taken:false}:null;
      if(branch.medkit)this.pickups.push(branch.medkit);
    }
  }

  get stacks(){return itemStacks(this.inventory);}

  blockAttack(agent){
    if(!(agent.guardUntil>this.time))return false;
    agent.guardUntil=0;
    agent.guardFlashUntil=this.time+.4;
    this.guardBlocks++;
    return true;
  }

  damage(agent,source,amount){
    if(agent.launch||agent.health===0||this.blockAttack(agent))return 'blocked';
    let combo;
    if(source==='flametrail'&&agent.chillUntil>this.time){
      agent.chillUntil=0;
      amount+=16;
      combo='融裂';
    }
    if((source==='pulse'||source==='autofrost')&&agent.mirage?.until>this.time){
      agent.mirage=null;
      amount+=12;
      combo='破幻';
    }
    const health=agent.health??PURSUER_HEALTH;
    agent.health=Math.max(0,health-amount);
    const down=agent.health===0;
    if(down){
      agent.downUntil=this.time+1.7;
      agent.fallDuration=1.7;
      agent.stunUntil=agent.downUntil;
      agent.repelUntil=0;
      agent.speed=0;
      agent.tucking=false;
    }
    this.hits.push({agent,source,damage:health-agent.health,down,combo});
    return down?'down':'hit';
  }

  kickHit(agent,player){
    const result=this.damage(agent,'kick',KICK_DAMAGE);
    if(result==='hit')this.repel(agent,player,.55,16,.20);
    if(result!=='blocked')this.contact=0;
    return result;
  }

  get captureRemaining(){
    return this.contact > 0 ? this.health/this.damageRate : null;
  }

  heal(amount){
    const restored=Math.min(MAX_HEALTH-this.health,amount);
    this.health+=restored;
    return restored;
  }

  evadeLanding(event,player,surface=()=>0){
    this.goal?.landing(event);
    if(event?.type==='land'&&event.quality==='clean'&&event.airTime>=.35){
      this.evadeUntil=this.time+.35;
      this.contact=0;
      if(event.glider&&player){
        const ground=surface(player.x,player.z);
        for(const agent of this.agents){
          if(range(agent,player)>10||Math.abs(surface(agent.x,agent.z)-ground)>4)continue;
          if(this.damage(agent,'glider',16)==='hit')this.repel(agent,player,.65,21,.30);
        }
      }
      return this.heal(event.rotation>=180||event.grab?20:12);
    }
    return 0;
  }

  reinforcement(player,progress,offscreen,surface){
    const ground=surface(player.x,player.z),side=this.nextAgent%3===1?-1:1;
    const preferRear=this.nextAgent%3===0;
    const behind=Math.max(0,progress-48-Math.min(24,this.agents.length*4));
    const rear=[0,-8,8].map(offset=>({...routePoint(this.route,behind,offset),approach:'rear'}));
    const flank=sign=>[32,46,22].flatMap(offset=>[52,36].map(back=>{
      const entry=Math.max(0,progress-back),point=routePoint(this.route,entry,sign*offset);
      const merge=routePoint(this.route,entry+35,sign*offset*.28);
      return {...point,heading:Math.atan2(merge.x-point.x,merge.z-point.z),approach:sign<0?'left':'right'};
    }));
    const preferred=flank(side),opposite=flank(-side);
    const candidates=preferRear?[...rear,...preferred,...opposite]:[...preferred,...rear,...opposite];
    return candidates.find(point=>{
      const gap=range(point,player);
      const firstTurn={x:point.x+Math.sin(point.heading)*8,z:point.z+Math.cos(point.heading)*8};
      return gap>=26&&gap<=105&&this.agents.every(agent=>range(agent,point)>14)&&
        offscreen(point)&&this.clear(point)&&this.clear(firstTurn)&&Math.abs(surface(point.x,point.z)-ground)<gap*.48+3;
    });
  }

  cutTarget(agent,player,surface){
    const direction=Math.hypot(player.vx,player.vz)>2?Math.atan2(player.vx,player.vz):player.heading;
    const fx=Math.sin(direction),fz=Math.cos(direction);
    const lateral=(agent.x-player.x)*fz-(agent.z-player.z)*fx;
    const back=(agent.x-player.x)*fx+(agent.z-player.z)*fz;
    if(Math.abs(lateral)<7||back < -27||back>9)return null;
    const lead=clamp(player.speed*.72,9,21);
    const point={x:player.x+fx*lead,z:player.z+fz*lead};
    return this.clear(point)&&this.pathClear(point)&&Math.abs(surface(point.x,point.z)-surface(agent.x,agent.z))<14?point:null;
  }

  updateManeuver(player,mist,shield,surface){
    const dash=this.dash;
    if(dash&&(this.time>=dash.until||shield||fogBlocks(mist,dash.agent,player)||this.followAlly(dash.agent,surface)||
      dash.agent.launch||dash.agent.health===0||dash.agent.stunUntil>this.time||dash.agent.mirage?.until>this.time||
      !this.agents.includes(dash.agent)))this.dash=null;
    if(this.dash||this.stars<2||this.time<this.nextDash||shield||player.airborne)return;
    const eligible=this.agents.filter(agent=>{
      const gap=range(agent,player);
      return gap>=7&&gap<=36&&!this.followAlly(agent,surface)&&!fogBlocks(mist,agent,player)&&
        !agent.launch&&agent.health!==0&&!(agent.stunUntil>this.time)&&!(agent.mirage?.until>this.time)&&
        Math.abs(surface(agent.x,agent.z)-surface(player.x,player.z))<10;
    });
    const cutter=this.stars>=3&&eligible.find(agent=>roleOf(agent)==='cutter'&&this.cutTarget(agent,player,surface));
    const sprinter=eligible.find(agent=>roleOf(agent)==='sprinter'&&range(agent,player)<29);
    const agent=cutter||sprinter||(this.stars>=3&&eligible.find(agent=>roleOf(agent)!=='cutter'&&range(agent,player)<=25));
    if(!agent)return;
    const at=this.time+DASH_WARNING;
    this.dash={agent,at,until:at+(cutter?1.45:DASH_DURATION),kind:cutter?'cut':'sprint',
      point:cutter?this.cutTarget(agent,player,surface):null};
    this.nextDash=this.time+7;
  }

  repel(agent,player,duration,speed,pushTime,source=null){
    agent.repelSource=source;
    const dx=agent.x-player.x,dz=agent.z-player.z;
    agent.fallDuration=0;
    agent.tucking=false;
    agent.repelHeading=Math.hypot(dx,dz)>.1?Math.atan2(dx,dz):player.heading+Math.PI;
    agent.repelUntil=this.time+pushTime;
    agent.stunUntil=this.time+duration;
    agent.repelSpeed=speed;
    agent.speed=0;
    agent.aimAt=0;
  }

  addStar(){
    this.stars=Math.min(5,this.stars+1);
    this.peakStars=Math.max(this.peakStars,this.stars);
    this.lastSeen=this.time;
  }

  incident(){
    if(this.outcome||this.time<this.nextIncident)return;
    this.nextIncident=this.time+5;
    this.addStar();
  }

  use(player,slot=0,terrain){
    const type=this.stacks[slot]?.type;
    if(!type||this.outcome||player.crashRemaining)return false;
    const bonus=upgradeBonus(this.itemUpgrades,type),extra=itemUpgradeExtra(this.itemUpgrades,type);
    if(type==='glider'&&!deployGlider(player,terrain,PATROL_ITEMS.glider.duration+bonus))return false;
    this.inventory.splice(this.inventory.lastIndexOf(type),1);
    if(type==='glider'){
      this.glideStrike={last:{x:player.x,z:player.z},hit:new Set()};
      this.contact=0;
      return true;
    }
    const {x,z,heading}=player;
    const travel=Math.hypot(player.vx,player.vz)>2?Math.atan2(player.vx,player.vz):heading;
    const behind=(distance,offset=0)=>({x:x-Math.sin(travel)*distance+Math.cos(travel)*offset,
      z:z-Math.cos(travel)*distance-Math.sin(travel)*offset});
    if(type==='banana'){
      const spots=Array.from({length:1+bonus},(_,i)=>[(i+1)*3,bonus?1.55*(i%2?1:-1):0]);
      for(const [distance,offset] of spots){
        const point=[behind(distance,offset),behind(distance*.55,offset),{x,z}].find(this.clear)??{x,z};
        this.traps.push({...point,until:this.time+PATROL_ITEMS.banana.duration,fallDuration:TRIP_DURATION+extra});
      }
    }else if(type==='avalanche'){
      const surface=terrain?.surface??terrain?.sample??(()=>0);
      const aim=this.aimAvalanche(player,travel,surface);
      const end=aim?.end??[behind(9),behind(6),behind(3),{x,z}].find(this.clear)??{x,z};
      this.bombs.push({type,x,z,end,target:aim?.target,start:this.time,until:this.time+(aim?.fuse??.35),
        height:player.airborne?Math.max(0,player.airClearance||0):0,
        radius:AVALANCHE_RADIUS+4+bonus,heading:travel});
    }else if(type==='crew'){
      for(let i=0;i<=bonus;i++){
        const side=i%2?1:-1;
        const point=[behind(3+i*2,side*(4+i*1.5)),behind(2),{x,z}].find(this.clear)??{x,z};
        this.allies.push({...point,heading:travel+side*(.44+Math.floor(i/2)*.22),
          speed:clamp(player.speed*.85,15,27),until:this.time+PATROL_ITEMS.crew.duration+extra});
      }
      if(this.allies.length>MAX_SUMMONED)this.allies.splice(0,this.allies.length-MAX_SUMMONED);
    }else{
      const duration=PATROL_ITEMS[type].duration+(type==='pulse'?0:bonus);
      const item=PATROL_ITEMS[type];
      const effect={type,start:this.time,until:this.time+duration,duration,x,z,heading};
      if(type==='pulse'){
        this.waves.push({...effect,radius:item.radius+bonus,damage:item.damage+extra,hit:new Set()});
        return true;
      }
      if(Object.hasOwn(CHASE_TRAILS,type))Object.assign(effect,{last:{x,z},extra,linger:CHASE_TRAILS[type].linger});
      if(type==='shield'||type==='mist')effect.radius=item.radius+extra;
      if(type==='shield')effect.hit=new Set();
      if(type==='mist')effect.hitAt=new Map();
      if(type==='boost'){
        effect.thrust=22+extra;
        effect.last={x,z};
        effect.hit=new Set();
      }
      if(type==='autofrost'){
        effect.damage=item.damage+extra;
        effect.nextShot=this.effects.autofrost?.nextShot??this.time;
      }
      if(this.effects[type])effect.until=this.effects[type].until+duration;
      this.effects[type]=effect;
      if(type==='shield')this.contact=0;
    }
    return true;
  }

  aimAvalanche(player,heading,surface){
    const fx=Math.sin(heading),fz=Math.cos(heading),ground=surface(player.x,player.z);
    let best=null,score=Infinity;
    for(const target of this.agents){
      const dx=target.x-player.x,dz=target.z-player.z,gap=Math.hypot(dx,dz);
      if(target.launch||target.health===0||gap>75||dx*fx+dz*fz>2)continue;
      if(Math.abs(surface(target.x,target.z)-ground)>8+gap*.67)continue;
      const fuse=.36+gap*.003;
      const end=this.bombLead(target,fuse);
      const candidate=this.clear(end)?end:this.clear(target)?{x:target.x,z:target.z}:null;
      if(!candidate)continue;
      const rank=gap+(target.guardUntil>this.time?23:0);
      if(rank<score){score=rank;best={target,end:candidate,fuse};}
    }
    return best;
  }

  bombLead(agent,seconds){
    const travel=agent.stunUntil>this.time?0:clamp(agent.speed??0,0,60)*seconds;
    const heading=agent.heading??0;
    return {x:agent.x+Math.sin(heading)*travel,z:agent.z+Math.cos(heading)*travel};
  }

  applyTrailContacts(agent,next,surface){
    if(!this.trailSegments.length||agent.health===0)return;
    const contacts=trailContact(this.trailSegments,agent,next,surface);
    for(const type of ['frosttrail','miragetrail','flametrail']){
      const segment=contacts[type];
      if(!segment||this.time<(agent.trailReady?.[type]??0))continue;
      agent.trailReady??={};
      agent.trailReady[type]=this.time+(type==='flametrail'?2.5:3);
      if(this.damage(agent,type,segment.damage)!=='hit')continue;
      if(type==='frosttrail'){
        agent.chillUntil=this.time+3;
        agent.speed*=.66;
        if(this.dash?.agent===agent)this.dash=null;
      }else if(type==='flametrail'){
        agent.burn={until:this.time+2.5,next:this.time+1,damage:segment.damage};
      }else{
        const side=(agent.id??0)%2?1:-1,h=segment.heading;
        const flank=direction=>({x:segment.x+Math.sin(h)*13+Math.cos(h)*direction*14,
          z:segment.z+Math.cos(h)*13-Math.sin(h)*direction*14});
        const point=[flank(side),flank(-side),segment.b].find(this.clear)??segment.b;
        agent.mirage={point,until:this.time+2};
        if(this.dash?.agent===agent)this.dash=null;
      }
    }
  }

  searchThroughMist(agent,mist){
    if(agent.mistSearch?.cloud!==mist){
      const lastSeen=agent.lastTarget??mist;
      const dx=mist.x-agent.x,dz=mist.z-agent.z,distance=Math.hypot(dx,dz);
      const heading=distance>.1?Math.atan2(dx,dz):mist.heading;
      const radius=mist.radius;
      const side=(agent.id??0)%4<2?1:-1;
      const flank=(forward,lateral)=>({
        x:mist.x+Math.sin(heading)*forward+Math.cos(heading)*lateral,
        z:mist.z+Math.cos(heading)*forward-Math.sin(heading)*lateral,
      });
      const detour=roleOf(agent)!=='racer'&&distance>radius+4
        ? [side,-side].map(sign=>flank(1,sign*(radius+6))).find(this.clear)
        : null;
      const exit=detour?{x:detour.x+Math.sin(heading)*radius,z:detour.z+Math.cos(heading)*radius}
        :flank(radius+5,side*3);
      agent.mistSearch={cloud:mist,waypoint:detour??lastSeen,detour:Boolean(detour),exit:this.clear(exit)?exit:null};
    }
    const search=agent.mistSearch;
    if(range(agent,search.waypoint)<5&&search.exit){
      search.waypoint=search.exit;
      search.exit=null;
    }
    return search.waypoint;
  }

  boost(player,dt){
    if(!this.effects.boost||player.crashRemaining)return;
    const gain=Math.min(this.effects.boost.thrust*dt,Math.max(0,PHYSICS.maxHorizontalSpeed-Math.hypot(player.vx,player.vz)));
    player.vx+=Math.sin(player.heading)*gain;
    player.vz+=Math.cos(player.heading)*gain;
    player.speed=Math.hypot(player.vx,player.vz);
  }

  strikeAlong(type,strike,player,surface){
    const {last,hit}=strike;
    strike.last={x:player.x,z:player.z};
    const flight=type==='glider';
    if(player.crashRemaining||range(last,player)>12||Boolean(player.airborne)!==flight)return;
    if(!flight&&player.speed<9)return;
    const item=PATROL_ITEMS[type],ground=surface(player.x,player.z);
    for(const agent of this.agents){
      if(agent.launch||agent.health===0||hit.has(agent)||!sweptContact(last,player,agent,item.radius))continue;
      const above=ground+(flight?player.airClearance??0:0)-surface(agent.x,agent.z);
      if(flight?above<0||above>7:Math.abs(above)>3)continue;
      hit.add(agent);
      if(this.damage(agent,type,item.damage)==='hit')this.repel(agent,player,.5,13,.2);
    }
  }

  damageInMist(mist,surface){
    const height=surface(mist.x,mist.z);
    for(const agent of this.agents){
      if(agent.launch||agent.health===0||this.time<(mist.hitAt.get(agent)??0)||
        range(mist,agent)>=mist.radius||Math.abs(surface(agent.x,agent.z)-height)>6+range(mist,agent)*.45)continue;
      mist.hitAt.set(agent,this.time+1);
      this.damage(agent,'mist',PATROL_ITEMS.mist.damage);
    }
  }

  followAlly(agent,surface){
    let nearest=null,limit=ALLY_LURE_RADIUS;
    for(const ally of this.allies){
      if(ally.until<=this.time)continue;
      const distance=range(agent,ally);
      if(distance<limit&&Math.abs(surface(ally.x,ally.z)-surface(agent.x,agent.z))<5+distance*.3){nearest=ally;limit=distance;}
    }
    return nearest;
  }

  advanceAllies(dt,surface){
    this.allies=this.allies.filter(ally=>ally.until>this.time);
    for(const ally of this.allies){
      const step=ally.speed*dt;
      const ground=surface(ally.x,ally.z);
      for(const offset of [0,-.6,.6]){
        const heading=ally.heading+offset;
        const next={x:ally.x+Math.sin(heading)*step,z:ally.z+Math.cos(heading)*step};
        if(this.clear(next)&&surface(next.x,next.z)-ground<Math.max(1,step*.55)){
          Object.assign(ally,next,{heading});
          break;
        }
      }
    }
  }

  fireRearShot(player,surface){
    const effect=this.effects.autofrost;
    if(!effect||this.time<effect.nextShot||player.crashRemaining)return;
    const heading=Math.hypot(player.vx,player.vz)>2?Math.atan2(player.vx,player.vz):player.heading;
    const forwardX=Math.sin(heading),forwardZ=Math.cos(heading),ground=surface(player.x,player.z);
    let target=null,closest=PATROL_ITEMS.autofrost.radius;
    for(const agent of this.agents){
      const distance=range(agent,player);
      if(agent.launch||agent.health===0||distance<.15||distance>=closest)continue;
      const ahead=(agent.x-player.x)*forwardX+(agent.z-player.z)*forwardZ;
      if(ahead>-.25*distance||Math.abs(surface(agent.x,agent.z)-ground)>4+distance*.35)continue;
      target=agent;closest=distance;
    }
    if(!target)return;
    effect.nextShot=this.time+.62;
    const result=this.damage(target,'autofrost',effect.damage);
    this.shots.push({x:player.x,z:player.z,y:ground+1+(player.airborne?player.airClearance??0:0),
      end:{x:target.x,z:target.z,y:surface(target.x,target.z)+1.05},
      start:this.time,impact:this.time+.08,until:this.time+.35,result,target});
  }

  triggerTrap(agent,point,heading,speed,surface,combo=false){
    const index=this.traps.findIndex(trap=>sweptContact(agent,point,trap,TRAP_RADIUS)&&
      Math.abs(surface(trap.x,trap.z)-surface(point.x,point.z))<2);
    if(index<0)return false;
    const trap=this.traps.splice(index,1)[0];
    if(this.damage(agent,'banana',PATROL_ITEMS.banana.damage+(combo?12:0))==='blocked')return false;
    this.trips.push({trap,agent,combo});
    if(this.dash?.agent===agent)this.dash=null;
    Object.assign(agent,point);
    if(agent.health===0)return true;
    agent.tucking=false;
    agent.fallDuration=trap.fallDuration??TRIP_DURATION;
    agent.stunUntil=this.time+agent.fallDuration;
    agent.repelUntil=this.time+TRIP_SLIDE;
    agent.repelHeading=heading;
    agent.repelSource=null;
    agent.repelSpeed=Math.min(speed*.52,12);
    agent.aimAt=0;
    agent.speed=0;
    agent.heading=heading+((agent.id??0)%2?-1.15:1.15);
    return true;
  }

  updateShortcuts(player,surface){
    const last=this.branchSample??player;
    this.branchSample={x:player.x,z:player.z};
    if(player.airborne||player.crashRemaining||range(last,player)>25)return;
    for(const branch of this.route.branches??[]){
      if(branch.kind!=='shortcut'||this.shortcuts.has(branch)||
        !sweptContact(last,player,branch.gate,9)||
        Math.abs(surface(player.x,player.z)-surface(branch.gate.x,branch.gate.z))>4)continue;
      this.shortcuts.add(branch);
      this.lastShortcut=branch;
      for(const agent of this.agents){
        if(roleOf(agent)==='racer'&&range(agent,player)<90){
          agent.shortcutDelayUntil=this.time+2.8;
          agent.tucking=false;
        }
      }
    }
  }

  updateIntercept(progress,player,offscreen,routeGap=0){
    if(this.intercept){
      const warning=this.intercept;
      if(this.time<warning.at)return;
      this.intercept=null;
      if(this.stars<3||progress>warning.branch.hi-12||range(warning.point,player)<24||!this.clear(warning.point))return;
      if(this.agents.length>=MAX_PURSUERS){
        const index=this.agents.findLastIndex(agent=>!agent.launch&&offscreen(agent)&&range(agent,player)>90);
        if(index<0)return;
        this.agents.splice(index,1);
      }
      this.agents.push({...warning.point,heading:warning.heading,id:this.nextAgent++,role:'scout',
        speed:18,bank:0,health:PURSUER_HEALTH});
      this.spawnAfter=Math.max(this.spawnAfter,this.time+1);
      return;
    }
    if(this.stars<3||!this.goal||routeGap>55)return;
    if(this.agents.length>=MAX_PURSUERS&&
      !this.agents.some(agent=>!agent.launch&&offscreen(agent)&&range(agent,player)>90))return;
    const branch=this.route.branches?.find(candidate=>!this.intercepted.has(candidate)&&
      progress>=candidate.lo-135&&progress<candidate.lo-55);
    if(!branch)return;
    const point=branch.points.slice(Math.floor(branch.points.length*.45),-3).find(candidate=>
      this.clear(candidate)&&range(candidate,player)>45);
    if(!point)return;
    const last=branch.points.at(-1);
    this.intercepted.add(branch);
    this.intercept={point,branch,at:this.time+INTERCEPT_WARNING,heading:Math.atan2(last.x-point.x,last.z-point.z)};
  }

  step(dt,player,offscreen=()=>true,surface=()=>0,collision=()=>null,detonate=()=>null){
    if(this.outcome)return null;
    this.trips=[];
    this.lastShortcut=null;
    this.time+=dt;
    this.shots=this.shots.filter(shot=>shot.until>this.time);
    this.advanceAllies(dt,surface);
    const activeMist=this.effects.mist?.until>this.time?this.effects.mist:null;
    if(this.stars>=2){
      for(const agent of this.agents){
        const gap=range(agent,player);
        if(roleOf(agent)==='guard'&&!agent.guardUsed&&!agent.launch&&agent.health!==0&&!(agent.stunUntil>this.time)&&
          gap<=21&&!fogBlocks(activeMist,agent,player)&&Math.abs(surface(agent.x,agent.z)-surface(player.x,player.z))<8){
          agent.guardUsed=true;
          agent.guardUntil=this.time+GUARD_DURATION;
        }
      }
    }
    this.traps=this.traps.filter(trap=>this.time<trap.until);
    this.blasts=this.blasts.filter(blast=>this.time<blast.until);
    for(let i=0;i<this.bombs.length;){
      const bomb=this.bombs[i];
      if(this.time<bomb.until){i++;continue;}
      this.bombs.splice(i,1);
      const duration=PATROL_ITEMS[bomb.type].duration;
      const target=bomb.target;
      const current=target&&this.agents.includes(target)&&!target.launch&&target.health!==0?this.bombLead(target,.06):null;
      const end=current&&range(current,bomb.end)<14&&this.clear(current)?current:bomb.end;
      const blast={...end,type:bomb.type,heading:bomb.heading,radius:bomb.radius,start:this.time,
        until:this.time+duration,duration};
      this.blasts.push(blast);
      const hit=detonate(blast);
      if(hit&&this.agents.some(agent=>hit.has(agent)))this.contact=0;
    }
    for(const wave of this.waves){
      const radius=wave.radius*clamp((this.time-wave.start)/wave.duration,0,1);
      for(const agent of this.agents){
        const gap=range(agent,wave);
        if(agent.launch||wave.hit.has(agent)||gap>radius||
          Math.abs(surface(agent.x,agent.z)-surface(wave.x,wave.z))>7+gap*.4)continue;
        wave.hit.add(agent);
        const result=this.damage(agent,'pulse',wave.damage);
        if(result==='blocked')continue;
        if(result==='hit')this.repel(agent,wave,1.05,36,wave.duration,'pulse');
        if(range(agent,player)<=CAPTURE_RADIUS)this.contact=0;
      }
    }
    this.waves=this.waves.filter(wave=>this.time<wave.until);
    for(const [type,effect] of Object.entries(this.effects)){
      if(this.time>=effect.until)delete this.effects[type];
    }
    this.trailSegments=layTrails(this.trailSegments,this.effects,player,this.time);
    if(activeMist)this.damageInMist(activeMist,surface);
    if(this.effects.boost)this.strikeAlong('boost',this.effects.boost,player,surface);
    if(player.airborne&&player.gliderRemaining>0&&this.glideStrike)this.strikeAlong('glider',this.glideStrike,player,surface);
    else this.glideStrike=null;
    this.fireRearShot(player,surface);
    const along=nearestOnRoute(player,this.route.points);
    const previous=this.furthest;
    if(along.distance<58)this.furthest=Math.max(previous,along.progress);
    for(let i=this.agents.length-1;i>=0;i--){
      const agent=this.agents[i];
      if(agent.launch?.finished||!agent.launch&&agent.downUntil<=this.time){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+REPLACEMENT_DELAY);
      }else if(!agent.launch&&range(agent,player)>145&&offscreen(agent)){
        this.agents.splice(i,1);
        this.spawnAfter=Math.max(this.spawnAfter,this.time+.65);
      }
    }
    if(!this.stars&&this.furthest>this.rearmAt)this.addStar();
    for(const fraction of [.24,.44,.64,.81]){
      const marker=this.route.length*fraction;
      if(previous<marker&&this.furthest>=marker)this.addStar();
    }

    this.updateShortcuts(player,surface);
    this.updateIntercept(along.progress,player,offscreen,along.distance);
    const mist=activeMist;
    const concealed=mist&&range(mist,player)<mist.radius;
    const desired=this.stars?pursuerCount(this.stars)-Number(Boolean(this.intercept)):0;
    if(!concealed&&this.agents.length<desired&&this.time>=this.spawnAfter){
      const point=this.reinforcement(player,along.progress,offscreen,surface);
      this.spawnAfter=this.time+(point?(this.stars>=4?1.6:2.15):.45);
      if(point){
        const id=this.nextAgent++;
        this.agents.push({...point,speed:clamp(player.speed+(point.approach==='rear'?5:-1),13,52),bank:0,id,role:ROLES[id%ROLES.length],health:PURSUER_HEALTH});
        this.lastSeen=this.time;
      }
    }

    const shield=Boolean(this.effects.shield);
    this.updateManeuver(player,mist,shield,surface);
    let threat=Infinity,contactDistance=Infinity;
    const playerHeight=surface(player.x,player.z);
    for(const agent of this.agents){
      if(agent.launch||agent.health===0)continue;
      const burn=agent.burn;
      if(burn&&this.time>=burn.next&&this.time<burn.until){
        burn.next=this.time+1;
        this.damage(agent,'flametrail',burn.damage);
      }
      this.applyTrailContacts(agent,agent,surface);
      if(agent.health===0)continue;
      const separation=range(agent,player);
      if(shield&&separation<=this.effects.shield.radius&&(agent.stunUntil??0)<=this.time&&
        Math.abs(surface(agent.x,agent.z)-playerHeight)<2){
        const barrier=this.effects.shield;
        if(!barrier.hit.has(agent)){
          barrier.hit.add(agent);
          const result=this.damage(agent,'shield',PATROL_ITEMS.shield.damage);
          if(result==='down')continue;
          if(result==='blocked')continue;
        }
        this.repel(agent,player,.55,32,.28);
      }
      if(agent.stunUntil>this.time){
        if(agent.repelUntil>this.time){
          const sliding=agent.fallDuration>0;
          const factor=sliding?clamp((agent.repelUntil-this.time)/TRIP_SLIDE,0,1):1;
          const step=(agent.repelSpeed||16)*dt*factor;
          const point={x:agent.x+Math.sin(agent.repelHeading)*step,z:agent.z+Math.cos(agent.repelHeading)*step};
          if(this.clear(point)){
            if(agent.repelSource==='pulse'&&this.triggerTrap(agent,point,agent.repelHeading,agent.repelSpeed,surface,true))continue;
            Object.assign(agent,point);
          }
        }
        agent.bank*=Math.exp(-dt*8);
        continue;
      }
      const onRoute=along.distance<24&&separation>32?nearestOnRoute(agent,this.route.points):null;
      const following=onRoute&&onRoute.distance<24&&along.progress>onRoute.progress+12;
      const ally=this.followAlly(agent,surface);
      if(ally&&range(agent,ally)<3.5&&Math.abs(surface(agent.x,agent.z)-surface(ally.x,ally.z))<4){
        ally.until=this.time;
        if(this.damage(agent,'crew',PATROL_ITEMS.crew.damage)==='hit')this.repel(agent,ally,.7,11,.22);
        continue;
      }
      const illusion=agent.mirage?.until>this.time?agent.mirage.point:null;
      const bait=ally??illusion;
      const distracted=Boolean(bait),chilled=agent.chillUntil>this.time;
      const id=agent.id??0;
      const fogged=Boolean(mist&&range(mist,agent)<mist.radius);
      const lost=fogBlocks(mist,agent,player);
      agent.fogSlowed=fogged;
      if(!lost){
        agent.lastTarget??={};
        Object.assign(agent.lastTarget,{x:player.x,z:player.z});
        if(agent.mistSearch)agent.aimAt=0;
        agent.mistSearch=null;
      }
      const delayed=agent.shortcutDelayUntil>this.time;
      const role=roleOf(agent);
      const enableTuck=role==='racer'&&!chilled&&!delayed&&!lost&&!fogged&&!distracted&&separation>(agent.tucking?21:36);
      if(this.time>=(agent.gapCheckAt??0)){
        agent.losingGround=agent.previousGap===undefined||separation>=agent.previousGap-2;
        agent.previousGap=separation;
        agent.gapCheckAt=this.time+.65;
      }
      if(!lost&&this.time>=(agent.aimAt??0)){
        const lane=Math.sin(id*2.4+this.time*.7)*(3+Math.min(5,agent.speed*.16))*clamp(separation/26,.18,1);
        const lookAhead=enableTuck?32:22;
        const target=distracted?bait:following?routePoint(this.route,onRoute.progress+lookAhead,enableTuck?lane*.35:lane):{
          x:player.x+Math.cos(player.heading)*lane,z:player.z-Math.sin(player.heading)*lane,
        };
        agent.aim=target;
        agent.aimAt=this.time+.30+(id%3)*.09;
      }
      const maneuver=this.dash?.agent===agent&&this.time>=this.dash.at?this.dash:null;
      const cutPoint=maneuver?.point&&range(agent,maneuver.point)>3?maneuver.point:null;
      const target=distracted?bait:lost?this.searchThroughMist(agent,mist):cutPoint??agent.aim;
      const dx=target.x-agent.x,dz=target.z-agent.z;
      const aim=Math.atan2(dx,dz);
      const delta=turnAngle(agent.heading,aim);

      const probe={x:agent.x+Math.sin(agent.heading)*9,z:agent.z+Math.cos(agent.heading)*9};
      const downhill=surface(agent.x,agent.z)-surface(probe.x,probe.z);
      agent.tucking=!maneuver&&enableTuck&&(agent.losingGround||agent.tucking)&&
        downhill>.5&&Math.abs(delta)<(agent.tucking?.58:.36)&&this.clear(probe);
      const normal=clamp(4+this.stars*1.45+player.speed*.78-(role==='guard'?2:0),12,49);
      const tuckedPace=clamp(Math.max(normal+11,player.speed+6)+downhill,24,60);
      const cruise=distracted?normal*.86:maneuver?Math.min(58,normal+(maneuver.kind==='cut'?9:role==='sprinter'?17:12)):agent.tucking?tuckedPace:normal;
      const turningAround=lost&&agent.mistSearch?.detour&&!distracted&&Math.abs(delta)>.32;
      const pace=chilled?cruise*.52:delayed?cruise*.66:fogged?Math.min(cruise*.42,10):turningAround?Math.min(cruise,14)
        :lost&&range(agent,target)<3?3:cruise;
      agent.speed+=(pace-agent.speed)*Math.min(1,dt*(distracted?9:fogged||turningAround?6:agent.tucking?2.5:1.7));
      const step=agent.speed*dt;
      const turnRate=distracted?3.5:agent.tucking?.63:Math.min(maneuver?.kind==='cut'?2.05:role==='scout'?1.85:1.6,Math.max(5,agent.speed)/16);
      const heading=agent.heading+clamp(delta,-dt*turnRate,dt*turnRate);
      const point={x:agent.x+Math.sin(heading)*step,z:agent.z+Math.cos(heading)*step};
      this.applyTrailContacts(agent,point,surface);
      if(agent.health===0||this.triggerTrap(agent,point,heading,agent.speed,surface))continue;
      if(step>0&&collision(agent,point)){
        agent.tucking=false;
        agent.fallDuration=agent.speed>9?2.2:1.2;
        agent.stunUntil=this.time+agent.fallDuration;
        agent.repelUntil=0;
        agent.aimAt=0;
        agent.speed=0;
        agent.heading=heading+(id%2?-1.15:1.15);
        continue;
      }
      if(this.pathClear(point)){
        agent.bank=clamp(-turnAngle(agent.heading,heading)*19,-.65,.65);
        Object.assign(agent,point,{heading});
      }else{
        agent.heading=heading;
        agent.speed*=.80;
      }
      if(!distracted&&!lost){
        const gap=range(agent,player);
        threat=Math.min(threat,gap);
        if(gap<=CAPTURE_RADIUS&&Math.abs(surface(agent.x,agent.z)-playerHeight)<2)
          contactDistance=Math.min(contactDistance,gap);
      }
    }

    for(const shot of this.shots){
      if(!shot.target)continue;
      const {x,z}=shot.target;
      Object.assign(shot.end,{x,z,y:surface(x,z)+1.05});
      if(this.time>=shot.impact)shot.target=null;
    }
    if(threat<75)this.lastSeen=this.time;
    if(this.stars&&this.agents.some(agent=>!agent.launch&&agent.health!==0)&&this.time-this.lastSeen>12){
      this.stars--;
      this.lastSeen=this.time;
      if(!this.stars){
        this.rearmAt=this.furthest+90;
        this.agents=this.agents.filter(agent=>agent.launch);
      }
      else if(this.agents.length>pursuerCount(this.stars)){
        const index=this.agents.findLastIndex(agent=>!agent.launch);
        if(index>=0)this.agents.splice(index,1);
      }
    }
    const inReach = this.stars > 0 && contactDistance <= CAPTURE_RADIUS &&
      !player.airborne && this.time>=this.evadeUntil && !shield;
    this.contact = inReach ? this.contact + dt : 0;
    if(inReach){
      this.health=Math.max(0,this.health-this.damageRate*dt);
      this.escapeArmed=true;
    }else if(this.escapeArmed&&this.agents.every(agent=>agent.launch||agent.stunUntil>this.time||range(agent,player)>12)){
      this.escapes++;
      this.escapeArmed=false;
    }
    this.goal?.step(dt,player,this);
    if(this.health <= 1e-8){
      this.health=0;
      this.outcome = 'caught';
      return 'caught';
    }

    if(!player.airborne&&!player.crashRemaining){
      const medkit=this.pickups.find(p=>p.type==='medkit'&&!p.taken&&range(p,player)<5.5);
      if(medkit&&this.health<MAX_HEALTH){
        medkit.taken=true;
        return this.heal(this.medkitHeal) ? 'medkit' : null;
      }
      let blocked=null;
      for(const pickup of this.pickups){
        if(pickup.type==='medkit'||pickup.taken||range(pickup,player)>=5.5)continue;
        const type=pickup.type==='supply'?this.refillType(pickup.fallback):pickup.type;
        if(type&&canStoreItem(this.inventory,type)){
          pickup.taken=true;
          this.inventory.push(type);
          this.lastPickup=type;
          this.blockedPickup=null;
          return 'pickup';
        }
        blocked??=pickup;
      }
      if(blocked&&blocked!==this.blockedPickup){
        this.blockedPickup=blocked;
        return 'pickup-full';
      }
      if(blocked)return null;
    }
    this.blockedPickup=null;
    return null;
  }

  refillType(fallback){
    const stacks=this.stacks;
    const partial=stacks.reduce((best,stack)=>stack.type!=='avalanche'&&stack.count<ITEM_STACK_LIMIT&&
      (!best||stack.count<best.count)?stack:best,null);
    return partial?.type??[fallback,...Object.keys(PATROL_ITEMS)]
      .find(type=>type&&type!=='avalanche'&&canStoreItem(this.inventory,type));
  }
}
