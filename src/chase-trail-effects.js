import * as THREE from 'three';
import {CHASE_TRAILS} from './chase-trails.js';

export class ChaseTrailEffects {
  constructor(root){
    const ground=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
    const flame=new THREE.ConeGeometry(.48,1.7,5).translate(0,.70,0);
    const shard=new THREE.OctahedronGeometry(.72,0).scale(.26,1,.35).translate(0,.43,0);
    this.layers=Object.fromEntries(Object.entries(CHASE_TRAILS).map(([type,item])=>{
      const fiery=type==='flametrail';
      const ribbon=new THREE.InstancedMesh(ground,new THREE.MeshBasicMaterial({
        color:item.color,side:THREE.DoubleSide,transparent:true,opacity:.49,depthWrite:false,toneMapped:false,
      }),192);
      const plume=new THREE.InstancedMesh(fiery?flame:shard,new THREE.MeshBasicMaterial({
        color:fiery?'#ff993e':item.color,transparent:true,opacity:.80,depthWrite:false,
        blending:fiery?THREE.AdditiveBlending:THREE.NormalBlending,toneMapped:false,
      }),192);
      for(const mesh of [ribbon,plume]){
        mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);
      }
      return [type,{ribbon,plume}];
    }));
    this.dummy=new THREE.Object3D();
  }

  update(segments,surface,time){
    for(const {ribbon,plume} of Object.values(this.layers))ribbon.count=plume.count=0;
    const dummy=this.dummy;
    for(const segment of segments){
      const {ribbon,plume}=this.layers[segment.type],i=ribbon.count++;
      const fade=THREE.MathUtils.clamp((segment.until-time)*2,0,1);
      const y=surface(segment.x,segment.z);
      const pitch=Math.atan2(surface(segment.b.x,segment.b.z)-surface(segment.a.x,segment.a.z),2.6);
      dummy.position.set(segment.x,y+.15,segment.z);
      dummy.rotation.set(-pitch,segment.heading,0,'YXZ');
      dummy.scale.set(segment.radius*1.1*fade,1,2.8);
      dummy.updateMatrix();
      ribbon.setMatrixAt(i,dummy.matrix);
      const phase=time*17+segment.x*.9+segment.z*.4;
      const fire=segment.type==='flametrail';
      dummy.position.y+=fire?.02:.13;
      dummy.position.x+=.25*Math.sin(phase);
      dummy.scale.set((fire?1.35:.96)*fade,(.78+.22*Math.cos(phase))*fade,1.1*fade);
      dummy.rotation.set(.18*Math.cos(phase),segment.heading+phase*.14,.17*Math.sin(phase));
      dummy.updateMatrix();
      plume.setMatrixAt(plume.count++,dummy.matrix);
    }
    for(const {ribbon,plume} of Object.values(this.layers)){
      if(ribbon.count)ribbon.instanceMatrix.needsUpdate=true;
      if(plume.count)plume.instanceMatrix.needsUpdate=true;
    }
  }
}
