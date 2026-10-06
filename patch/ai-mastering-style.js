// AI Music Mastering v1.9
// Original local DSP implementation inspired by common mastering workflows.
// Profiles/styles are descriptive and do not copy proprietary BandLab/Ozone DSP.

function clamp(v,a=-1,b=1){return Math.max(a,Math.min(b,v));}
function cloneBuffer(buf){const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});for(let c=0;c<buf.numberOfChannels;c++)out.copyToChannel(buf.getChannelData(c),c);return out;}
function lowpass(src,sr,hz){const out=new Float32Array(src.length),dt=1/sr,rc=1/(2*Math.PI*hz),a=dt/(rc+dt);let y=src[0]||0;for(let i=0;i<src.length;i++){y+=a*(src[i]-y);out[i]=y;}return out;}
function highpass(src,sr,hz){const lp=lowpass(src,sr,hz),o=new Float32Array(src.length);for(let i=0;i<src.length;i++)o[i]=src[i]-lp[i];return o;}
function peakOf(buf){let p=0;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));}return p;}
function gainBuffer(buf,g){for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}

const PROFILE={
  generic:{mud:0.10,harsh:0.08,air:0.04,bass:0.02},
  suno:{mud:0.15,harsh:0.14,air:0.03,bass:0.01},
  treblo:{mud:0.09,harsh:0.07,air:0.035,bass:0.015},
  udio:{mud:0.11,harsh:0.10,air:0.03,bass:0.02}
};
const STYLE={
  'ai-clean':{sat:.08,width:.05,punch:.04,bright:.02,warm:.03},
  universal:{sat:.07,width:.07,punch:.06,bright:.03,warm:.03},
  fire:{sat:.12,width:.05,punch:.12,bright:.02,warm:.05},
  clarity:{sat:.05,width:.08,punch:.04,bright:.10,warm:.00},
  tape:{sat:.16,width:.03,punch:.03,bright:-.02,warm:.12},
  natural:{sat:.04,width:.03,punch:.03,bright:.02,warm:.02},
  cinematic:{sat:.08,width:.12,punch:.08,bright:.03,warm:.06},
  spatial:{sat:.04,width:.18,punch:.02,bright:.04,warm:.01},
  punch:{sat:.08,width:.05,punch:.16,bright:.02,warm:.02}
};

export function getMasteringSettings(profile='generic',style='ai-clean',intensity='normal'){
  const mult=intensity==='light'?.65:intensity==='heavy'?1.35:1;
  const targetLufs=intensity==='heavy'?-10:intensity==='light'?-12:-11;
  return {profile,style,intensity,mult,targetLufs,truePeakCeiling:-1};
}

export function applyAIMasteringStyle(inputBuffer,options={}){
  if(!inputBuffer)return inputBuffer;
  const profile=PROFILE[options.profile]||PROFILE.generic;
  const style=STYLE[options.style]||STYLE['ai-clean'];
  const mult=options.intensity==='light'?.65:options.intensity==='heavy'?1.35:1;
  const out=cloneBuffer(inputBuffer),sr=out.sampleRate;
  const beforeRms=[];
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c);let s=0;for(let i=0;i<d.length;i++)s+=d[i]*d[i];beforeRms[c]=Math.sqrt(s/Math.max(1,d.length));
  }
  // Smart headroom: aim around -6 dBFS peak before color/limiting.
  const peak=peakOf(out);if(peak>0){const target=.50; if(peak>target)gainBuffer(out,target/peak);}
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c),low=lowpass(d,sr,180),mud=lowpass(d,sr,420),hi=highpass(d,sr,4500),air=highpass(d,sr,9000);
    let env=0,prev=0;const atk=.18,rel=.995;
    for(let i=0;i<d.length;i++){
      const a=Math.abs(d[i]);env=a>env?env+(a-env)*atk:env*rel;const tr=Math.max(0,env-prev);prev=env;
      let x=d[i];
      // Profile cleanup: low-mid mud and upper harshness control.
      x-=mud[i]*profile.mud*mult;
      x-=hi[i]*profile.harsh*mult*.28;
      x+=air[i]*(profile.air+style.bright)*mult;
      x+=low[i]*(profile.bass+style.warm*.10)*mult;
      // Glue/punch micro-dynamics.
      x+=Math.sign(x)*Math.min(Math.abs(x),tr*8)*style.punch*mult;
      // Multiband-ish color: tape on lows, triode-like on mids/highs.
      const lowColor=Math.tanh(low[i]*(1.8+style.sat*4))*style.sat*.18*mult;
      const hiColor=Math.tanh((x-low[i])*(2.1+style.sat*5))*style.sat*.11*mult;
      d[i]=clamp(x+lowColor+hiColor,-1.2,1.2);
    }
  }
  // Center-protected stereo width: widen side only, keep mid/bass stable.
  if(out.numberOfChannels>1){const L=out.getChannelData(0),R=out.getChannelData(1),width=1+style.width*mult;for(let i=0;i<L.length;i++){const m=(L[i]+R[i])*.5,s=(L[i]-R[i])*.5*width;L[i]=clamp(m+s,-1.2,1.2);R[i]=clamp(m-s,-1.2,1.2);}}
  // Optional loudness-matched preview behavior: restore approximate input RMS before final master.
  if(options.gainMatch){for(let c=0;c<out.numberOfChannels;c++){const d=out.getChannelData(c);let s=0;for(let i=0;i<d.length;i++)s+=d[i]*d[i];const r=Math.sqrt(s/Math.max(1,d.length));if(r>1e-9)for(let i=0;i<d.length;i++)d[i]*=Math.min(2,beforeRms[c]/r);}}
  const p=peakOf(out);if(p>.92)gainBuffer(out,.92/p);
  return out;
}
