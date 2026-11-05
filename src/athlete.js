import * as THREE from 'three';
const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
function connect(mesh,a,b){delta.subVectors(b,a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,delta.clone().normalize());mesh.scale.y=delta.length();}
export function createAthleteRig(scene){
  const athlete=new THREE.Group(),body=new THREE.Group(),skiRig=new THREE.Group();athlete.add(body,skiRig);
  const grain=new Uint8Array(128*128*4);let seed=92;for(let i=0;i<128*128;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const value=220+(seed>>>0)%35;grain.set([value,value,value,255],i*4);}const fabric=new THREE.DataTexture(grain,128,128,THREE.RGBAFormat);fabric.wrapS=fabric.wrapT=THREE.RepeatWrapping;fabric.repeat.set(5,5);fabric.needsUpdate=true;
  const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.88,map:fabric,bumpMap:fabric,bumpScale:.006}),jacket=mat('#c86e42'),pants=mat('#243d46'),metal=mat('#3a464b'),helmet=mat('#eee8d6');
  const add=(parent,geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;};
  const limb=(radius,material)=>add(body,new THREE.CylinderGeometry(radius*.85,radius,1,9),material);
  const torso=new THREE.Group();body.add(torso);add(torso,new THREE.CapsuleGeometry(.40,.65,6,12),jacket,0,.1,0);add(torso,new THREE.SphereGeometry(.38,16,12),helmet,0,1.0,0);add(torso,new THREE.SphereGeometry(.395,24,14,Math.PI*.13,Math.PI*.74,Math.PI*.36,Math.PI*.27),new THREE.MeshStandardMaterial({color:'#254c63',metalness:.5,roughness:.18}),0,1.0,0);add(torso,new THREE.BoxGeometry(.65,.65,.22),mat('#39474e'),0,.18,-.4);
  add(torso,new THREE.BoxGeometry(.025,.92,.018),metal,0,.08,.40);
  for(const sign of [-1,1]){const pocket=add(torso,new THREE.BoxGeometry(.19,.025,.025),metal,sign*.23,-.23,.36);pocket.rotation.z=sign*.2;add(torso,new THREE.BoxGeometry(.08,.5,.09),metal,sign*.30,.45,-.36);}
  for(let i=0;i<5;i++)add(torso,new THREE.BoxGeometry(.035,.025,.16),metal,(i-2)*.09,1.34,-.04);
  const legs=[],arms=[];
  for(const sign of [-1,1]){
    legs.push({sign,upper:limb(.17,pants),lower:limb(.15,pants),knee:add(body,new THREE.SphereGeometry(.17,10,8),pants)});
    arms.push({sign,upper:limb(.14,jacket),lower:limb(.12,jacket),glove:add(body,new THREE.SphereGeometry(.13,10,8),metal),pole:limb(.023,metal),basket:add(body,new THREE.TorusGeometry(.11,.018,4,12),metal)});
    add(skiRig,new THREE.BoxGeometry(.29,.31,.57),metal,sign*.30,.35,.18);add(skiRig,new THREE.BoxGeometry(.31,.045,.18),mat('#a8bbab'),sign*.30,.49,.34);add(skiRig,new THREE.BoxGeometry(.24,.1,.18),metal,sign*.32,.22,-.25);
    add(skiRig,new THREE.BoxGeometry(.22,.075,3.1),mat('#233b42'),sign*.32,.14,.30);
    const tip=add(skiRig,new THREE.BoxGeometry(.22,.07,.42),mat('#b9da87'),sign*.32,.23,2.02);tip.rotation.x=-.32;
  }
  athlete.userData={body,skiRig,torso,legs,arms};athlete.scale.setScalar(.52);athlete.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;}});scene.add(athlete);return athlete;
}
export function updateAthletePose(athlete,s,dt){
  const {body,skiRig,torso,legs,arms}=athlete.userData,turn=s.turn||0,tuck=s.tuck||0,pole=s.poling||0,phase=(s.polePhase||0)*Math.PI*2;
  const drive=Math.sin(phase),reach=Math.cos(phase),flex=tuck*.38+pole*(.1+.1*Math.max(0,drive)),hipY=1.68-flex;
  body.rotation.z=THREE.MathUtils.lerp(body.rotation.z,Math.sign(turn)*s.edgeAngle*.6,1-Math.exp(-dt*18));
  skiRig.rotation.z=Math.sign(turn)*s.edgeAngle*.82;
  torso.position.set(0,hipY+.55,.05+tuck*.16);torso.rotation.x=.12+tuck*.7+pole*(.12+.16*Math.max(0,drive));
  torso.rotation.y=-turn*.10;body.position.y=-pole*.035*Math.sin(phase);
  for(const leg of legs){const hip=new THREE.Vector3(leg.sign*.23,hipY,0),knee=new THREE.Vector3(leg.sign*(.29+Math.abs(turn)*.07),.94-tuck*.18,.38+tuck*.32),ankle=new THREE.Vector3(leg.sign*.30,.45,.15);connect(leg.upper,hip,knee);connect(leg.lower,knee,ankle);leg.knee.position.copy(knee);}
  for(const arm of arms){
    const sign=arm.sign,shoulder=new THREE.Vector3(sign*.48,hipY+1.0-tuck*.2,.12+tuck*.55),hand=new THREE.Vector3(sign*(.68-tuck*.18),1.85-flex*.45+pole*.15*reach,.58+tuck*.45+pole*.75*reach),elbow=new THREE.Vector3(sign*.67,(shoulder.y+hand.y)/2-.18,(shoulder.z+hand.z)/2-.10);
    connect(arm.upper,shoulder,elbow);connect(arm.lower,elbow,hand);arm.glove.position.copy(hand);
    const planting=pole>.1&&(s.polePhase||0)<.58,tip=new THREE.Vector3(sign*.86,planting?.14:.45+pole*.55*Math.max(0,-drive),hand.z+(planting?-.45-.65*Math.max(0,drive):-.9));
    connect(arm.pole,hand,tip);arm.basket.position.copy(tip).y+=.12;arm.basket.rotation.x=Math.PI/2;
  }
}
