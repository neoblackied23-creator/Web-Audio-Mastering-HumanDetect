import { analyzeAudioBuffer } from './human-detector-core.js';
import { applyHumanizeBoost } from './humanize-boost.js';
import { applyVirtualPerformance } from './virtual-performance.js';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function makeBufferLike(ref){return new AudioBuffer({numberOfChannels:ref.numberOfChannels,length:ref.length,sampleRate:ref.sampleRate});}
function cloneBuffer(buf){const o=makeBufferLike(buf);for(let c=0;c<buf.numberOfChannels;c++)o.copyToChannel(new Float32Array(buf.getChannelData(c)),c);return o;}
function mixInto(dst,src,gain=1){for(let c=0;c<dst.numberOfChannels;c++){const d=dst.getChannelData(c),s=src.getChannelData(Math.min(c,src.numberOfChannels-1)),n=Math.min(d.length,s.length);for(let i=0;i<n;i++)d[i]+=s[i]*gain;}}
function normalize(buf,ceiling=.985){let p=0;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));}if(p>ceiling){const g=ceiling/p;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}return buf;}
function midiHz(m){return 440*Math.pow(2,(m-69)/12);}
function humanizeNotes(notes,timingMs,velocityPct){
  return notes.map((n,i)=>{
    const jitter=((Math.sin((i+1)*12.9898)*43758.5453)%1)*2-1;
    const vj=((Math.sin((i+3)*78.233)*12345.678)%1)*2-1;
    const shift=jitter*timingMs/1000;
    return {...n,start:Math.max(0,n.start+shift),end:Math.max(n.start+shift+.03,n.end+shift),amp:clamp(n.amp*(1+vj*velocityPct/100),.05,1)};
  });
}
function synthBass(ref,notes){
  const out=makeBufferLike(ref),sr=ref.sampleRate;
  for(const n of notes){
    const f=midiHz(n.pitch),st=Math.floor(n.start*sr),en=Math.min(out.length,Math.floor(n.end*sr));
    const a=Math.max(1,Math.floor(.015*sr)),r=Math.max(1,Math.floor(.08*sr));
    for(let i=st;i<en;i++){
      const t=(i-st)/sr,pos=i-st,remain=en-i;
      let env=Math.min(1,pos/a)*Math.min(1,remain/r); env*=n.amp;
      const x=(Math.sin(2*Math.PI*f*t)+.28*Math.sin(2*Math.PI*f*2*t)+.12*Math.sin(2*Math.PI*f*.5*t))*env*.35;
      for(let c=0;c<out.numberOfChannels;c++)out.getChannelData(c)[i]+=x;
    }
  }
  return normalize(out);
}
function detectOnsets(buf){
  const mono=new Float32Array(buf.length);for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)mono[i]+=d[i]/buf.numberOfChannels;}
  const sr=buf.sampleRate,hop=Math.max(64,Math.floor(sr*.01)),win=Math.max(hop,Math.floor(sr*.025)),ener=[];let prev=0;
  for(let p=0;p<mono.length-win;p+=hop){let e=0,z=0,lp=0,low=0;for(let i=0;i<win;i++){const x=mono[p+i];e+=x*x;lp+=.08*(x-lp);low+=lp*lp;if(i&&Math.sign(x)!==Math.sign(mono[p+i-1]))z++;}e=Math.sqrt(e/win);low=Math.sqrt(low/win);ener.push({t:p/sr,e,flux:Math.max(0,e-prev),low,z:z/win});prev=e;}
  const fluxes=ener.map(x=>x.flux).sort((a,b)=>a-b),thr=(fluxes[Math.floor(fluxes.length*.86)]||0)*.9;
  const out=[];let last=-1;
  for(const x of ener){if(x.flux>thr&&x.e>.01&&x.t-last>.07){let type='snare';if(x.low/x.e>.63)type='kick';else if(x.z>.16)type='hat';out.push({time:x.t,amp:clamp(x.e*5,.15,1),type});last=x.t;}}
  return out;
}
function humanizeHits(hits,timingMs,velocityPct){
  return hits.map((h,i)=>{const j=((Math.sin((i+4)*17.123)*9182.22)%1)*2-1,v=((Math.sin((i+8)*31.41)*7163.11)%1)*2-1;return {...h,time:Math.max(0,h.time+j*timingMs/1000),amp:clamp(h.amp*(1+v*velocityPct/100),.08,1)};});
}
function synthDrums(ref,hits){
  const out=makeBufferLike(ref),sr=ref.sampleRate;
  for(const h of hits){
    const st=Math.floor(h.time*sr),dur=h.type==='kick'?.28:h.type==='snare'?.18:.08,en=Math.min(out.length,st+Math.floor(dur*sr));
    for(let i=st;i<en;i++){
      const t=(i-st)/sr;let x=0;
      if(h.type==='kick'){const f=95-58*(t/dur);x=Math.sin(2*Math.PI*f*t)*Math.exp(-t*18);}
      else if(h.type==='snare'){const noise=Math.sin((i+1)*12.9898)*43758.5453%1*2-1;x=(noise*.75+Math.sin(2*Math.PI*190*t)*.25)*Math.exp(-t*24);}
      else{const noise=Math.sin((i+1)*78.233)*12345.678%1*2-1;x=noise*Math.exp(-t*55);}
      x*=h.amp*.5;for(let c=0;c<out.numberOfChannels;c++)out.getChannelData(c)[i]+=x;
    }
  }
  return normalize(out);
}
function blend(original,synthetic,amount){
  const o=makeBufferLike(original),a=clamp(amount,0,1);
  for(let c=0;c<o.numberOfChannels;c++){const d=o.getChannelData(c),x=original.getChannelData(c),y=synthetic.getChannelData(Math.min(c,synthetic.numberOfChannels-1));for(let i=0;i<d.length;i++)d[i]=x[i]*(1-a)+y[i]*a;}
  return normalize(o);
}
function score(buf){const r=analyzeAudioBuffer(buf);return Number(r.humanScore??r.humanPct);}

