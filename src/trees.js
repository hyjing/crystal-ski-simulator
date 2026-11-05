import * as THREE from 'three';

export function hitsTreeTrunk(a,b,tree,riderRadius=.36){
  const radius=(tree.trunkRadius||.22*(tree.size||1))+riderRadius,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  const t=l2?THREE.MathUtils.clamp(((tree.x-a.x)*dx+(tree.z-a.z)*dz)/l2,0,1):0;
  return (a.x+t*dx-tree.x)**2+(a.z+t*dz-tree.z)**2<radius*radius;
}


export function installForestIndex(trees){
  const cells=new Map();for(const tree of trees){tree.trunkRadius=.22*tree.size;const key=`${Math.floor(tree.x/16)},${Math.floor(tree.z/16)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(tree);}
  trees.nearby=(x,z)=>{const out=[],u=Math.floor(x/16),v=Math.floor(z/16);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)out.push(...cells.get(`${u+a},${v+b}`)||[]);return out;};
}
