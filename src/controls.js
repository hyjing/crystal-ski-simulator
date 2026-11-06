// Each finger / keyboard key owns its hold, so releasing one never drops another.
export class HeldControls extends Set{
 constructor(){super();this.sources=new Map();}
 hold(source,key){this.sources.set(source,key);this.sync();}
 release(source){if(this.sources.delete(source))this.sync();}
 sync(){super.clear();for(const key of this.sources.values())super.add(key);}
 clear(){this.sources?.clear();super.clear();}
}
export function bindTouchControls(root,input,canPlay){
 for(const button of root.querySelectorAll('[data-key]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();if(!canPlay())return;button.setPointerCapture(e.pointerId);input.hold(`touch:${e.pointerId}`,button.dataset.key);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,e=>input.release(`touch:${e.pointerId}`));
  button.addEventListener('contextmenu',e=>e.preventDefault());
 }
}