function stemStats(buf){
  if(!buf)return null;
  const ch=buf.numberOfChannels,sr=buf.sampleRate,step=Math.max(1,Math.floor(buf.length/(sr*45))),n=Math.ceil(buf.length/step);
  let sum=0,peak=0,z=0,prev=0,low=0,lowSum=0,flux=0,prevAbs=0,count=0;
  for(let i=0;i<buf.length;i+=step){
    let x=0;for(let c=0;c<ch;c++)x+=buf.getChannelData(c)[i]/ch;
    const a=Math.abs(x);sum+=x*x;peak=Math.max(peak,a);if(count&&Math.sign(x)!==Math.sign(prev))z++;
    low+=.06*(x-low);lowSum+=low*low;flux+=Math.max(0,a-prevAbs);prevAbs=a;prev=x;count++;
  }
  const rms=Math.sqrt(sum/Math.max(1,count)),crest=peak/Math.max(.00001,rms),zcr=z/Math.max(1,count),lowRatio=Math.sqrt(lowSum/Math.max(1,count))/Math.max(.00001,rms),activity=flux/Math.max(1,count);
  return {rms,crest,zcr,lowRatio,activity};
}
function analyzeReperformanceProfile(stems){
  const b=stemStats(stems.bass),d=stemStats(stems.drums);
  if(!b&&!d)return {name:'Clean',reason:'no stem metrics'};
  const drumActivity=d?.activity||0,drumCrest=d?.crest||0,drumZcr=d?.zcr||0,bassLow=b?.lowRatio||0,bassCrest=b?.crest||0;
  let name='Clean',reason='balanced stem profile';
  if(drumActivity>.014||drumCrest>7.5){name='Punchy';reason='strong drum transients / high crest';}
  else if(drumZcr>.19&&drumActivity>.006){name='Electronic';reason='dense high-frequency drum activity';}
  else if(bassLow>.76&&bassCrest<6.2){name='Warm';reason='bass-dominant smooth low end';}
  return {name,reason,bass:b,drums:d};
}
function profileSettings(name){
  return ({
    Clean:{timing:8,velocity:6,bass:35,drums:30},
    Warm:{timing:14,velocity:10,bass:50,drums:38},
    Punchy:{timing:10,velocity:12,bass:45,drums:60},
    Electronic:{timing:6,velocity:5,bass:62,drums:68}
  })[name]||{timing:10,velocity:8,bass:45,drums:45};
}
function packScore(pack,type,profile){
  if(!pack||pack.type!==type)return -1;
  const text=[pack.id,pack.name,pack.profile,(pack.tags||[]).join(' ')].join(' ').toLowerCase();
  let s=1;
  const p=profile.toLowerCase();
  if(text.includes(p))s+=10;
  if(profile==='Warm'&&/(warm|vintage|round|analog|acoustic)/.test(text))s+=5;
  if(profile==='Punchy'&&/(punch|attack|rock|live|tight)/.test(text))s+=5;
  if(profile==='Electronic'&&/(808|electro|synth|digital|edm)/.test(text))s+=5;
  if(profile==='Clean'&&/(clean|studio|natural|starter)/.test(text))s+=4;
  if(text.includes('starter'))s+=1;
  return s;
}

