import * as THREE from 'three';import {resortMaterials} from './resort-assets.js';import {sitePoint} from './npc-routines.js';
const shared=resortMaterials(),rampMaterial=new THREE.MeshStandardMaterial({color:'#dadecc',roughness:1,side:THREE.DoubleSide});
export function createRestArea(scene,terrain,site){
 const root=new THREE.Group();root.name='Authored rest cabin with working doorway';root.position.set(site.x,site.floor-1200,site.z);root.rotation.y=site.heading;scene.add(root);
 const box=(parent,w,h,d,x,y,z,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;m.userData.structureCollider=h>.09;m.userData.dynamicCollider=parent.name==='Working rest cabin door';parent.add(m);return m;};
 box(root,5.3,.15,4.3,0,-.07,-4.5,shared.stone);box(root,.16,2.8,4.2,-2.6,1.4,-4.5,shared.wood);box(root,.16,2.8,4.2,2.6,1.4,-4.5,shared.wood);box(root,5.3,2.8,.16,0,1.4,-6.55,shared.wood);
 // Split front wall: the opening is real geometry, never a painted-on doorway.
 box(root,1.9,2.8,.16,-1.65,1.4,-2.45,shared.wood);box(root,1.9,2.8,.16,1.65,1.4,-2.45,shared.wood);box(root,1.4,.55,.18,0,2.525,-2.45,shared.wood);
 for(const side of [-1,1]){const roof=box(root,2.95,.18,4.8,side*1.34,3.22,-4.5,shared.wood);roof.rotation.z=-side*.22;const snow=box(root,3.02,.14,4.9,side*1.34,3.39,-4.5,shared.snow);snow.rotation.z=-side*.22;}for(const side of [-1,1]){box(root,.10,2.6,.13,side*2.5,1.35,-2.27,shared.dark);box(root,1.3,1.0,.08,side*1.65,1.65,-2.34,shared.glass);box(root,.05,1.05,.12,side*1.65,1.65,-2.25,shared.paint);box(root,1.35,.05,.12,side*1.65,1.65,-2.25,shared.paint);}for(const sign of [-1,1])box(root,.09,2.3,.23,sign*.73,1.15,-2.34,shared.dark);
 const door=new THREE.Group();door.name='Working rest cabin door';door.position.set(-.69,0,-2.34);root.add(door);box(door,1.36,2.22,.07,.68,1.11,0,shared.paint);box(door,.85,.85,.08,.68,1.55,.01,shared.glass);box(door,.08,.28,.12,1.20,1.03,.09,shared.metal);
 box(root,4.7,.65,.55,0,.38,-6.0,shared.wood);box(root,1.2,.9,.65,1.8,.48,-5.6,shared.paint);
 if(site.coffee){
  box(root,.82,.71,.11,1.60,2.30,-2.25,shared.dark);
  box(root,.38,.28,.10,1.57,2.29,-2.16,shared.snow);
  box(root,.12,.19,.09,1.80,2.30,-2.16,shared.snow);
  box(root,.46,.035,.13,1.57,2.10,-2.16,shared.snow);
 }
 const a=sitePoint(site,0,.5),b=sitePoint(site,0,-2.45),low=terrain.surface(a.x,a.z)-site.floor+.02,positions=[-.8,low,.5,.8,low,.5,-.8,0,-2.45,.8,0,-2.45];const ramp=new THREE.BufferGeometry();ramp.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));ramp.setIndex([0,2,1,1,2,3]);ramp.computeVertexNormals();root.add(new THREE.Mesh(ramp,rampMaterial));
 for(const x of [-3.5,-4.8]){const p=sitePoint(site,x,-.4),y=terrain.surface(p.x,p.z)-site.floor;box(root,1.1,.11,.55,x,y+.48,-.4,shared.wood);box(root,1.1,.55,.10,x,y+.80,-.70,shared.wood);for(const side of [-1,1])box(root,.08,.48,.42,x+side*.4,y+.24,-.4,shared.metal);}
 return{root,door,update:()=>{door.rotation.y=-Math.PI*.5*site.doorOpen;},dispose:()=>{scene.remove(root);root.traverse(o=>o.geometry?.dispose());}};
}
export function setVisitorProp(actor,kind){
 if(actor.userData.refreshmentKind===kind)return;const old=actor.userData.refreshment;if(old){actor.remove(old);old.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}actor.userData.refreshmentKind=kind;if(!kind){actor.userData.refreshment=null;return;}
 const g=new THREE.Group();g.name=kind==='cup'?'Hand-held warm drink':'Hand-held sandwich';g.scale.setScalar(1/.52);const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.85}),add=(geo,m,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);g.add(mesh);};
 if(kind==='cup'){add(new THREE.CylinderGeometry(.045,.034,.12,12),mat('#f2e8d3'),0,.03,0);add(new THREE.CylinderGeometry(.047,.047,.012,12),mat('#333c3f'),0,.096,0);add(new THREE.CylinderGeometry(.041,.038,.045,12),mat('#b97845'),0,.025,0);}else{add(new THREE.BoxGeometry(.15,.028,.10),mat('#dca65e'),0,.065,.025);add(new THREE.BoxGeometry(.15,.028,.10),mat('#dca65e'),0,.005,.025);add(new THREE.BoxGeometry(.16,.018,.11),mat('#6c8b43'),0,.035,.025);}
 actor.add(g);actor.userData.refreshment=g;
}
const handPoint=new THREE.Vector3();
export function updateVisitorProp(actor,show=true,consume=0){const prop=actor.userData.refreshment,hand=actor.userData.humanRig?.bones.hand_r;if(!prop||!hand)return;prop.visible=show;hand.updateWorldMatrix(true,false);hand.getWorldPosition(handPoint);prop.position.copy(actor.worldToLocal(handPoint));prop.rotation.set(actor.userData.refreshmentKind==='cup'?-consume*.35:-consume*.10,0,0);}
