import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

export class SpeedRenderer{
  constructor(renderer,scene,camera){
    this.composer=new EffectComposer(renderer);this.composer.addPass(new RenderPass(scene,camera));
    this.blur=new ShaderPass({uniforms:{tDiffuse:{value:null},strength:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform float strength;varying vec2 vUv;
        void main(){vec2 center=vec2(.5,.52),ray=vUv-center;float edge=smoothstep(.15,.65,length(ray));vec4 col=vec4(0.);
        for(int i=0;i<7;i++){float t=float(i)/6.;col+=texture2D(tDiffuse,vUv-ray*strength*edge*t);}
        gl_FragColor=col/7.;}`});
    this.composer.addPass(this.blur);this.composer.addPass(new OutputPass());this.enabled=true;
  }
  render(speed,running){this.blur.uniforms.strength.value=this.enabled&&running?Math.min(.026,Math.max(0,(speed-7)/30)*.026):0;this.composer.render();}
  resize(w,h){this.composer.setSize(w,h);}
}