async function decodeAudioFile(path){
  const bytes=await window.electronAPI?.readFileData?.(path);
  if(!bytes)throw new Error('Could not read instrument sample: '+path);
  const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const ab=u8.buffer.slice(u8.byteOffset,u8.byteOffset+u8.byteLength);
  const ctx=new AudioContext();
  try{return await ctx.decodeAudioData(ab);}finally{try{await ctx.close()}catch(_){}}
}
async function loadSelectedInstrumentPack(type){
  const id=localStorage.getItem('hd_instrument_'+type);
  if(!id)return null;
  const r=await window.electronAPI?.instrumentManagerList?.();
  const pack=(r?.packs||[]).find(p=>p.id===id&&p.type===type);
  return pack||null;
}
function synthBassFromSample(ref,notes,sample,rootMidi=36){
  const out=makeBufferLike(ref),sr=ref.sampleRate,src=sample.getChannelData(0),srcSr=sample.sampleRate;
  for(const n of notes){
    const ratio=Math.pow(2,(n.pitch-rootMidi)/12);
    const st=Math.floor(n.start*sr),en=Math.min(out.length,Math.floor(n.end*sr));
    const atk=Math.max(1,Math.floor(sr*.01)),rel=Math.max(1,Math.floor(sr*.06));
    for(let i=st;i<en;i++){
      const pos=i-st,remain=en-i;
      const srcPos=pos*srcSr/sr*ratio;
      let idx=Math.floor(srcPos);
      if(idx>=src.length){
        const loopStart=Math.floor(src.length*.18),loopLen=Math.max(1,Math.floor(src.length*.55));
        idx=loopStart+((idx-loopStart)%loopLen+loopLen)%loopLen;
      }
      const next=Math.min(src.length-1,idx+1),frac=srcPos-Math.floor(srcPos);
      let x=(src[idx]*(1-frac)+src[next]*frac);
      const env=Math.min(1,pos/atk)*Math.min(1,remain/rel)*n.amp;
      x*=env;
      for(let ch=0;ch<out.numberOfChannels;ch++)out.getChannelData(ch)[i]+=x*.72;
    }
  }
  return normalize(out);
}
function synthDrumsFromSamples(ref,hits,samples){
  const out=makeBufferLike(ref),sr=ref.sampleRate;
  for(const h of hits){
    const sb=samples[h.type]||samples.snare;if(!sb)continue;
    const src=sb.getChannelData(0),srcSr=sb.sampleRate,st=Math.floor(h.time*sr);
    const outLen=Math.min(out.length-st,Math.floor(src.length*sr/srcSr));
    for(let j=0;j<outLen;j++){
      const sp=j*srcSr/sr,idx=Math.floor(sp),next=Math.min(src.length-1,idx+1),frac=sp-idx;
      const x=(src[idx]*(1-frac)+src[next]*frac)*h.amp;
      for(let ch=0;ch<out.numberOfChannels;ch++)out.getChannelData(ch)[st+j]+=x;
    }
  }
  return normalize(out);
}

