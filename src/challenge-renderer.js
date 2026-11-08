import * as THREE from 'three';
export class ChallengeRenderer{
 constructor(scene,terrain){this.terrain=terrain;this.group=new THREE.Group();scene.add(this.group);}
 clear(){this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group.clear();}
 configure(challenge,features){this.clear();const t=this.terrain;
  for(const [i,g] of challenge.gates.entries()){
   const group=new THREE.Group();group.userData.gateIndex=i;
   for(const sign of [-1,1]){const x=g.x+sign*g.radius*Math.cos(g.heading),z=g.z-sign*g.radius*Math.sin(g.heading),post=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.8,5),new THREE.MeshStandardMaterial({color:i%2?'#f76c3d':'#3987d5'}));post.position.set(x,t.surface(x,z)-1200+.9,z);group.add(post);const flag=new THREE.Mesh(new THREE.BoxGeometry(.55,.4,.035),post.material.clone());flag.position.copy(post.position).add(new THREE.Vector3(-sign*.24,.55,0));flag.rotation.y=g.heading;group.add(flag);}this.group.add(group);
  }
  for(const f of features){const p=[],idx=[],nx=24,nz=18;for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const u=-7+i/nx*12,v=-4.5+j/nz*9,x=f.x+u*Math.sin(f.heading)+v*Math.cos(f.heading),z=f.z+u*Math.cos(f.heading)-v*Math.sin(f.heading);p.push(x,t.surface(x,z)-1200+.025,z);if(i<nx&&j<nz){const a=j*(nx+1)+i,b=a+nx+1;idx.push(a,a+1,b,b,a+1,b+1);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#e6eef4',roughness:.94,side:THREE.DoubleSide}));m.receiveShadow=true;this.group.add(m);}
 }
 update(challenge){for(const g of this.group.children)if(g.userData.gateIndex!==undefined)g.visible=g.userData.gateIndex>=challenge.next;}
}
