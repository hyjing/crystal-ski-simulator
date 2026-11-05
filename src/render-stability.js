import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Keep light-space texels fixed in world space as the skier moves.
export function stableShadowTarget(focus,direction,width,mapSize){
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
  const up=new THREE.Vector3().crossVectors(direction,right).normalize(),texel=width/mapSize;
  const x=focus.dot(right),y=focus.dot(up);
  return focus.clone().addScaledVector(right,Math.round(x/texel)*texel-x).addScaledVector(up,Math.round(y/texel)*texel-y);
}
export function stableTreeShadowGeometry(){
  const parts=[];
  for(const [radius,height,y] of [[2.1,6,5],[1.9,6,8],[1.55,6,11],[1.05,6,14],[.5,4,17]]){const g=new THREE.ConeGeometry(radius,height,8);g.translate(0,y,0);parts.push(g);}
  const trunk=new THREE.CylinderGeometry(.07,.20,19,6);trunk.translate(0,9.5,0);parts.push(trunk);const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
export function createStableShadowBatch(geometry,material,count){
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name='Stable forest shadow proxy';mesh.castShadow=true;mesh.receiveShadow=false;
  // Standard renderer hooks: no vertices in the color pass, fixed identity in depth.
  mesh.onBeforeRender=()=>{mesh.count=0;};mesh.onBeforeShadow=()=>{mesh.count=count;};return mesh;
}
