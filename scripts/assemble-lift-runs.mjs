import fs from 'node:fs';
import {createTerrain,lonLatToUTM} from '../src/terrain.js';
const root=new URL('../',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(`public/data/${n}.json`,root)));
const terrain=createTerrain(read('crystal-dem')),network=read('crystal-trail-network'),lifts=read('crystal-infrastructure');
const ce=terrain.originUTM[0]+(terrain.width-1)*terrain.spacing/2,cn=terrain.originUTM[1]-(terrain.height-1)*terrain.spacing/2;
const project=([lon,lat])=>{const p=lonLatToUTM(lon,lat);return{x:p.e-ce,z:cn-p.n};};
const nodes=new Map(),edges=new Map();
for(const way of network.features){way.nodeIds.forEach((id,i)=>{if(!nodes.has(id)){const ll=way.geometry.coordinates[i],p=project(ll);nodes.set(id,{...p,ll,h:terrain.sample(p.x,p.z)});edges.set(id,[]);}});
 for(let i=1;i<way.nodeIds.length;i++)link(way.nodeIds[i-1],way.nodeIds[i],String(way.id),way.properties.name||'Mapped connector');
}
function link(a,b,way,name){if(a===b)return;const p=nodes.get(a),q=nodes.get(b),length=Math.hypot(p.x-q.x,p.z-q.z);for(const [from,to] of [[a,b],[b,a]]){const u=nodes.get(from),v=nodes.get(to);edges.get(from).push({to,way,name,length,cost:length+Math.max(0,v.h-u.h)*35});}}
// Junction snaps up to 50 m are authored approximations and are recorded in the output.
const ends=new Set(network.features.flatMap(f=>[f.nodeIds[0],f.nodeIds.at(-1)]));
for(const a of ends)for(const [b,q] of nodes){if(a===b)continue;const p=nodes.get(a);if(Math.hypot(p.x-q.x,p.z-q.z)<=50)link(a,b,null,'Short mapped junction');}
function nearest(ll){const p=project(ll);return [...nodes].map(([id,q])=>({id,distance:Math.hypot(p.x-q.x,p.z-q.z)})).sort((a,b)=>a.distance-b.distance)[0];}
function path(start,end,excluded){
 const dist=new Map([[start,0]]),previous=new Map(),queue=new Set([start]);
 while(queue.size){let current=[...queue].reduce((a,b)=>dist.get(a)<dist.get(b)?a:b);queue.delete(current);if(current===end)break;
  for(const edge of edges.get(current)){if(excluded.has(edge.way))continue;const cost=dist.get(current)+edge.cost;if(cost<(dist.get(edge.to)??Infinity)){dist.set(edge.to,cost);previous.set(edge.to,{from:current,edge});queue.add(edge.to);}}
 }
 if(!dist.has(end))throw new Error(`Disconnected mapped path ${start} → ${end}`);
 let ids=[end],legs=[];while(ids[0]!==start){const p=previous.get(ids[0]);ids.unshift(p.from);legs.unshift(p.edge);}return{ids,legs};
}
const definitions=[
 {id:'green-valley',name:'Green Valley',lift:'Green Valley',way:'127128250'},
 {id:'lucky-shot',name:'Lucky Shot',lift:'Rainier Express',way:'127128246',via:['127128255']},
 {id:'queens-run',name:'Queens Run',lift:'Forest Queen Express',way:'127126798'},
 {id:'mr-magoo',name:'Mr Magoo',lift:'Forest Queen Express',way:'127126794'},
 {id:'chappelles',name:"Chappelle's",lift:'Forest Queen Express',way:'127126801'},
 {id:'downhill',name:'Downhill',lift:'Forest Queen Express',way:'127126804'},
 {id:'gold-hills',name:'Gold Hills',lift:'Gold Hills',way:'127128464'},
 {id:'northway',name:'Northway',lift:'Northway',way:'1373900054',via:['129729321','1170413267']},
 {id:'otto-bahn',name:'Otto Bahn',lift:'Northway',way:'1373900052',via:['129727067','1373900053']},
 {id:'quicksilver',name:'Quicksilver',lift:'Quicksilver',way:'127128767'},
 {id:'tinkerbell',name:'Tinkerbell',lift:'Quicksilver',way:'127128768'},
];
const features=[];
for(const def of definitions){
 const lift=lifts.features.find(f=>f.properties.name===def.lift),ends=lift.geometry.coordinates;
 const ordered=[ends[0],ends.at(-1)].sort((a,b)=>{const p=project(a),q=project(b);return terrain.sample(q.x,q.z)-terrain.sample(p.x,p.z);});
 const [upper,lower]=ordered,start=nearest(upper),finish=nearest(lower),way=network.features.find(f=>f.id===def.way);
 const mandatory=[def.way,...def.via||[]],excluded=new Set(mandatory),ids=[],legs=[];
 let current=start.id;
 for(const identity of mandatory){
  const feature=network.features.find(f=>f.id===identity);let target=[...feature.nodeIds];
  if(nodes.get(target[0]).h<nodes.get(target.at(-1)).h)target.reverse();
  let approach;try{approach=path(current,target[0],excluded);}catch(error){
   const top=project(upper),entry=nodes.get(target[0]),distance=Math.hypot(top.x-entry.x,top.z-entry.z);
   if(ids.length||distance>300)throw error;
   approach={ids:[target[0]],legs:[]};start.distance=distance;
  }
  ids.push(...(ids.length?approach.ids.slice(1):approach.ids),...target.slice(1));
  legs.push(...approach.legs,{way:identity,name:feature.properties.name});current=target.at(-1);
 }
 const foot=project(lower),end=nodes.get(current),apronDistance=Math.hypot(foot.x-end.x,foot.z-end.z);
 if(apronDistance<180){finish.id=current;finish.distance=apronDistance;}
 const after=path(current,finish.id,excluded);ids.push(...after.ids.slice(1));legs.push(...after.legs);
 const coordinates=[upper,...ids.map(id=>nodes.get(id).ll),lower];
 const wayIds=[...new Set(legs.filter(l=>l.way).map(l=>l.way))],names=[...new Set(legs.filter(l=>l.way).map(l=>l.name))];
 let length=0;for(let i=1;i<coordinates.length;i++){const p=project(coordinates[i-1]),q=project(coordinates[i]);length+=Math.hypot(p.x-q.x,p.z-q.z);}
 console.log(def.name,Math.round(length),'m','station links',Math.round(start.distance),Math.round(finish.distance),names.join(' → '));
 features.push({type:'Feature',id:def.id,properties:{name:def.name,lift:def.lift,liftId:String(lift.id),primaryWayId:def.way,osmWayIds:wayIds,via:names,startLinkMeters:start.distance,finishLinkMeters:finish.distance,stationEndpoints:true,junctionLinks:legs.filter(l=>!l.way).map(l=>({length:l.length,name:l.name})),source:'OSM network itinerary; short station apron links are authored'},geometry:{type:'LineString',coordinates}});
}
if(!process.argv.includes('--patrol'))fs.writeFileSync(new URL('public/data/crystal-lift-runs.json',root),JSON.stringify({type:'FeatureCollection',source:'OpenStreetMap contributors',license:'ODbL 1.0',attributionUrl:'https://www.openstreetmap.org/copyright',features},null,2));


