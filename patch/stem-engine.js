// v1.8 Stem Engine bridge. Uses Electron IPC to run local Demucs, then decodes 4 stems.
export async function getStemEngineStatus(){
  if(!window.electronAPI?.stemStatus) return {available:false,reason:'Electron stem bridge unavailable'};
  return window.electronAPI.stemStatus();
}

export async function setupStemEngine(){
  if(!window.electronAPI?.setupStemEngine) throw new Error('Stem setup bridge unavailable');
  return window.electronAPI.setupStemEngine();
}

async function decodePath(path){
  const bytes=await window.electronAPI.readFileData(path);
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{return await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}
  finally{try{await ctx.close();}catch{}}
}

function newBufferLike(ref){return new AudioBuffer({numberOfChannels:Math.max(1,ref.numberOfChannels),length:ref.length,sampleRate:ref.sampleRate});}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function mixInto(dst,src,gain=1){
  const chans=Math.min(dst.numberOfChannels,src.numberOfChannels),len=Math.min(dst.length,src.length);
  for(let c=0;c<chans;c++){const d=dst.getChannelData(c),s=src.getChannelData(c);for(let i=0;i<len;i++)d[i]+=s[i]*gain;}
}
function bassReamp(buf,amount=.22){
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);let lp=0;const a=.035;for(let i=0;i<d.length;i++){lp+=a*(d[i]-lp);d[i]=d[i]*(1-amount)+Math.tanh((d[i]+lp*.65)*1.7)*amount;}}
  return buf;
}
function drumHumanize(buf,amount=.16){
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);let env=0;for(let i=1;i<d.length;i++){env=.995*env+.005*Math.abs(d[i]);const tr=Math.max(0,Math.abs(d[i])-env*1.7);if(tr>0.02)d[i]*=(1+Math.min(.18,tr*3)*amount);}}
  return buf;
}
function otherNaturalize(buf,amount=.12){
  const sr=buf.sampleRate,dl=Math.floor(sr*.013),dr=Math.floor(sr*.017);
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c),copy=new Float32Array(d),delay=c?dr:dl;for(let i=delay;i<d.length;i++)d[i]=d[i]*(1-amount*.15)+copy[i-delay]*amount*.15;}
  return buf;
}
function safePeak(buf){let p=0;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));}if(p>.985){const g=.985/p;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}}

export async function buildStemReperformance(inputPath,onProgress=()=>{}){
  if(!inputPath) throw new Error('Original file path unavailable');
  if(!window.electronAPI?.separateStems) throw new Error('Stem separation bridge unavailable');
  onProgress({stage:'separating',pct:5});
  const out=await window.electronAPI.separateStems(inputPath);
  if(!out?.success) throw new Error(out?.error||'Demucs separation failed');
  const names=['vocals','drums','bass','other']; const stems={};
  let n=0;
  for(const name of names){
    const p=out.stems?.[name]; if(!p) continue;
    stems[name]=await decodePath(p); n++; onProgress({stage:`decoding ${name}`,pct:25+n*10});
  }
  const ref=stems.vocals||stems.other||stems.drums||stems.bass;
  if(!ref) throw new Error('No stems returned by Demucs');
  const mixed=newBufferLike(ref);
  if(stems.vocals) mixInto(mixed,stems.vocals,1.0);
  if(stems.drums) mixInto(mixed,drumHumanize(stems.drums,.22),1.0);
  if(stems.bass) mixInto(mixed,bassReamp(stems.bass,.28),1.0);
  if(stems.other) mixInto(mixed,otherNaturalize(stems.other,.18),1.0);
  safePeak(mixed); onProgress({stage:'stem remix ready',pct:90});
  return {buffer:mixed,stems:out.stems,outputDir:out.outputDir};
}
