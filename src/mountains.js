export const MOUNTAINS={
 crystal:{name:'Crystal Mountain',coordinates:'46.935° N / 121.474° W',prefix:'data/crystal-',context:'data/context-dem.json',contextAerial:'data/context-aerial.jpg',rainier:true},
 'snoqualmie-west':{name:'Snoqualmie · Summit West',coordinates:'47.422° N / 121.422° W',area:'west'},
 'snoqualmie-central':{name:'Snoqualmie · Summit Central',coordinates:'47.407° N / 121.419° W',area:'central'},
 'snoqualmie-east':{name:'Snoqualmie · Summit East',coordinates:'47.388° N / 121.404° W',area:'east'},
 'snoqualmie-alpental':{name:'Snoqualmie · Alpental',coordinates:'47.440° N / 121.435° W',area:'alpental'},
};
export const resolveMountain=id=>Object.hasOwn(MOUNTAINS,id)?id:'crystal';
export function mountainAsset(id,name){const m=MOUNTAINS[resolveMountain(id)];if(!m.area)return `${m.prefix}${name}`;const aliases={'trails.json':'network.json','trail-network.json':'network.json','lift-runs.json':'runs.json'};return `data/snoqualmie/${m.area}/${aliases[name]||name}`;}
