const PREFIX='ski-ghost:v1:';
const MAX_POINTS=2400;

export function ghostKey(mountain,route,mode){
  return PREFIX+[mountain,route,mode].join(':');
}

export function readGhost(storage,key){
  try{
    const value=JSON.parse(storage.getItem(key));
    if(!value||!Number.isFinite(value.time)||value.time<=0||
      !Number.isFinite(value.health)||value.health<0||value.health>100||
      !Array.isArray(value.points)||value.points.length<2||value.points.length>MAX_POINTS)return null;
    let previous=-1;
    for(const point of value.points){
      if(!Array.isArray(point)||point.length!==4||!point.every(Number.isFinite)||
        point[0]<=previous||point[0]>value.time+.001)return null;
      previous=point[0];
    }
    return value;
  }catch{return null;}
}

export class RunGhost {
  constructor(){this.points=[];this.valid=true;this.next=0;this.section=0;}

  advance(progress,length){
    const next=(this.section+1)*length/12;
    if(this.section<11&&Math.abs(progress-next)<length/24)this.section++;
  }

  sample(time,x,y,z){
    if(!this.valid||time<this.next)return;
    if(this.points.length>=MAX_POINTS){this.valid=false;return;}
    this.points.push([time,x,y,z].map(n=>Math.round(n*1000)/1000));
    this.next=time+.22;
  }

  save(storage,key,time,health,mode){
    if(!this.valid||this.section<11||this.points.length<2)return false;
    const best=readGhost(storage,key);
    if(best&&(best.time<time||best.time===time&&(mode!=='patrol'||best.health>=health)))return false;
    try{
      storage.setItem(key,JSON.stringify({time,health,points:this.points}));
      return true;
    }catch{return false;}
  }
}

export function ghostPosition(ghost,time){
  const points=ghost?.points;
  if(!points||time<points[0][0]||time>ghost.time)return null;
  let low=0,high=points.length-1;
  while(high-low>1){
    const mid=(low+high)>>1;
    if(points[mid][0]<=time)low=mid;
    else high=mid;
  }
  const a=points[low],b=points[high],t=Math.min(1,(time-a[0])/(b[0]-a[0]));
  return {x:a[1]+(b[1]-a[1])*t,y:a[2]+(b[2]-a[2])*t,z:a[3]+(b[3]-a[3])*t};
}
