// Humanize Boost DSP - original implementation for Web Audio Mastering HumanDetect.
// Designed to add subtle natural variation without copying Shimmer source code.

function cloneBuffer(buf){
  const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});
  for(let ch=0;ch<buf.numberOfChannels;ch++) out.copyToChannel(buf.getChannelData(ch),ch);
  return out;
}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function seededNoise(seed){
  let s=seed>>>0;
  return ()=>{s=(1664525*s+1013904223)>>>0;return (s/4294967296)*2-1;};
}

function onePoleLowpass(data, alpha){
  let y=data[0]||0;
  for(let i=1;i<data.length;i++){y+=alpha*(data[i]-y);data[i]=y;}
}

function softenHarshness(data, sr, amount){
  if(amount<=0) return;
  const smooth=new Float32Array(data.length);
  smooth.set(data);
  const alpha=clamp((2*Math.PI*9000/sr),0.02,0.55);
  onePoleLowpass(smooth,alpha);
  const wet=0.04+amount*0.12;
  for(let i=0;i<data.length;i++) data[i]=data[i]*(1-wet)+smooth[i]*wet;
}

function dynamicBreathing(data,sr,amount,rand){
  const seg=Math.max(256,Math.floor(sr*0.22));
  let target=1,current=1;
  for(let i=0;i<data.length;i++){
    if(i%seg===0) target=1+rand()*amount*0.012;
    current+=0.002*(target-current);
    data[i]*=current;
  }
}

function microTimingSmear(data,sr,amount,rand){
  if(amount<=0) return;
  const copy=new Float32Array(data);
  const seg=Math.max(512,Math.floor(sr*0.35));
  const maxShift=Math.floor(sr*(0.0015+amount*0.0035)); // ~1.5-5 ms
  for(let start=0;start<data.length;start+=seg){
    const shift=Math.round(rand()*maxShift);
    const end=Math.min(data.length,start+seg);
    for(let i=start;i<end;i++){
      const j=clamp(i+shift,0,copy.length-1);
      const mix=0.03+amount*0.07;
      data[i]=data[i]*(1-mix)+copy[j]*mix;
    }
  }
}

function analogSoftClip(data,amount){
  const drive=1+amount*0.45;
  const norm=Math.tanh(drive)||1;
  for(let i=0;i<data.length;i++) data[i]=Math.tanh(data[i]*drive)/norm;
}

function stereoMicroVariation(left,right,sr,amount,rand){
  if(!right||amount<=0) return;
  const seg=Math.max(512,Math.floor(sr*0.4));
  let gl=1,gr=1;
  for(let i=0;i<left.length;i++){
    if(i%seg===0){const d=rand()*amount*0.01;gl=1+d;gr=1-d;}
    left[i]*=gl;right[i]*=gr;
  }
}

function roomNaturalizer(left,right,sr,amount){
  if(amount<=0) return;
  const delay=Math.max(1,Math.floor(sr*0.011));
  const mix=0.01+amount*0.025;
  for(let i=left.length-1;i>=delay;i--) left[i]+=left[i-delay]*mix;
  if(right){const delayR=Math.max(1,Math.floor(sr*0.014));for(let i=right.length-1;i>=delayR;i--) right[i]+=right[i-delayR]*mix*0.9;}
}

export function applyHumanizeBoost(inputBuffer, preset='medium', options={cleanup:true}){
  if(!inputBuffer) return inputBuffer;
  const amount=preset==='light'?0.35:preset==='strong'?0.9:0.6;
  const out=cloneBuffer(inputBuffer);
  const rand=seededNoise((inputBuffer.length^inputBuffer.sampleRate^0x51a7b00c)>>>0);
  const sr=out.sampleRate;
  for(let ch=0;ch<out.numberOfChannels;ch++){
    const d=out.getChannelData(ch);
    if(options.cleanup!==false) softenHarshness(d,sr,amount);
    dynamicBreathing(d,sr,amount,rand);
    microTimingSmear(d,sr,amount,rand);
    analogSoftClip(d,amount*0.6);
  }
  const l=out.getChannelData(0);
  const r=out.numberOfChannels>1?out.getChannelData(1):null;
  stereoMicroVariation(l,r,sr,amount,rand);
  roomNaturalizer(l,r,sr,amount);

  // final safety normalization to avoid accidental clipping before mastering chain
  let peak=0;
  for(let ch=0;ch<out.numberOfChannels;ch++){
    const d=out.getChannelData(ch);for(let i=0;i<d.length;i++) peak=Math.max(peak,Math.abs(d[i]));
  }
  if(peak>0.985){const g=0.985/peak;for(let ch=0;ch<out.numberOfChannels;ch++){const d=out.getChannelData(ch);for(let i=0;i<d.length;i++) d[i]*=g;}}
  return out;
}
