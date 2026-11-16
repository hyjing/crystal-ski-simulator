import * as THREE from 'three';

const paint=(color,roughness=.52)=>new THREE.MeshStandardMaterial({color,roughness});
const rubber=paint('#252c32',.92),metal=paint('#a1b2bd',.38);
const glass=new THREE.MeshStandardMaterial({color:'#376e8a',metalness:.32,roughness:.23});
const lamp=new THREE.MeshBasicMaterial({color:'#d7f8ff'});
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

export function createPursuerPlane(){
  const model=new THREE.Group();
  model.name='Chase bush plane';
  part(model,'Fuselage',white,[0,.26,0],[.69,.70,2.65],pod);
  part(model,'Cowling',red,[0,.27,1.68],[.68,.52,.94],pod);
  part(model,'Canopy',glass,[0,.81,.41],[.56,.48,1.00],pod);
  part(model,'Dorsal stripe',red,[0,.48,-1.35],[.33,.32,1.20],pod);
  const propeller=new THREE.Group();
  propeller.position.set(0,.29,2.63);
  part(propeller,'Propeller',rubber,[0,0,0],[.11,1.67,.06]);
  part(propeller,'Spinner',metal,[0,0,.05],[.16,.16,.18],pod);
  model.add(propeller);
  model.userData.propeller=propeller;
  for(const side of [-1,1]){
    part(model,'Main wing',white,[side*1.88,.65,.36],[3.72,.17,1.37]).rotation.z=side*.06;
    part(model,'Wingtip',red,[side*3.62,.76,.37],[.39,.18,1.17]).rotation.z=side*.06;
    part(model,'Tailplane',white,[side*.83,.58,-2.0],[1.65,.11,.69]).rotation.z=side*.03;
    part(model,'Wing strut',metal,[side*1.1,.36,.56],[.10,1.43,.1]).rotation.z=-side*1.06;
    part(model,'Landing strut',metal,[side*.56,-.21,.65],[.10,.76,.11]).rotation.z=-side*.35;
    part(model,'Landing ski',rubber,[side*.73,-.60,.75],[.28,.13,1.53]);
  }
  part(model,'Tail fin',red,[0,1.0,-2.05],[.16,1.18,.80]).rotation.x=-.16;
  return model;
}
