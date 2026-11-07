const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hash=(x,z,salt=0)=>{let n=Math.imul(x|0,73856093)^Math.imul(z|0,19349663)^Math.imul(salt,83492791);n=Math.imul(n^(n>>>16),2246822519);return((n^(n>>>13))>>>0)/4294967296;};
function noise(x,z){const a=Math.floor(x),b=Math.floor(z),u=x-a,v=z-b,s=u*u*(3-2*u),t=v*v*(3-2*v);return(hash(a,b)*(1-s)+hash(a+1,b)*s)*(1-t)+(hash(a,b+1)*(1-s)+hash(a+1,b+1)*s)*t;}
export const groveDensity=(x,z)=>noise(x/170,z/170)*.7+noise(x/57+17,z/57-31)*.3;
// Vegetation points establish the geographic support. Coherent grove density
// fills dense patches while leaving glades; every new point stays in landcover.
export function clusterForestSeeds(source,{spacing=8,support,limit=90000}={}){
 if(!support)return source;
 const trees=[],cells=new Map(),gap=5.8,key=(x,z)=>`${x},${z}`;
 const insert=p=>{if(trees.length>=limit||support(p.x,p.z)<.22)return;const u=Math.floor(p.x/gap),v=Math.floor(p.z/gap);for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(const q of cells.get(key(u+x,v+z))||[])if((q.x-p.x)**2+(q.z-p.z)**2<gap*gap)return;
  trees.push(p);const k=key(u,v);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);
 };
 for(const p of source){const x=Math.round(p.x*10),z=Math.round(p.z*10),density=groveDensity(p.x,p.z);if(density<.36&&hash(x,z,1)>.25)continue;insert({...p,grove:density});}
 const additions=clamp(Math.round((spacing/6)**2*.45),1,9),radius=clamp(spacing*.95,7,27);
 for(const p of source){const density=groveDensity(p.x,p.z);if(density<.48)continue;const x=Math.round(p.x*10),z=Math.round(p.z*10),count=Math.ceil(additions*clamp((density-.42)/.22,0,1));
  for(let i=0;i<count;i++){const angle=hash(x,z,10+i)*Math.PI*2,r=radius*Math.sqrt(.2+.8*hash(x,z,30+i));insert({x:p.x+Math.cos(angle)*r,z:p.z+Math.sin(angle)*r,size:(p.size||1)*(.78+hash(x,z,50+i)*.33),grove:density});}
 }
 return trees;
}