if(process.argv.includes('--patrol')){
 const startLift=lifts.features.find(f=>f.properties.name==='Rainier Express');
 const returnLift=lifts.features.find(f=>f.properties.name==='Quicksilver');
 const [upper]=orderedEndpoints(startLift),[,lower]=orderedEndpoints(returnLift);
 const start=nearest(upper),finish=nearest(lower),itinerary=path(start.id,finish.id,new Set());
 const osmWayIds=[...new Set(itinerary.legs.flatMap(leg=>leg.way?[leg.way]:[]))];
 const via=[...new Set(itinerary.legs.filter(leg=>leg.way).map(leg=>leg.name))];
 const feature={type:'Feature',id:'crystal-patrol-descent',
  properties:{name:'Summit to Quicksilver',difficulty:'advanced',lift:startLift.properties.name,liftId:String(startLift.id),
   returnLift:returnLift.properties.name,returnLiftId:String(returnLift.id),primaryWayId:osmWayIds[0],osmWayIds,via,
   source:'Game itinerary using OSM pistes and short approximate connectors'},
  geometry:{type:'LineString',coordinates:[upper,...itinerary.ids.map(id=>nodes.get(id).ll),lower]}};
 const output={type:'FeatureCollection',features:[feature]};
 fs.writeFileSync(new URL('public/data/crystal-patrol-run.json',root),JSON.stringify(output,null,2)+'\n');
}
function orderedEndpoints(lift){
 const points=lift.geometry.coordinates;
 return [points[0],points.at(-1)].sort((a,b)=>{
  const p=project(a),q=project(b);
  return terrain.sample(q.x,q.z)-terrain.sample(p.x,p.z);
 });
}