export function mountReperformancePanel(opts={}){
  if(window.__reperfMounted)return;window.__reperfMounted=true;
  const style=document.createElement('style');
  style.textContent=`.rp-toggle{position:fixed;right:18px;bottom:156px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.rp-panel{position:fixed;left:18px;bottom:18px;width:min(720px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100004;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.rp-head{display:flex;justify-content:space-between}.rp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.rp-card{background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.rp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.rp-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.rp-btn.main{background:#9d6cff}.rp-btn:disabled{opacity:.4}.rp-field{margin-top:8px}.rp-field label{display:flex;justify-content:space-between;font-size:11px;opacity:.8}.rp-field input{width:100%}.rp-log{margin-top:10px;max-height:120px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.rp-status{font-size:11px;opacity:.75}.rp-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:760px){.rp-grid{grid-template-columns:1fr}.rp-panel{left:12px;right:12px;width:auto}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='rp-toggle';toggle.textContent='Re-Performance';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='rp-panel';
  root.innerHTML=`<div class="rp-head"><div><b>Re-Performance Lab</b><div class="rp-status">v2.9 • Adapt Music + Adaptive Re-Performance + Basic Pitch</div></div><button class="rp-close">×</button></div>
  <div class="rp-row"><button class="rp-btn" id="rp-check">Check Engine</button><button class="rp-btn" id="rp-setup">Setup Re-Performance</button><span id="rp-engine" class="rp-status">checking…</span></div>
  <div class="rp-card" style="margin-top:10px"><b>Auto Instrument Selection</b><div id="rp-profile" class="rp-status">Profile: not analyzed</div><div class="rp-row"><button class="rp-btn" id="rp-autoselect">Auto Select</button><button class="rp-btn main" id="rp-auto">AUTO RE-PERFORMANCE</button></div></div>
  <div class="rp-card" style="margin-top:10px"><b>Adapt Music • Selective Stem Rebuild</b><div class="rp-status">Choose which musical layers may change. Vocals stay original. Melody + Instruments currently map to the Demucs OTHER stem.</div><div class="rp-row"><label><input id="rp-adapt-melody" type="checkbox" checked> Melody</label><label><input id="rp-adapt-instruments" type="checkbox" checked> Instruments</label><label><input id="rp-adapt-bass" type="checkbox" checked> Bass</label><label><input id="rp-adapt-drums" type="checkbox" checked> Drums</label></div><div class="rp-row"><label>Style <select id="rp-adapt-style"><option value="natural">Natural / Live</option><option value="upbeat">Upbeat / Energetic</option><option value="warm">Warm / Organic</option><option value="cinematic">Epic / Cinematic</option></select></label><button class="rp-btn main" id="rp-adapt">ADAPT MUSIC • TRY 4 VERSIONS</button></div><div id="rp-adaptinfo" class="rp-status">No adapted version yet.</div></div>
  <div class="rp-grid">
    <div class="rp-card"><b>Bass Re-Performance</b><div class="rp-status">Basic Pitch converts bass stem to note events, then internal synth replays them.</div><div class="rp-field"><label>Timing Humanize <span id="rp-tv">12 ms</span></label><input id="rp-timing" type="range" min="0" max="35" value="12"></div><div class="rp-field"><label>Velocity Humanize <span id="rp-vv">8%</span></label><input id="rp-velocity" type="range" min="0" max="25" value="8"></div><div class="rp-field"><label>Bass Replace <span id="rp-bv">55%</span></label><input id="rp-bassblend" type="range" min="0" max="100" value="55"></div><button class="rp-btn" id="rp-bass">Analyze + Build Bass</button><div id="rp-bassinfo" class="rp-status">No bass analysis yet.</div></div>
    <div class="rp-card"><b>Drum Re-Performance</b><div class="rp-status">Transient/onset detector classifies kick/snare/hat and internal drum synth replays them.</div><div class="rp-field"><label>Drum Replace <span id="rp-dv">45%</span></label><input id="rp-drumblend" type="range" min="0" max="100" value="45"></div><button class="rp-btn" id="rp-drums">Analyze + Build Drums</button><div id="rp-druminfo" class="rp-status">No drum analysis yet.</div></div>
  </div>
  <div class="rp-row"><button class="rp-btn main" id="rp-remix">Build Re-Performance Remix</button><button class="rp-btn" id="rp-use">Use as Current Source</button><span id="rp-score" class="rp-status">Before/after D1: —</span></div>
  <div id="rp-status" class="rp-status">IDLE</div><div id="rp-log" class="rp-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s);let bassOut=null,drumOut=null,adaptedOther=null,remix=null;
  const log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#rp-log').appendChild(d);$('#rp-log').scrollTop=$('#rp-log').scrollHeight;};
  const status=t=>{$('#rp-status').textContent=t;log(t);};
  function stemBuffers(){return window.__stemLabStemBuffers||{}}
  function stemPaths(){return window.__stemLabStemPaths||{}}
  async function check(){const r=await window.electronAPI?.reperfStatus?.();$('#rp-engine').textContent=r?.available?'ready':'not installed';return r;}
  $('#rp-check').onclick=check;
  $('#rp-setup').onclick=async()=>{try{status('RUNNING: setup Basic Pitch engine');const r=await window.electronAPI?.setupReperfEngine?.();if(!r?.success)throw new Error(r?.error||'setup failed');status('DONE: Re-Performance engine ready');await check();}catch(e){status('ERROR: '+e.message);}};
  const labels=()=>{$('#rp-tv').textContent=$('#rp-timing').value+' ms';$('#rp-vv').textContent=$('#rp-velocity').value+'%';$('#rp-bv').textContent=$('#rp-bassblend').value+'%';$('#rp-dv').textContent=$('#rp-drumblend').value+'%';};
  ['#rp-timing','#rp-velocity','#rp-bassblend','#rp-drumblend'].forEach(id=>$(id).addEventListener('input',labels));labels();
  async function buildBass(){const b=stemBuffers().bass,p=stemPaths().bass;if(!b||!p)throw new Error('Separate stems in Stem Lab first');status('RUNNING: Basic Pitch analyzing bass stem');const r=await window.electronAPI?.analyzeBassNotes?.(p);if(!r?.success)throw new Error(r?.error||'Basic Pitch failed');const notes=humanizeNotes(r.notes,Number($('#rp-timing').value),Number($('#rp-velocity').value));let syn=null,source='internal synth';const pack=await loadSelectedInstrumentPack('bass');if(pack?.samplePath){status('RUNNING: loading bass sample pack '+pack.name);const sample=await decodeAudioFile(pack.samplePath);syn=synthBassFromSample(b,notes,sample,Number(pack.rootMidi||36));source=pack.name;}else{syn=synthBass(b,notes);}bassOut=blend(b,syn,Number($('#rp-bassblend').value)/100);$('#rp-bassinfo').textContent=r.count+' notes • '+source+' ready';status('DONE: virtual bass built with '+source);return true;}
  $('#rp-bass').onclick=async()=>{try{await buildBass();}catch(e){status('ERROR: '+e.message);}};
  async function buildDrums(){const d=stemBuffers().drums;if(!d)throw new Error('Separate stems in Stem Lab first');status('RUNNING: detecting drum onsets');const hits=humanizeHits(detectOnsets(d),Number($('#rp-timing').value),Number($('#rp-velocity').value));let syn=null,source='internal synth';const pack=await loadSelectedInstrumentPack('drums');if(pack?.samplePaths){status('RUNNING: loading drum sample pack '+pack.name);const samples={};for(const type of ['kick','snare','hat'])if(pack.samplePaths[type])samples[type]=await decodeAudioFile(pack.samplePaths[type]);syn=synthDrumsFromSamples(d,hits,samples);source=pack.name;}else{syn=synthDrums(d,hits);}drumOut=blend(d,syn,Number($('#rp-drumblend').value)/100);const k=hits.filter(x=>x.type==='kick').length,s=hits.filter(x=>x.type==='snare').length,h=hits.filter(x=>x.type==='hat').length;$('#rp-druminfo').textContent=`${hits.length} hits • kick ${k} • snare ${s} • hat ${h} • ${source}`;status('DONE: virtual drums built with '+source);return true;}
  $('#rp-drums').onclick=async()=>{try{await buildDrums();}catch(e){status('ERROR: '+e.message);}};
  function adaptConfig(style,idx){
    const table={
      natural:[{h:'medium',vp:'light',mix:14,room:true},{h:'strong',vp:'light',mix:18,room:true},{h:'medium',vp:'medium',mix:22,room:true},{h:'strong',vp:'medium',mix:26,room:true}],
      upbeat:[{h:'medium',vp:'medium',mix:24,room:false},{h:'strong',vp:'medium',mix:30,room:false},{h:'medium',vp:'strong',mix:34,room:true},{h:'strong',vp:'strong',mix:40,room:true}],
      warm:[{h:'medium',vp:'light',mix:18,room:true},{h:'strong',vp:'light',mix:22,room:true},{h:'strong',vp:'medium',mix:25,room:true},{h:'extreme',vp:'medium',mix:28,room:true}],
      cinematic:[{h:'medium',vp:'medium',mix:20,room:true},{h:'strong',vp:'medium',mix:28,room:true},{h:'strong',vp:'strong',mix:34,room:true},{h:'extreme',vp:'strong',mix:38,room:true}]
    };
    return (table[style]||table.natural)[idx];
  }
  function makeAdaptCandidate(st,cfg,useOther,useBass,useDrums){
    const ref=st.vocals||st.other||st.drums||st.bass,out=makeBufferLike(ref);
    if(st.vocals)mixInto(out,st.vocals);
    if(st.other){
      let o=st.other;
      if(useOther){
        o=applyVirtualPerformance(o,{strength:cfg.vp,mix:cfg.mix,humanGroove:true,drums:false,bass:true,room:cfg.room});
        o=applyHumanizeBoost(o,cfg.h,{cleanup:true});
      }
      mixInto(out,o);
    }
    if(useBass&&bassOut)mixInto(out,bassOut);else if(st.bass)mixInto(out,st.bass);
    if(useDrums&&drumOut)mixInto(out,drumOut);else if(st.drums)mixInto(out,st.drums);
    return normalize(out);
  }
  async function buildAdaptMusic(){
    const st=stemBuffers(),ref=st.vocals||st.other||st.drums||st.bass;
    if(!ref)throw new Error('Separate stems in Stem Lab first');
    const useOther=$('#rp-adapt-melody').checked||$('#rp-adapt-instruments').checked;
    const useBass=$('#rp-adapt-bass').checked,useDrums=$('#rp-adapt-drums').checked;
    if(!useOther&&!useBass&&!useDrums)throw new Error('Select at least one layer to adapt');
    const style=$('#rp-adapt-style').value;
    status('RUNNING: Adapt Music selective stem processing');
    if(useBass){await buildBass();await new Promise(r=>setTimeout(r,0));}
    if(useDrums){await buildDrums();await new Promise(r=>setTimeout(r,0));}
    let best=null;
    for(let i=0;i<4;i++){
      const cfg=adaptConfig(style,i),cand=makeAdaptCandidate(st,cfg,useOther,useBass,useDrums),s=score(cand);
      status('Adapt version '+(i+1)+'/4 • '+s.toFixed(1)+'% human-like');
      if(!best||s>best.score)best={buffer:cand,score:s,index:i+1,cfg};
      await new Promise(r=>setTimeout(r,0));
    }
    remix=best.buffer;adaptedOther=useOther;
    const before=opts.getOriginalBuffer?await Promise.resolve(opts.getOriginalBuffer()):null;
    $('#rp-adaptinfo').textContent='Best version '+best.index+' • '+best.score.toFixed(1)+'% human-like • '+style+' • selected: '+[useOther?'melody/instruments':null,useBass?'bass':null,useDrums?'drums':null].filter(Boolean).join(', ');
    $('#rp-score').textContent=before?('D1 before '+score(before).toFixed(1)+'% → adapted '+best.score.toFixed(1)+'%'):('D1 adapted '+best.score.toFixed(1)+'%');
    status('DONE: Adapt Music best version ready');
    return remix;
  }
  $('#rp-adapt').onclick=async()=>{const b=$('#rp-adapt');b.disabled=true;try{await buildAdaptMusic();}catch(e){status('ERROR: '+e.message);}finally{b.disabled=false;}};
  async function buildRemix(){const st=stemBuffers(),ref=st.vocals||st.other||st.drums||st.bass;if(!ref)throw new Error('Separate stems first');remix=makeBufferLike(ref);if(st.vocals)mixInto(remix,st.vocals);if(st.other)mixInto(remix,st.other);if(bassOut)mixInto(remix,bassOut);else if(st.bass)mixInto(remix,st.bass);if(drumOut)mixInto(remix,drumOut);else if(st.drums)mixInto(remix,st.drums);normalize(remix);const before=opts.getOriginalBuffer?opts.getOriginalBuffer():null;const b=await Promise.resolve(before);$('#rp-score').textContent=b?`D1 before ${score(b).toFixed(1)}% → after ${score(remix).toFixed(1)}%`:`D1 after ${score(remix).toFixed(1)}%`;status('DONE: Re-Performance remix ready');return remix;}
  $('#rp-remix').onclick=async()=>{try{await buildRemix();}catch(e){status('ERROR: '+e.message);}};
  async function autoSelectProfile(){
    const st=stemBuffers();if(!st.bass&&!st.drums)throw new Error('Separate stems in Stem Lab first');
    const profile=analyzeReperformanceProfile(st),cfg=profileSettings(profile.name);
    $('#rp-timing').value=cfg.timing;$('#rp-velocity').value=cfg.velocity;$('#rp-bassblend').value=cfg.bass;$('#rp-drumblend').value=cfg.drums;labels();
    let r=await window.electronAPI?.instrumentManagerList?.(),packs=r?.packs||[];
    if(!packs.some(p=>p.type==='bass')||!packs.some(p=>p.type==='drums')){
      status('RUNNING: installing starter packs as fallback');
      const x=await window.electronAPI?.installStarterInstruments?.();if(x?.success)packs=x.packs||packs;
    }
    for(const type of ['bass','drums']){
      const candidates=packs.filter(p=>p.type===type).sort((a,b)=>packScore(b,type,profile.name)-packScore(a,type,profile.name));
      if(candidates[0])localStorage.setItem('hd_instrument_'+type,candidates[0].id);
    }
    window.__instrumentSelection={bass:localStorage.getItem('hd_instrument_bass'),drums:localStorage.getItem('hd_instrument_drums')};
    $('#rp-profile').textContent='Profile: '+profile.name+' • '+profile.reason+' • bass '+(window.__instrumentSelection.bass||'internal')+' • drums '+(window.__instrumentSelection.drums||'internal');
    window.__reperformanceProfile=profile;
    status('DONE: Auto Select → '+profile.name);
    return profile;
  }
  $('#rp-autoselect').onclick=async()=>{try{await autoSelectProfile();}catch(e){status('ERROR: '+e.message);}};
  $('#rp-auto').onclick=async()=>{const b=$('#rp-auto');b.disabled=true;try{status('RUNNING: Auto Re-Performance');await autoSelectProfile();await buildBass();await new Promise(r=>setTimeout(r,0));await buildDrums();await new Promise(r=>setTimeout(r,0));await buildRemix();status('DONE: Auto Re-Performance complete');}catch(e){status('ERROR: '+e.message);}finally{b.disabled=false;}};
  async function useCurrent(){if(!remix)throw new Error('Build Re-Performance Remix first');await opts.commitSource?.(remix);window.__reperfCurrentSource=remix;status('DONE: Re-Performance set as current source');return remix;}
  $('#rp-use').onclick=async()=>{try{await useCurrent();}catch(e){status('ERROR: '+e.message);}};
  window.__reperformanceAPI={check,autoSelect:autoSelectProfile,buildBass,buildDrums,buildAdaptMusic,buildRemix,useCurrent,getRemix:()=>remix,getBassOutput:()=>bassOut,getDrumOutput:()=>drumOut};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();};$('.rp-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};check();
}
