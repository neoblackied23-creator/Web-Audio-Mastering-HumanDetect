// Humanize Boost DSP v3.2.3
// Stronger adaptive naturalizer for HumanDetect. This changes audio structure,
// not detector thresholds. It adds subtle timing, dynamics, stereo and harmonic variation.

function cloneBuffer(buf){
  const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});
  for(let ch=0;ch<buf.numberOfChannels;ch++) out.copyToChannel(buf.getChannelData(ch),ch);
  return out;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function seededNoise(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return (s/4294967296)*2-1;};}
function onePoleLowpass(data,alpha){let y=data[0]||0;for(let i=1;i<data.length;i++){y+=alpha*(data[i]-y);data[i]=y;}}
function softenHarshness(data,sr,amount){
  if(amount<=0)return;
  const smooth=new Float32Array(data);const alpha=clamp((2*Math.PI*8500/sr),0.02,0.5);onePoleLowpass(smooth,alpha);
  const wet=0.035+amount*0.11;
  for(let i=0;i<data.length;i++)data[i]=data[i]*(1-wet)+smooth[i]*wet;
}
function dynamicBreathing(data,sr,amount,rand){
  const seg=Math.max(256,Math.floor(sr*(0.12+Math.abs(rand())*0.20)));
  let target=1,current=1;
  for(let i=0;i<data.length;i++){
    if(i%seg===0)target=1+rand()*amount*0.028;
    current+=0.0018*(target-current);
    data[i]*=current;
  }
}
function microTimingSmear(data,sr,amount,rand){
  if(amount<=0)return;
  const copy=new Float32Array(data);
  const seg=Math.max(512,Math.floor(sr*(0.16+Math.abs(rand())*0.28)));
  const maxShift=Math.floor(sr*(0.002+amount*0.0065));
  for(let start=0;start<data.length;start+=seg){
    const shift=Math.round(rand()*maxShift),end=Math.min(data.length,start+seg);
    const mix=0.055+amount*0.12;
    for(let i=start;i<end;i++){
      const j=clamp(i+shift,0,copy.length-1);
      data[i]=data[i]*(1-mix)+copy[j]*mix;
    }
  }
}
function wowFlutter(data,sr,amount,rand){
  if(amount<=0)return;
  const copy=new Float32Array(data);
  const rate1=0.22+Math.abs(rand())*0.18,rate2=2.7+Math.abs(rand())*1.1;
  const depth=(0.00028+amount*0.00075)*sr;
  for(let i=0;i<data.length;i++){
    const t=i/sr;
    const off=(Math.sin(2*Math.PI*rate1*t)+0.28*Math.sin(2*Math.PI*rate2*t))*depth;
    const p=clamp(i+off,0,copy.length-2),j=Math.floor(p),f=p-j;
    const warped=copy[j]*(1-f)+copy[j+1]*f;
    data[i]=data[i]*0.94+warped*0.06;
  }
}
function microTransientVariation(data,sr,amount,rand){
  let env=0,prev=0,last=-999999;const minGap=Math.floor(sr*0.045);
  for(let i=1;i<data.length;i++){
    const a=Math.abs(data[i]);env+=0.03*(a-env);const d=env-prev;prev=env;
    if(d>0.012&&i-last>minGap){
      last=i;const len=Math.min(data.length-i,Math.floor(sr*(0.022+Math.abs(rand())*0.035)));
      const gain=1+rand()*amount*0.11;
      for(let k=0;k<len;k++){const w=Math.exp(-k/(sr*0.012));data[i+k]*=1+(gain-1)*w;}
    }
  }
}
function analogSoftClip(data,amount){
  const drive=1+amount*0.65,norm=Math.tanh(drive)||1;
  for(let i=0;i<data.length;i++)data[i]=Math.tanh(data[i]*drive)/norm;
}
function stereoMicroVariation(left,right,sr,amount,rand){
  if(!right||amount<=0)return;
  const seg=Math.max(512,Math.floor(sr*0.22));let gl=1,gr=1;
  for(let i=0;i<left.length;i++){
    if(i%seg===0){const d=rand()*amount*0.022;gl=1+d;gr=1-d;}
    left[i]*=gl;right[i]*=gr;
  }
}
function roomNaturalizer(left,right,sr,amount){
  if(amount<=0)return;
  const taps=[0.009,0.014,0.021,0.033],gains=[0.028,0.020,0.013,0.008];
  const l0=new Float32Array(left),r0=right?new Float32Array(right):null;
  for(let ti=0;ti<taps.length;ti++){
    const dl=Math.max(1,Math.floor(sr*taps[ti])),dr=Math.max(1,Math.floor(sr*(taps[ti]+0.0013)));
    const g=gains[ti]*amount;
    for(let i=dl;i<left.length;i++)left[i]+=l0[i-dl]*g;
    if(right)for(let i=dr;i<right.length;i++)right[i]+=r0[i-dr]*g*0.93;
  }
}
function safeNormalize(out){
  let peak=0;for(let ch=0;ch<out.numberOfChannels;ch++){const d=out.getChannelData(ch);for(let i=0;i<d.length;i++)peak=Math.max(peak,Math.abs(d[i]));}
  if(peak>0.985){const g=0.985/peak;for(let ch=0;ch<out.numberOfChannels;ch++){const d=out.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]*=g;}}
}
export function applyHumanizeBoost(inputBuffer,preset='medium',options={cleanup:true}){
  if(!inputBuffer)return inputBuffer;
  const amount=preset==='light'?0.32:preset==='strong'?1.0:preset==='extreme'?1.28:0.64;
  const out=cloneBuffer(inputBuffer),rand=seededNoise((inputBuffer.length^inputBuffer.sampleRate^0x323b00c)>>>0),sr=out.sampleRate;
  for(let ch=0;ch<out.numberOfChannels;ch++){
    const d=out.getChannelData(ch);
    if(options.cleanup!==false)softenHarshness(d,sr,amount);
    dynamicBreathing(d,sr,amount,rand);
    microTimingSmear(d,sr,amount,rand);
    wowFlutter(d,sr,amount,rand);
    microTransientVariation(d,sr,amount,rand);
    analogSoftClip(d,amount*0.52);
  }
  const l=out.getChannelData(0),r=out.numberOfChannels>1?out.getChannelData(1):null;
  stereoMicroVariation(l,r,sr,amount,rand);
  roomNaturalizer(l,r,sr,amount);
  safeNormalize(out);
  return out;
}
