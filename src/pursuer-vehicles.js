import * as THREE from 'three';

const paint=(color,roughness=.52)=>new THREE.MeshStandardMaterial({color,roughness});
const rubber=paint('#252c32',.92),metal=paint('#a1b2bd',.38);
const glass=new THREE.MeshStandardMaterial({color:'#376e8a',metalness:.32,roughness:.23});
const lamp=new THREE.MeshBasicMaterial({color:'#d7f8ff'});
const partLaser=new THREE.MeshBasicMaterial({color:'#ff698e'});
const red=paint('#c64c33'),white=paint('#e9e8df');
const box=new THREE.BoxGeometry(),pod=new THREE.SphereGeometry(1,12,8);

function part(group,name,material,position,scale,geometry=box){
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  group.add(mesh);
  return mesh;
}

export function createPursuerSnowmobile(){
  const model=new THREE.Group();
  model.name='Chase snowmobile';
  part(model,'Rear track',rubber,[0,.34,-.53],[.78,.58,1.94],pod);
  for(let i=0;i<7;i++)part(model,'Tread',rubber,[0,.15,-1.26+i*.22],[.82,.13,.12]);
  part(model,'Tunnel',metal,[0,.61,-.45],[1.02,.22,2.18]);
  part(model,'Seat',rubber,[0,1.02,-.39],[.58,.30,1.39],pod);
  part(model,'Body',red,[0,.79,.64],[.59,.44,1.23],pod);
  part(model,'Nose',red,[0,.66,1.48],[.63,.29,.61],pod);
  part(model,'Headlight',lamp,[0,.88,1.98],[.64,.14,.12]);
  part(model,'Windscreen',glass,[0,1.33,1.06],[.87,.41,.11]).rotation.x=-.24;
  part(model,'Steering column',metal,[0,1.16,.75],[.13,.58,.13]).rotation.x=.2;
  part(model,'Handlebar',rubber,[0,1.49,.79],[1.13,.10,.11]);
  for(const side of [-1,1]){
    const x=side*.57;
    part(model,'Suspension',metal,[x,.45,1.23],[.13,.76,.16]).rotation.z=-side*.36;
    part(model,'Ski runner',rubber,[x,.14,1.25],[.27,.13,1.69]);
    part(model,'Ski tip',rubber,[x,.20,2.05],[.26,.13,.37]).rotation.x=-.31;
    part(model,'Footboard',metal,[side*.51,.58,-.18],[.30,.11,1.21]);
  }
  return model;
}

export function createPursuerHelicopter(){
  const model=new THREE.Group();
  model.name='Chase helicopter';
  part(model,'Cabin',white,[0,.35,0],[.78,.81,1.42],pod);
  part(model,'Cabin glazing',glass,[0,.53,.70],[.73,.61,.81],pod);
  part(model,'Engine housing',red,[0,1.08,-.40],[.57,.35,.88],pod);
  part(model,'Tail boom',white,[0,.62,-2.04],[.35,.34,3.0],pod);
  part(model,'Tail fin',red,[0,.93,-3.38],[.13,.86,.51]).rotation.x=-.25;
  part(model,'Laser pod',metal,[0,-.43,.82],[.31,.25,.38],pod);
  part(model,'Emitter',partLaser,[0,-.43,1.15],[.17,.17,.09],pod);
  const rotor=new THREE.Group();
  rotor.position.y=1.64;
  part(model,'Mast',metal,[0,1.41,0],[.14,.51,.14]);
  part(rotor,'Main rotor blade',rubber,[0,0,0],[6.4,.045,.21]);
  part(rotor,'Main rotor blade',rubber,[0,0,0],[.21,.045,6.4]);
  const tailRotor=new THREE.Group();
  tailRotor.position.set(.15,1.1,-3.52);
  part(tailRotor,'Tail rotor',rubber,[0,0,0],[.05,1.12,.12]);
  model.add(rotor,tailRotor);
  model.userData.rotor=rotor;
  model.userData.tailRotor=tailRotor;
  for(const side of [-1,1]){
    part(model,'Skid',metal,[side*.63,-.69,.15],[.16,.14,2.65]);
    part(model,'Skid tip',metal,[side*.63,-.57,1.48],[.16,.14,.42]).rotation.x=-.52;
    for(const z of [-.62,.77])part(model,'Skid mount',metal,[side*.47,-.41,z],[.14,.63,.14]).rotation.z=side*.42;
  }
  return model;
}
