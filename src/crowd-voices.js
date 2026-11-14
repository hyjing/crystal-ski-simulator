const CLIP_COUNTS={queue:4,lodge:4,slope:4,staff:3,lift:1};
const GROUPS={
  queue:{radius:20,gain:.48,cooldown:17},
  lodge:{radius:22,gain:.43,cooldown:19},
  slope:{radius:10,gain:.63,cooldown:22},
  staff:{radius:15,gain:.52,cooldown:25},
  lift:{radius:32,gain:.65,cooldown:16},
};

export function voiceMix(group,point,listener,right){
  const {radius,gain}=GROUPS[group];
  const dx=point.x-listener.x,dy=point.y-listener.y,dz=point.z-listener.z;
  const distance=Math.hypot(dx,dy,dz);
  const pan=(dx*right.x+dy*right.y+dz*right.z)/Math.max(distance,2);
  return {distance,gain:gain*Math.max(0,1-distance/radius)**1.65,
    pan:Math.max(-.9,Math.min(.9,pan)),cutoff:780+5000*Math.max(0,1-distance/radius)};
}

export class CrowdVoices {
  constructor(context,baseURL){
    this.context=context;
    this.baseURL=baseURL;
    this.clips={};
    this.lastClip={};
    this.cooldowns=new Map();
    this.nextScan=0;
    this.nextLine=0;
  }

  preload(){
    for(const [group,count] of Object.entries(CLIP_COUNTS)){
      this.clips[group]=[];
      for(let i=1;i<=count;i++){
        fetch(`${this.baseURL}assets/voices/${group}-${i}.mp3`)
          .then(response=>{if(response.ok)return response.arrayBuffer();})
          .then(bytes=>bytes&&this.context.decodeAudioData(bytes))
          .then(buffer=>{if(buffer)this.clips[group].push(buffer);})
          .catch(()=>{});
      }
    }
  }

  update({enabled,time,listener,right,traffic,stationLife,boarding}){
    if(!enabled){
      this.mute();
      return;
    }
    const active=this.active;
    if(active){
      const point=active.emitter.position();
      this.applyMix(active,point?voiceMix(active.emitter.group,point,listener,right):null);
    }
    if(time<this.nextScan)return;
    this.nextScan=time+.16;
    for(const [id,until] of this.cooldowns)if(time>=until)this.cooldowns.delete(id);

    if(boarding&&!this.cooldowns.has(boarding.id)){
      const mix=voiceMix('lift',boarding.point,listener,right);
      if(mix.gain>.025&&this.clips.lift?.length){
        this.mute();
        this.play({id:boarding.id,group:'lift',position:()=>boarding.point},mix,time);
        return;
      }
    }
    if(this.active||time<this.nextLine)return;
    const candidates=[];
    const offer=(id,group,position)=>{
      if(this.cooldowns.has(id)||!this.clips[group]?.length)return;
      const point=position();
      if(!point)return;
      const mix=voiceMix(group,point,listener,right);
      if(mix.gain>.04)candidates.push({emitter:{id,group,position},mix});
    };
    for(const [i,actor] of (traffic?.actors??[]).entries()){
      const state=traffic.states[i];
      const group=state.kind==='lodge'?'lodge':'slope';
      offer(`visitor-${i}`,group,()=>{
        if(state.indoor||state.launch||state.fall)return null;
        if(group==='lodge')return actor.visible?actor.position:null;
        const p=state.point;
        if(!p||state.speed<=3||Math.hypot(p.x-listener.x,p.z-listener.z)>GROUPS.slope.radius)return null;
        return {x:p.x,y:traffic.terrain.surface(p.x,p.z)-1198.5,z:p.z};
      });
    }
    for(const [i,actor] of (stationLife?.actors??[]).entries()){
      const id=actor.userData.stationId;
      const role=i%3;
      offer(`station-${id}-${role}`,role===2?'queue':'staff',
        ()=>actor.visible&&id===actor.userData.stationId?actor.position:null);
    }
    const next=candidates.sort((a,b)=>b.mix.gain-a.mix.gain)[0];
    if(next)this.play(next.emitter,next.mix,time);
  }

  applyMix({gain,pan,filter},mix){
    const now=this.context.currentTime;
    gain.gain.setTargetAtTime(mix?.gain??0,now,.08);
    if(pan)pan.pan.setTargetAtTime(mix?.pan??0,now,.06);
    filter.frequency.setTargetAtTime(mix?.cutoff??780,now,.1);
  }

  play(emitter,mix,time){
    const c=this.context,{group}=emitter;
    const clips=this.clips[group];
    const available=clips.length>1?clips.filter(clip=>clip!==this.lastClip[group]):clips;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    const pan=c.createStereoPanner?.();
    source.buffer=available[Math.floor(Math.random()*available.length)];
    this.lastClip[group]=source.buffer;
    filter.type='lowpass';
    gain.gain.value=0;
    source.connect(filter).connect(gain);
    if(pan)gain.connect(pan).connect(c.destination);
    else gain.connect(c.destination);
    const voice={emitter,source,filter,gain,pan};
    this.active=voice;
    this.applyMix(voice,mix);
    this.cooldowns.set(emitter.id,time+GROUPS[group].cooldown);
    this.nextLine=time+source.buffer.duration+(group==='slope'?2.5:1.4)+Math.random()*2;
    source.onended=()=>{
      source.disconnect();filter.disconnect();gain.disconnect();pan?.disconnect();
      if(this.active===voice)this.active=null;
    };
    source.start();
  }

  mute(){
    if(!this.active)return;
    const voice=this.active;
    this.active=null;
    this.applyMix(voice,null);
    voice.source.stop(this.context.currentTime+.08);
  }
}
