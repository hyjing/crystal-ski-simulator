import * as THREE from 'three';
const point=new THREE.Vector3();
function contactParts(actor,walking){
 const key=walking?'bootContacts':'skiContacts';if(actor.userData[key])return actor.userData[key];const parts=[];
 if(walking){actor.userData.humanRig?.model.traverse(o=>{if(o.name.startsWith('Articulated_ski_boot'))for(const mesh of o.children.filter(c=>c.isMesh)){mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;parts.push({mesh,points:Float32Array.from([b.min.x,b.min.y,b.min.z,b.max.x,b.min.y,b.min.z,b.min.x,b.min.y,b.max.z,b.max.x,b.min.y,b.max.z])});}});}
 else for(const ski of actor.userData.skis||[]){const mesh=ski.children[3];if(!mesh)continue;const p=mesh.geometry.attributes.position,samples=[];for(let i=0;i<p.count;i++)if(i%4>=2)samples.push(p.getX(i),p.getY(i),p.getZ(i));parts.push({mesh,points:Float32Array.from(samples)});}
 actor.userData[key]=parts;return parts;
}
// Lift only as much as the actual rendered ski undersides / walking boot soles need.
export function fitSnowContact(actor,surface,walking=false){
 let lift=0;for(const {mesh,points} of contactParts(actor,walking)){mesh.updateWorldMatrix(true,false);for(let i=0;i<points.length;i+=3){point.set(points[i],points[i+1],points[i+2]).applyMatrix4(mesh.matrixWorld);lift=Math.max(lift,surface(point.x,point.z)-1200+.012-point.y);}}
 actor.position.y+=lift;actor.userData.contactLift=lift;return lift;
}
