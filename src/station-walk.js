const step = 1.2;
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

export function clearStationLine(from,to,clear) {
  const count = Math.max(1,Math.ceil(distance(from,to)/.23));
  for (let i=1;i<=count;i++) {
    const t=i/count;
    if (!clear({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t})) return false;
  }
  return true;
}

function openPoint(point,clear) {
  if (clear(point)) return point;
  for (const radius of [.65,1.2,1.8,2.4,3.3]) {
    for (let i=0;i<12;i++) {
      const angle=i*Math.PI/6;
      const p={x:point.x+radius*Math.cos(angle),z:point.z+radius*Math.sin(angle)};
      if (clear(p)) return p;
    }
  }
  return null;
}

function searchStationPath(start,goal,clear) {
  if (clearStationLine(start,goal,clear)) return [start,goal];
  const limits = {left:Math.min(start.x,goal.x)-20,right:Math.max(start.x,goal.x)+20,
    top:Math.min(start.z,goal.z)-20,bottom:Math.max(start.z,goal.z)+20};
  const cached = new Map();
  const isClear = p => {
    const key=`${Math.round(p.x*20)}:${Math.round(p.z*20)}`;
    if (!cached.has(key)) cached.set(key,clear(p));
    return cached.get(key);
  };
  const first={...start,u:0,v:0,cost:0,priority:distance(start,goal),parent:null};
  const frontier=[first],costs=new Map([['0:0',0]]);
  const directions=[[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let explored=0;frontier.length&&explored<3800;explored++){
    frontier.sort((a,b)=>b.priority-a.priority);
    const current=frontier.pop();
    if(current.cost>costs.get(`${current.u}:${current.v}`))continue;
    if(distance(current,goal)<step*2&&clearStationLine(current,goal,isClear)){
      const route=[goal];
      for(let p=current;p;p=p.parent)route.push({x:p.x,z:p.z});
      route.reverse();
      const simplified=[route[0]];
      for(let i=0;i<route.length-1;){
        let end=route.length-1;
        while(end>i+1&&!clearStationLine(route[i],route[end],isClear))end--;
        simplified.push(route[end]);
        i=end;
      }
      return simplified;
    }
    for(const [du,dv] of directions){
      const u=current.u+du,v=current.v+dv,key=`${u}:${v}`;
      const x=start.x+u*step,z=start.z+v*step;
      const cost=current.cost+Math.hypot(du,dv)*step;
      if(x<limits.left||x>limits.right||z<limits.top||z>limits.bottom||cost>=(costs.get(key)??Infinity))continue;
      if(!clearStationLine(current,{x,z},isClear))continue;
      costs.set(key,cost);
      frontier.push({x,z,u,v,cost,priority:cost+distance({x,z},goal),parent:current});
    }
  }
  return null;
}

export function stationWalkPath(points,clear) {
  const start=openPoint(points[0],clear);
  if(!start)return null;
  const path=distance(points[0],start)>.001?[points[0],start]:[start];
  for(const waypoint of points.slice(1)){
    const goal=openPoint(waypoint,clear);
    if(!goal)return null;
    const section=searchStationPath(path.at(-1),goal,clear);
    if(!section)return null;
    path.push(...section.slice(1));
  }
  return path;
}
