import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const Y=new THREE.Vector3(0,1,0);
export function upperBodyCounterAngle(heading,fallLine,motion={}){
  const travel=Number.isFinite(motion.vx)&&Number.isFinite(motion.vz)?Math.atan2(motion.vx,motion.vz):heading;
  const speed=motion.speed??Math.hypot(motion.vx??0,motion.vz??0);
  const moving=Object.keys(motion).length?THREE.MathUtils.smoothstep(speed,.5,3):1;
  // Across-hill traverses and uphill travel keep shoulders aligned with skis.
  const downhill=THREE.MathUtils.smoothstep(Math.cos(travel-fallLine),.25,.70);
  return THREE.MathUtils.clamp(Math.atan2(Math.sin(fallLine-heading),Math.cos(fallLine-heading))*.88,-.95,.95)*downhill*moving;
}
export async function loadHumanoid(athlete){const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/skier-human.glb`);return attachHumanoid(athlete,gltf.scene);}
function jointSolution(a,target,pole,l1,l2){
  const delta=target.clone().sub(a),d=THREE.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.002),axis=delta.normalize();
  const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const bend=pole.clone().sub(a).addScaledVector(axis,-pole.clone().sub(a).dot(axis)).normalize();
  return{joint:a.clone().addScaledVector(axis,along).addScaledVector(bend,height),end:a.clone().addScaledVector(axis,d)};
}
export function attachHumanoid(athlete,model){
  model.updateMatrixWorld(true);const bones={},rest=new Map();model.traverse(o=>{if(o.isBone){bones[o.name]=o;rest.set(o.name,{q:o.getWorldQuaternion(new THREE.Quaternion()),position:o.getWorldPosition(new THREE.Vector3()),local:o.quaternion.clone()});}});
  for(const name of ['pelvis','spine_01','spine_02','spine_03','Head','upperarm_l','lowerarm_l','hand_l','thigh_l','calf_l','foot_l'])if(!bones[name])throw new Error(`Humanoid missing ${name}`);
  const fabric=athlete.userData.torso.children[0].material.map,blue=new THREE.Color('#347dac'),navy=new THREE.Color('#263747'),skin=new THREE.Color('#c49376'),black=new THREE.Color('#26323b');
  const body=model.getObjectByName('SuperHero_Male'),geometry=body.geometry;
  const color=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<geometry.attributes.position.count;i++){const x=geometry.attributes.position.getX(i),y=geometry.attributes.position.getY(i),c=y>1.55&&Math.abs(x)<.135?skin:Math.abs(x)>.67?black:y>.96?blue:navy;c.toArray(color,i*3);}
  geometry.setAttribute('color',new THREE.BufferAttribute(color,3));body.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86});
  const source=geometry.index,base=geometry.attributes.position;
  const clothed=i=>{const y=base.getY(i),x=Math.abs(base.getX(i));return y>.17&&(y<1.545||(x>.14&&y<1.60))&&x<.68;};
  // Separate garment envelopes erase the superhero's muscle contour, retaining native skin weights.
  for(const jacket of [true,false]){
    const g=geometry.clone(),pos=g.attributes.position,colors=g.attributes.color,indices=[];
    for(let i=0;i<source.count;i+=3){const tri=[source.getX(i),source.getX(i+1),source.getX(i+2)],y=tri.reduce((v,j)=>v+base.getY(j),0)/3;
      if(tri.every(clothed)&&(jacket?y>.895:y<.945))indices.push(...tri);
    }
    for(let i=0;i<pos.count;i++){
      let x=base.getX(i),y=base.getY(i),z=base.getZ(i);const sign=Math.sign(x)||1;
      if(clothed(i)){
        if(jacket){
          if(Math.abs(x)>.285&&y>1.29){
            const t=THREE.MathUtils.clamp((Math.abs(x)-.28)/.39,0,1),r=THREE.MathUtils.lerp(.13,.082,t),dy=y-1.455,dz=z+.065,angle=Math.atan2(dz,dy),fold=.004*Math.sin(x*93+angle*3);
            y=1.455+Math.cos(angle)*(r+fold);z=-.065+Math.sin(angle)*(r+fold);
          }else{
            const angle=Math.atan2(z+.025,x),width=y<1.15?.269:.286,depth=.181,fold=.004*Math.sin(y*68+angle*4);
            x=Math.cos(angle)*(width+fold);z=-.025+Math.sin(angle)*(depth+fold);y=Math.max(.895,y);
          }
        }else{
          const cx=sign*.114,cz=THREE.MathUtils.lerp(-.075,-.035,THREE.MathUtils.clamp((y-.17)/.65,0,1)),angle=Math.atan2(z-cz,x-cx);
          const r=THREE.MathUtils.lerp(.105,.142,THREE.MathUtils.clamp((y-.17)/.66,0,1));
          const wrinkle=.009*(Math.exp(-(((y-.53)/.10)**2))+Math.exp(-(((y-.24)/.075)**2)))*Math.sin(y*94+angle*3+x*17);
          const legX=cx+Math.cos(angle)*(r+wrinkle),legZ=cz+Math.sin(angle)*(r*.91+wrinkle),blend=THREE.MathUtils.smoothstep(y,.79,.94),hipAngle=Math.atan2(z+.035,x);
          x=THREE.MathUtils.lerp(sign*Math.max(.009,sign*legX),Math.cos(hipAngle)*.245,blend);z=THREE.MathUtils.lerp(legZ,-.035+Math.sin(hipAngle)*.17,blend);
        }
        pos.setXYZ(i,x,y,z);
      }
      (jacket?blue:navy).toArray(colors.array,i*3);
    }
    g.setIndex(indices);g.computeVertexNormals();
    const garment=new THREE.SkinnedMesh(g,new THREE.MeshPhysicalMaterial({vertexColors:true,map:fabric,bumpMap:fabric,bumpScale:.004,roughness:.86,sheen:.3,sheenColor:new THREE.Color('#9ab9cc'),sheenRoughness:.8,side:THREE.DoubleSide}));
    garment.bind(body.skeleton,body.bindMatrix);garment.name=jacket?'Loose ski jacket':'Loose ski trousers';garment.frustumCulled=false;body.parent.add(garment);
  }
  const exposed=[];
  for(let i=0;i<source.count;i+=3){const tri=[source.getX(i),source.getX(i+1),source.getX(i+2)];if(tri.some(j=>!clothed(j)))exposed.push(...tri);}
  geometry.setIndex(exposed);
  model.getObjectByName('Eyes').material=new THREE.MeshStandardMaterial({color:'#e3ded4',roughness:.35});model.getObjectByName('Eyebrows').material=new THREE.MeshStandardMaterial({color:'#43382f',roughness:1});
  // Equipment is attached to real head / spine bones in the source bind frame.
  function accessory(boneName,center){const bone=bones[boneName],group=new THREE.Group();group.position.copy(center).sub(rest.get(boneName).position).applyQuaternion(rest.get(boneName).q.clone().invert());group.quaternion.copy(rest.get(boneName).q).invert();bone.add(group);return group;}
  function mesh(parent,g,m,x=0,y=0,z=0){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;}
  const hard=new THREE.MeshStandardMaterial({color:'#ecede6',roughness:.43,metalness:.12}),rubber=new THREE.MeshStandardMaterial({color:'#253038',roughness:.9}),head=accessory('Head',new THREE.Vector3(0,1.725,.0));
  mesh(head,new THREE.SphereGeometry(.137,32,20,0,Math.PI*2,0,Math.PI*.62),hard);
  mesh(head,new THREE.SphereGeometry(.142,32,16,Math.PI*.10,Math.PI*.80,Math.PI*.38,Math.PI*.25),rubber,0,-.01,.01);
  mesh(head,new THREE.SphereGeometry(.145,32,16,Math.PI*.13,Math.PI*.74,Math.PI*.40,Math.PI*.20),new THREE.MeshPhysicalMaterial({color:'#8ab2cc',metalness:.55,roughness:.11,clearcoat:.8}),0,-.01,.013);
  for(const side of [-1,1]){const points=[-.065,-.035,0,.035,.065].map(z=>new THREE.Vector3(side*.05,Math.sqrt(.137*.137-.05*.05-z*z)+.002,z));mesh(head,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.003,5,false),rubber);}
  const pack=accessory('spine_03',new THREE.Vector3(0,1.27,-.195));mesh(pack,new RoundedBoxGeometry(.29,.41,.15,4,.05),new THREE.MeshStandardMaterial({color:'#283e50',map:fabric,roughness:.86}));
  for(const sign of [-1,1])mesh(pack,new RoundedBoxGeometry(.028,.42,.025,2,.008),rubber,sign*.104,.01,.09);
  // Curl the native finger joints around the pole grip rather than using sphere hands.
  model.traverse(o=>{if(o.isBone&&/^(index|middle|ring|pinky)_(02|03)_/.test(o.name))o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.85));});
  model.name='Quaternius skinned skier';model.scale.setScalar(1/.52);athlete.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
  const keep=new Set(athlete.userData.arms.flatMap(a=>[a.pole,a.basket]));athlete.userData.body.traverse(o=>{if(o.isMesh&&!keep.has(o))o.visible=false;});
  const lengths={};for(const suffix of ['l','r'])lengths[suffix]={thigh:bones[`calf_${suffix}`].position.length(),calf:bones[`foot_${suffix}`].position.length(),upper:bones[`lowerarm_${suffix}`].position.length(),lower:bones[`hand_${suffix}`].position.length()};
  const rig={model,bones,rest,lengths};athlete.userData.humanRig=rig;return rig;
}
function worldQuaternion(bone,q){bone.parent.updateWorldMatrix(true,false);bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);}
function aim(rig,name,childName,target){
  const bone=rig.bones[name],child=rig.bones[childName],origin=bone.getWorldPosition(new THREE.Vector3()),direction=target.clone().sub(origin).normalize();
  const restQ=rig.model.getWorldQuaternion(new THREE.Quaternion()).multiply(rig.rest.get(name).q),restAxis=child.position.clone().normalize().applyQuaternion(restQ);
  worldQuaternion(bone,new THREE.Quaternion().setFromUnitVectors(restAxis,direction).multiply(restQ));
}
export function updateHumanoid(athlete,pose){
  const rig=athlete.userData.humanRig;if(!rig)return;
  const {bones,rest}=rig,{body,arms,legs}=athlete.userData;athlete.updateWorldMatrix(true,true);
  const rootQ=athlete.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(rootQ),up=new THREE.Vector3(0,1,0).applyQuaternion(rootQ),right=new THREE.Vector3(1,0,0).applyQuaternion(rootQ);
  const hip=body.localToWorld(new THREE.Vector3(pose.hipX,pose.hipY+.07,0));bones.pelvis.position.copy(bones.pelvis.parent.worldToLocal(hip));
  const attitude=(yaw,lean,bend)=>rootQ.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(bend,yaw,lean,'YXZ')));
  worldQuaternion(bones.pelvis,attitude(pose.counter*.18,pose.lean*.10,.03).multiply(rest.get('pelvis').q));
  for(const [name,fraction] of [['spine_01',.40],['spine_02',.72],['spine_03',1]])worldQuaternion(bones[name],attitude(pose.counter*fraction,pose.lean*.15,.08+pose.tuck*.40).multiply(rest.get(name).q));
  worldQuaternion(bones.neck_01,attitude(pose.counter,pose.lean*.08,pose.tuck*.12).multiply(rest.get('neck_01').q));
  worldQuaternion(bones.Head,attitude(pose.counter,0,pose.tuck*.08).multiply(rest.get('Head').q));
  for(const leg of legs){const suffix=leg.sign>0?'l':'r',l=rig.lengths[suffix],hip=bones[`thigh_${suffix}`].getWorldPosition(new THREE.Vector3()),ankle=body.localToWorld(leg.target.ankle.clone().add(new THREE.Vector3(0,-.05,0))),pole=hip.clone().addScaledVector(forward,.7).addScaledVector(right,leg.sign*.12);
    const solution=jointSolution(hip,ankle,pole,l.thigh,l.calf);aim(rig,`thigh_${suffix}`,`calf_${suffix}`,solution.joint);aim(rig,`calf_${suffix}`,`foot_${suffix}`,solution.end);worldQuaternion(bones[`foot_${suffix}`],rootQ.clone().multiply(rest.get(`foot_${suffix}`).q));
  }
  for(const arm of arms){const suffix=arm.sign>0?'l':'r',l=rig.lengths[suffix],shoulder=bones[`upperarm_${suffix}`].getWorldPosition(new THREE.Vector3()),hand=body.localToWorld(arm.target.hand.clone()),pole=shoulder.clone().addScaledVector(right,arm.sign*.5).addScaledVector(up,-.22);
    const solution=jointSolution(shoulder,hand,pole,l.upper,l.lower);aim(rig,`upperarm_${suffix}`,`lowerarm_${suffix}`,solution.joint);aim(rig,`lowerarm_${suffix}`,`hand_${suffix}`,solution.end);
    const tip=body.localToWorld(arm.target.tip.clone()),gripDirection=tip.clone().sub(solution.end).normalize(),restQ=rest.get(`hand_${suffix}`).q;
    worldQuaternion(bones[`hand_${suffix}`],new THREE.Quaternion().setFromUnitVectors(Y.clone().applyQuaternion(restQ),gripDirection).multiply(restQ));
    const localHand=body.worldToLocal(solution.end.clone()),direction=arm.target.tip.clone().sub(localHand),length=direction.length();arm.pole.position.copy(localHand).add(arm.target.tip).multiplyScalar(.5);arm.pole.quaternion.setFromUnitVectors(Y,direction.normalize());arm.pole.scale.y=length;
  }
  rig.model.updateMatrixWorld(true);
}
