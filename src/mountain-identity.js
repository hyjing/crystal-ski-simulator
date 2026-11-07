import {MOUNTAINS,resolveMountain} from './mountains.js';
export function mountainIdentity(id){
 id=resolveMountain(id);const mountain=MOUNTAINS[id],canada=mountain.pack==='whistler';
 return {id,name:mountain.name,brand:canada?(id==='blackcomb'?'BLACKCOMB':'WHISTLER'):mountain.area?(mountain.area==='alpental'?'ALPENTAL':`SUMMIT ${mountain.area.toUpperCase()}`):'CRYSTAL',region:canada?'BRITISH COLUMBIA, CANADA':'WASHINGTON, USA',coordinates:mountain.coordinates,source:mountain.elevationLabel||'USGS 3DEP',description:`在 ${mountain.name} 的真实地形上，找到自己的线路。`,home:`?mountain=${id}`};
}
export function applyMountainIdentity(doc,id){
 const identity=mountainIdentity(id),put=(id,value)=>{const node=doc.getElementById(id);if(node)node.textContent=value;};
 put('brand-name',identity.brand);put('location-region',identity.region);put('mountain-coordinates',identity.coordinates);put('mountain-description',identity.description);put('caption-mountain',identity.name.toUpperCase());put('caption-source',identity.source+' · ');
 const home=doc.getElementById('brand-home');home?.setAttribute('href',identity.home);home?.setAttribute('aria-label',`${identity.name} / Terrain Sessions 首页`);
 doc.getElementById('world')?.setAttribute('aria-label',`${identity.name} 3D 滑雪场景`);doc.title=`${identity.name} / Terrain Sessions`;
 doc.querySelector('meta[name="description"]')?.setAttribute('content',`${identity.description} 免下载的 3D 滑雪与山地探索。`);return identity;
}
