import * as THREE from 'three';
import {poleSnowContact} from './ski-gesture.js';
export const POLE_LENGTH=2.65;
const Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
// The hand joint is the wrist. Place the grip between thumb and finger bases,
// inside the native palm, rather than attaching equipment to the wrist origin.
export function createPalmSocket(hand,sign){
 const socket=new THREE.Object3D();socket.name=`Pole_palm_socket_${sign>0?'l':'r'}`;
 const finger=hand.children.find(b=>b.name===`middle_01_${sign>0?'l':'r'}`);
 socket.position.set(sign*.010,(finger?.position.y||.115)*.58,.012);hand.add(socket);return socket;
}
// Run only after the final rendered pose (including NPC bone interpolation).
// Equipment follows the hand; contact may orient the shaft, never detach it.
export function syncHandPoles(athlete){
 const {humanRig:rig,body,arms,plant}=athlete.userData;if(!rig||!body||!arms)return;
 athlete.updateWorldMatrix(true,false);athlete.userData.poleContact=null;
 for(const arm of arms){
  const socket=arm.palmSocket;if(!socket)continue;
  const worldGrip=socket.getWorldPosition(new THREE.Vector3()),grip=body.worldToLocal(worldGrip.clone()),direction=(arm.poleDirection||arm.target?.poleAim||new THREE.Vector3(arm.sign*.08,-1,-.65)).clone().normalize();
  if(arm.target?.planted&&plant?.active&&plant.contact){
   if(plant.contactStarted&&arm.contactId!==plant.contactId){
    arm.contactId=plant.contactId;
    plant.worldPoint=arm.poleSurface?poleSnowContact(worldGrip,direction.clone().transformDirection(body.matrixWorld),POLE_LENGTH*body.getWorldScale(new THREE.Vector3()).y,arm.poleSurface):null;
    if(plant.worldPoint)athlete.userData.poleContact=plant.worldPoint.clone();
   }
   if(plant.worldPoint){const local=body.worldToLocal(plant.worldPoint.clone());if(Math.abs(local.distanceTo(grip)-POLE_LENGTH)<=.05)direction.copy(local).sub(grip).normalize();else{plant.contact=false;plant.worldPoint=null;athlete.userData.poleContact=null;}}
   else plant.contact=false;
  }else if(arm.target?.planted){plant.contact=false;plant.worldPoint=null;}
  arm.pole.position.copy(grip).addScaledVector(direction,POLE_LENGTH/2);arm.pole.quaternion.setFromUnitVectors(Y,direction);arm.pole.scale.y=POLE_LENGTH;
  arm.basket.position.copy(grip).addScaledVector(direction,POLE_LENGTH-.12);arm.basket.quaternion.setFromUnitVectors(Z,direction);
  arm.poseGrip=worldGrip;arm.poseMetrics={...arm.poseMetrics,contact:!!(arm.target?.planted&&plant?.active&&plant.contact)};
 }
}
