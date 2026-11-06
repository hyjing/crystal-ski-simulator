import {clamp} from './physics.js';
export function flyDrone(drone,input,terrain,dt){
 dt=clamp(dt,0,.1);const speed=(input.fast?120:35),forward=(input.forward||0),right=input.right||0,up=input.up||0,norm=Math.max(1,Math.hypot(forward,right,up));
 drone.x+=(Math.sin(drone.yaw)*forward+Math.cos(drone.yaw)*right)*speed*dt/norm;
 drone.z+=(Math.cos(drone.yaw)*forward-Math.sin(drone.yaw)*right)*speed*dt/norm;
 drone.y+=up*speed*dt/norm;
 const hx=(terrain.width-1)*terrain.spacing/2-12,hz=(terrain.height-1)*terrain.spacing/2-12;
 drone.x=clamp(drone.x,-hx,hx);drone.z=clamp(drone.z,-hz,hz);drone.y=clamp(drone.y,terrain.surface(drone.x,drone.z)-1200+5,3000);return drone;
}
