// Turn-end pole touch is a timing gesture. Only explicit Shift strokes add propulsion.
export function advanceTurnPlant(state,skier,dt){
  const turn=skier.turn||0,previous=state.previousTurn||0,speed=skier.speed||0;
  const angle=state.previousHeading===undefined?0:Math.atan2(Math.sin(skier.heading-state.previousHeading),Math.cos(skier.heading-state.previousHeading));
  if(Math.abs(turn)>.25&&!state.locked){state.armed=true;state.side=Math.sign(turn);state.arc=(state.arc||0)+Math.abs(angle);}
  const reversal=previous*turn<0&&Math.abs(turn)>.08,release=Math.abs(previous)>.12&&Math.abs(turn)<=.12;
  const trigger=state.armed&&(release||reversal||state.arc>.75)&&speed>2&&(skier.poling||0)<.15;
  if(trigger&&!state.active){state.active=true;state.plantSide=state.side;state.time=0;state.locked=true;state.armed=false;state.arc=0;state.worldPoint=null;}
  if(release||reversal){state.locked=false;state.arc=0;}
  if(speed<1||(skier.poling||0)>.2){state.active=false;state.worldPoint=null;state.armed=false;}
  const before=(state.time||0)/.8;
  if(state.active){state.time+=dt;if(state.time>=.8){state.active=false;state.worldPoint=null;}}
  const phase=state.active?state.time/.8:0;
  state.contact=state.active&&phase>=.43&&phase<=.57;
  state.contactStarted=state.contact&&before<.43;
  state.phase=phase;state.previousTurn=turn;state.previousHeading=skier.heading;
  return state;
}
