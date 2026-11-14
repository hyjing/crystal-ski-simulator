// Reuse the user-enabled audio context; distance attenuates the terminal motor.
export class StationAudio{
 constructor(context){this.context=context;this.motor=context.createGain();this.motor.gain.value=0;this.motor.connect(context.destination);for(const frequency of [55,110]){const o=context.createOscillator();o.frequency.value=frequency;o.type='sine';o.connect(this.motor);o.start();}this.lastBell=-100;}
 update(stations,player,enabled,time,ready=false){const distance=Math.min(...stations.map(s=>Math.hypot(s.x-player.x,s.z-player.z)),1000);this.motor.gain.setTargetAtTime(enabled?Math.max(0,1-distance/75)*.018:0,this.context.currentTime,.3);if(enabled&&ready&&time-this.lastBell>12){this.lastBell=time;this.chime();}}
 chime(){const c=this.context;for(let i=0;i<2;i++){const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.16;o.frequency.value=i?880:660;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.025,t+.015);g.gain.exponentialRampToValueAtTime(.0001,t+.45);o.connect(g).connect(c.destination);o.start(t);o.stop(t+.5);o.onended=()=>{o.disconnect();g.disconnect();};}}
}
