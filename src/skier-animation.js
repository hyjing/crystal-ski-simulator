// A pole touch belongs to a linked turn transition, not to releasing a key or
// reaching an arbitrary turn angle. Explicit Shift strokes alone add propulsion.
export function advanceTurnPlant(state,skier,dt){
  const command=skier.steerInput??skier.turn??0,side=Math.abs(command)>.18?Math.sign(command):0;
  const speed=skier.speed||0,poling=skier.poling||0;
  const angle=state.previousHeading===undefined?0:Math.abs(Math.atan2(Math.sin(skier.heading-state.previousHeading),Math.cos(skier.heading-state.previousHeading)));
  state.contact=false;state.contactStarted=false;
  if(speed<2||poling>.15){
    state.active=false;state.committedSide=0;state.candidateSide=0;state.turnTime=0;state.arc=0;state.worldPoint=null;
  }else if(side){
    state.neutralTime=0;
    if(side!==state.candidateSide){
      // Consume the previous completed leg once, when input enters its opposite.
      if(state.committedSide===-side&&!state.active){
        state.active=true;state.targetSide=side;state.plantSide=-side;state.time=0;state.incomingHeld=0;state.touched=false;state.worldPoint=null;state.committedSide=0;
      }
      state.candidateSide=side;state.turnTime=0;state.arc=0;
    }
    state.turnTime=(state.turnTime||0)+dt;state.arc=(state.arc||0)+angle;
    if(state.turnTime>=.20&&state.arc>=.045)state.committedSide=side;
  }else{
    state.neutralTime=(state.neutralTime||0)+dt;
    if(state.neutralTime>.75){state.committedSide=0;state.candidateSide=0;state.turnTime=0;state.arc=0;}
  }
  if(state.active){
    state.time+=dt;
    if(side===state.targetSide)state.incomingHeld+=dt;
    else if(!state.touched){state.active=false;state.worldPoint=null;}
    const flattened=skier.edgeRoll===undefined?Math.sign(skier.turn||0)===state.targetSide:skier.edgeRoll*state.targetSide>=-.035;
    if(state.active&&!state.touched&&state.incomingHeld>=.055&&flattened&&state.time<.26){state.touched=true;state.contactAge=0;state.contactStarted=true;}
    if(state.touched){if(!state.contactStarted)state.contactAge+=dt;state.contact=state.contactAge<=.075;}
    if(state.time>=.5||(!state.touched&&state.time>=.26)){state.active=false;state.contact=false;state.worldPoint=null;}
  }
  state.phase=state.active?state.time/.5:0;state.previousHeading=skier.heading;
  return state;
}
