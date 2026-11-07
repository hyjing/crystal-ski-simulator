// Authored winter presentation, not weather observations or surveyed snowlines.
export function sceneryProfile(id){
 if(id==='whistler'||id==='blackcomb')return {region:'coast-mountains',rockMin:1350,snowline:1050,valleyAltitude:850,haze:.26,forestTint:'#3b5553',ridgeDetail:[{x:0,z:0,halfX:4500,halfZ:4500},{x:-6300,z:13000,halfX:2100,halfZ:1900}],regional:'whistler',satellite:true};
 if(id?.startsWith('snoqualmie-'))return {region:'snoqualmie-pass',rockMin:900,snowline:650,valleyAltitude:950,haze:.20,forestTint:'#3e554c',regional:'snoqualmie',satellite:false};
 return {region:'cascade-high-alpine',rockMin:1450,snowline:1200,valleyAltitude:1350,haze:.14,forestTint:'#425759',regional:'crystal',satellite:false};
}
