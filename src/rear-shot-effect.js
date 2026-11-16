import * as THREE from 'three';

const axis=new THREE.Vector3(0,1,0);
const beamGeometry=new THREE.CylinderGeometry(1,1,1,8,1,true);
const boltGeometry=new THREE.SphereGeometry(.17,12,8);
const ringGeometry=new THREE.RingGeometry(.77,1,24);
const sparkGeometry=new THREE.BufferGeometry();
const sparks=[];
for(let i=0;i<8;i++){
  const angle=i*Math.PI/4;
  const spread=i%2?.82:1;
  sparks.push(Math.cos(angle)*spread,Math.sin(angle)*spread,.26*(i%3));
}
sparkGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sparks,3));

export function createRearShotEffect(){
  const fx=new THREE.Group();
  const beam=new THREE.Group(),impact=new THREE.Group();
  const material=color=>new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false});
  const halo=new THREE.Mesh(beamGeometry,material('#287eff'));
  const core=new THREE.Mesh(beamGeometry,material('#d8faff'));
  const bolt=new THREE.Mesh(boltGeometry,material('#f8ffff'));
  const ring=new THREE.Mesh(ringGeometry,material('#78eeff'));
  ring.material.side=THREE.DoubleSide;
  const burst=new THREE.Mesh(boltGeometry,material('#baf4ff'));
  const chips=new THREE.Points(sparkGeometry,new THREE.PointsMaterial({
    color:'#c8f9ff',size:.16,transparent:true,depthWrite:false,toneMapped:false,
  }));
  beam.add(halo,core);
  impact.add(ring,burst,chips);
  fx.add(beam,bolt,impact);
  fx.userData={beam,halo,core,bolt,impact,ring,burst,chips,source:new THREE.Vector3(),direction:new THREE.Vector3()};
  return fx;
}

export function updateRearShotEffect(fx,shot,time){
  const {beam,halo,core,bolt,impact,ring,burst,chips,source,direction}=fx.userData;
  const progress=THREE.MathUtils.clamp((time-shot.start)/(shot.impact-shot.start),0,1);
  const fade=1-THREE.MathUtils.smoothstep(time-shot.impact,0,.14);
  source.set(shot.x,shot.y,shot.z);
  direction.set(shot.end.x-shot.x,shot.end.y-shot.y,shot.end.z-shot.z);
  const length=Math.max(.001,direction.length()*progress);
  beam.visible=fade>0&&progress>0;
  beam.position.copy(source).addScaledVector(direction,progress*.5);
  beam.quaternion.setFromUnitVectors(axis,direction.normalize());
  core.scale.set(.045,length,.045);
  halo.scale.set(.145,length,.145);
  core.material.opacity=.98*fade;
  halo.material.opacity=.48*fade;
  bolt.visible=progress<1;
  bolt.position.copy(source).addScaledVector(direction,length);
  bolt.scale.setScalar(.95+progress*.2);

  impact.visible=time>=shot.impact;
  if(!impact.visible)return;
  const age=THREE.MathUtils.clamp((time-shot.impact)/(shot.until-shot.impact),0,1);
  const color=shot.result==='blocked'?'#ffbb54':shot.result==='down'?'#ffe8a5':'#66dbff';
  impact.position.set(shot.end.x,shot.end.y,shot.end.z);
  impact.lookAt(source);
  ring.scale.setScalar(.24+1.05*age);
  ring.material.color.set(color);
  ring.material.opacity=.9*(1-age);
  burst.scale.setScalar(3.6*(1-age));
  burst.material.opacity=.92*(1-age)**2;
  chips.position.z=age*.28;
  chips.scale.setScalar(.2+1.35*age);
  chips.material.color.set(color);
  chips.material.opacity=1-age;
}
