import {pointAlongRoute} from './terrain.js';
import {nearestOnRoute} from './physics.js';
// Development-only footage capture. Uses the real renderer and ski controller.
// Open /?record-demo, then click the explicit record button. No screen permission.
export function installDemoCapture(api){
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d',{alpha:false});
  const button=document.createElement('button');button.textContent='录制 24 秒实机 Demo';
  Object.assign(button.style,{position:'fixed',bottom:'20px',left:'20px',zIndex:'100',border:'1px solid #d7edbd',background:'#173d3c',color:'#f4f8eb',padding:'13px 18px',borderRadius:'6px',font:'600 13px system-ui',cursor:'pointer'});
  document.body.append(button);
  let recording=false,started=0,recorder,chunks=[],droppedIn=false,lastDraw=-1;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const rounded=(x,y,w,h,r=8)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
  function title(text,x,y,size,color='#eff4e8',weight=600){ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui, sans-serif`;ctx.fillText(text,x,y);}
  function draw(time){
    if(!recording||time-lastDraw<1000/30)return;
    lastDraw=time;const t=(time-started)/1000;
    ctx.drawImage(api.canvas,0,0,1280,720);
    const top=ctx.createLinearGradient(0,0,0,150);top.addColorStop(0,'#092b38a8');top.addColorStop(1,'#092b3800');ctx.fillStyle=top;ctx.fillRect(0,0,1280,150);
    const bottom=ctx.createLinearGradient(0,500,0,720);bottom.addColorStop(0,'#092b3800');bottom.addColorStop(1,'#092b38b8');ctx.fillStyle=bottom;ctx.fillRect(0,500,1280,220);
    title('△  TERRAIN SESSIONS',40,47,16,'#f1f5e9',700);
    title(`${api.mountain().name.toUpperCase()} / LIVE CAPTURE`,760,45,11,'#e0eadc',500);
    if(t<2.2){
      ctx.fillStyle='#123d4340';ctx.fillRect(0,0,1280,720);
      title('REAL TERRAIN.',65,295,76);title('FRESH TRACKS.',65,380,76,'#c4ed93');
      title(`Find your line at ${api.mountain().name}.`,70,430,23,'#eef3e8',400);
      title('REAL ELEVATION  /  OPENSTREETMAP TRAILS  /  DEFORMABLE POWDER',70,627,12,'#eff4e8',500);
    }else{
      const s=api.skier(),route=api.route();
      ctx.fillStyle='#f5f8eced';rounded(40,91,210,144);
      title(route.name.toUpperCase(),57,116,11,'#32544b',700);
      title(String(Math.round(s.speed*3.6)),54,182,60,'#163b3c',600);title('KM/H',159,180,12,'#5e7668',500);
      title(`POWDER  /  ${Math.round(s.edgeAngle*180/Math.PI)}° EDGE`,57,214,10,'#52705d',600);
      const label=t<6?'DROP IN.':t<11?'LEAN INTO THE TURN.':t<16.5?'LEAVE A LINE.':'THE MOUNTAIN IS REAL.';
      title(label,43,636,34,'#f3f6ed',700);
      title(t<16.5?'Actual browser capture · custom ski physics · live snow deformation':'Real terrain · mapped runs · weather and drone exploration',44,667,13,'#d8e6dc',400);
      if(t>10&&t<16.5){
        ctx.fillStyle='#f5f8eced';rounded(1000,481,240,212);
        title(api.mountain().referenceMap?'MAP / YOUR LINE':'AERIAL / YOUR LINE',1012,502,10,'#365c49',700);
        ctx.drawImage(api.minimap(),1008,512,224,168);
        title(api.mountain().referenceMap?'© OSM · Mapzen / Canada OGL':'© OSM · USGS / USDA NAIP',1015,689,8,'#49654f',500);
      }
    }
    if(api.mountain().pack==='whistler')title('EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016) · CC BY 4.0',40,706,8,'#eef3e8',400);
    ctx.fillStyle='#d9eea8';ctx.fillRect(0,716,1280*clamp(t/24,0,1),4);
  }
  button.addEventListener('click',()=>{
    if(recording)return;
    api.stage();api.aerial();api.weather('clear');api.sunset=false;droppedIn=false;chunks=[];lastDraw=-1;
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mime){button.textContent='当前浏览器不支持 WebM 录制';return;}
    recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:mime,videoBitsPerSecond:7000000});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onstop=()=>{
      const blob=new Blob(chunks,{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`terrain-${api.mountain().pack==='whistler'?'whistler':'crystal'}-current.webm`;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);button.disabled=false;button.textContent='Demo 已下载 · 点击重新录制';
    };
    recording=true;started=performance.now();button.disabled=true;button.textContent='正在录制真实游戏画面…';recorder.start(500);
  });
  return {
    beforeFrame(time){
      if(!recording)return;
      const t=(time-started)/1000;
      if(t>=2.2&&!droppedIn){api.start();droppedIn=true;}
      if(droppedIn){
        api.view(t>=16.5?'overview':'follow');
        const s=api.skier(),points=api.route().points;if(t>15&&!api.sunset){api.weather('sunset');api.sunset=true;}
        const p=pointAlongRoute(api.route(),nearestOnRoute(s,points).progress+30),baseAngle=Math.atan2(Math.sin(Math.atan2(p.x-s.x,p.z-s.z)-s.heading),Math.cos(Math.atan2(p.x-s.x,p.z-s.z)-s.heading));
        const angle=baseAngle+.12*Math.sin((t-2.2)*1.1);
        api.input({steer:clamp(-angle*1.2,-.75,.75),edge:Math.abs(angle)>.4?.18:0,pole:s.speed<4,tuck:t>2.5&&t<6?1:0});
      }
      if(t>=24){recording=false;api.input(null);api.stop();recorder.stop();}
    },
    afterFrame(time){draw(time);},
  };
}
