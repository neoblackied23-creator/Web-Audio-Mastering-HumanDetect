// Virtual Performance Layer v1.6
// Original DSP implementation. It does not host VST instruments; it derives subtle
// performance-like parallel layers from the loaded mix: transient/drum reinforcement,
// bass re-amp harmonics, groove micro-variation and natural room ambience.

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function cloneBuffer(buf){const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});for(let c=0;c<buf.numberOfChannels;c++)out.copyToChannel(buf.getChannelData(c),c);return out;}
function rng(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}

function lowpass(src,sr,hz){const out=new Float32Array(src.length);const rc=1/(2*Math.PI*hz),dt=1/sr,a=dt/(rc+dt);let y=src[0]||0;for(let i=0;i<src.length;i++){y+=a*(src[i]-y);out[i]=y;}return out;}
function highpass(src,sr,hz){const lp=lowpass(src,sr,hz),out=new Float32Array(src.length);for(let i=0;i<src.length;i++)out[i]=src[i]-lp[i];return out;}

function addBassReamp(data,sr,amount,mix){
  const bass=lowpass(data,sr,180);const body=lowpass(data,sr,420);
  for(let i=0;i<data.length;i++){
    const x=bass[i]*1.8+body[i]*0.25;
    const sat=Math.tanh(x*(1.8+amount*1.5))*0.55;
    data[i]=data[i]*(1-mix)+clamp(data[i]+sat*mix,-1.2,1.2);
  }
}

function addTransientPerformance(data,sr,amount,mix,random){
  const hp=highpass(data,sr,90);let env=0,prev=0;const attack=Math.exp(-1/(sr*0.0025)),release=Math.exp(-1/(sr*0.055));
  const minGap=Math.floor(sr*0.055);let last=-minGap;
  for(let i=1;i<data.length;i++){
    const a=Math.abs(hp[i]);env=a>env?attack*env+(1-attack)*a:release*env+(1-release)*a;
    const d=env-prev;prev=env;
    if(d>0.018+amount*0.012 && i-last>minGap){
      last=i;const vel=(0.72+random()*0.28)*amount;
      const len=Math.min(Math.floor(sr*0.07),data.length-i);
      const freq=65+random()*45;
      for(let k=0;k<len;k++){
        const t=k/sr;const decay=Math.exp(-t*(32+random()*8));
        const kick=Math.sin(2*Math.PI*freq*t)*decay*vel*0.08;
        const click=(random()*2-1)*Math.exp(-t*85)*vel*0.012;
        data[i+k]+= (kick+click)*mix;
      }
    }
  }
}

function grooveVariation(left,right,sr,amount,random){
  const seg=Math.max(1024,Math.floor(sr*0.24));
  const copyL=new Float32Array(left),copyR=right?new Float32Array(right):null;
  const maxShift=Math.max(1,Math.floor(sr*(0.001+amount*0.004)));
  for(let s=0;s<left.length;s+=seg){
    const shift=Math.round((random()*2-1)*maxShift);const gain=1+(random()*2-1)*amount*0.018;
    const e=Math.min(left.length,s+seg);
    for(let i=s;i<e;i++){
      const j=clamp(i+shift,0,left.length-1);left[i]=left[i]*0.9+copyL[j]*0.1*gain;
      if(right)right[i]=right[i]*0.9+copyR[j]*0.1*(2-gain);
    }
  }
}

function naturalRoom(left,right,sr,amount,mix){
  const taps=[0.009,0.014,0.021,0.031];
  const gains=[0.52,0.34,0.22,0.14];
  const srcL=new Float32Array(left),srcR=right?new Float32Array(right):srcL;
  for(let ti=0;ti<taps.length;ti++){
    const dl=Math.floor(sr*taps[ti]),dr=Math.floor(sr*(taps[ti]+0.0017));
    const g=gains[ti]*mix*amount*0.22;
    for(let i=Math.max(dl,dr);i<left.length;i++){
      left[i]+=srcL[i-dl]*g;
      if(right)right[i]+=srcR[i-dr]*g*0.95;
    }
  }
}

function safePeak(buf){let peak=0;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)peak=Math.max(peak,Math.abs(d[i]));}if(peak>0.985){const g=0.985/peak;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}}

export function applyVirtualPerformance(inputBuffer,options={}){
  if(!inputBuffer)return inputBuffer;
  const strength=options.strength||'medium';
  const amount=strength==='light'?0.38:strength==='strong'?0.9:0.62;
  const mix=clamp(Number(options.mix??25)/100,0,0.5);
  const out=cloneBuffer(inputBuffer),sr=out.sampleRate;
  const random=rng((out.length^sr^0x16a11ce)>>>0);
  const left=out.getChannelData(0),right=out.numberOfChannels>1?out.getChannelData(1):null;

  if(options.humanGroove!==false) grooveVariation(left,right,sr,amount,random);
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c);
    if(options.drums!==false) addTransientPerformance(d,sr,amount,mix,random);
    if(options.bass!==false) addBassReamp(d,sr,amount,mix*0.7);
  }
  if(options.room!==false) naturalRoom(left,right,sr,amount,mix);
  safePeak(out);
  return out;
}
