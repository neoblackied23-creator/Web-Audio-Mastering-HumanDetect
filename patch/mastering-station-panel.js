function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function peakRms(buf){
  let peak=0,sum=0,n=0;
  for(let c=0;c<buf.numberOfChannels;c++){
    const d=buf.getChannelData(c);
    for(let i=0;i<d.length;i++){const x=d[i];peak=Math.max(peak,Math.abs(x));sum+=x*x;n++;}
  }
  const rms=Math.sqrt(sum/Math.max(1,n));
  return {peak,peakDb:20*Math.log10(Math.max(1e-9,peak)),rmsDb:20*Math.log10(Math.max(1e-9,rms)),clip:peak>=.999};
}
function wav24(buf){
  const ch=buf.numberOfChannels,sr=buf.sampleRate,len=buf.length,dataBytes=len*ch*3;
  const ab=new ArrayBuffer(44+dataBytes),v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+dataBytes,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*ch*3,true);v.setUint16(32,ch*3,true);v.setUint16(34,24,true);w(36,'data');v.setUint32(40,dataBytes,true);
  let o=44;
  for(let i=0;i<len;i++)for(let c=0;c<ch;c++){
    const x=clamp(buf.getChannelData(c)[i],-1,1),s=Math.round(x*(x<0?8388608:8388607));
    const u=s<0?s+16777216:s;
    v.setUint8(o,u&255);v.setUint8(o+1,(u>>8)&255);v.setUint8(o+2,(u>>16)&255);o+=3;
  }
  return new Blob([ab],{type:'audio/wav'});
}
function download24(buf,name){
  const url=URL.createObjectURL(wav24(buf)),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export function mountMasteringStation(opts={}){
  if(window.__masteringStationMounted)return;window.__masteringStationMounted=true;
  const style=document.createElement('style');
  style.textContent=`.ms-toggle{position:fixed;right:18px;bottom:294px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.ms-panel{position:fixed;left:18px;bottom:18px;width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100007;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.ms-head{display:flex;justify-content:space-between}.ms-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}.ms-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.ms-btn.main{background:#9d6cff}.ms-btn.active{outline:1px solid #b7a2ff}.ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.ms-card{background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.ms-field{margin-top:8px}.ms-field label{display:flex;justify-content:space-between;font-size:11px;opacity:.78}.ms-field input{width:100%}.ms-meter{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.ms-meter div{background:#0005;border-radius:8px;padding:8px;font-size:11px}.ms-log{margin-top:10px;max-height:120px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.ms-status{font-size:11px;opacity:.75}.ms-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:760px){.ms-grid{grid-template-columns:1fr}.ms-meter{grid-template-columns:1fr 1fr}.ms-panel{left:12px;right:12px;width:auto}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='ms-toggle';toggle.textContent='Mastering Station';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='ms-panel';
  root.innerHTML=`<div class="ms-head"><div><b>Mastering Station</b><div class="ms-status">v3.0 • A/B • Presets • Macros • Meter • WAV 24-bit</div></div><button class="ms-close">×</button></div>
  <div class="ms-row" id="ms-presets"></div>
  <div class="ms-grid">
    <div class="ms-card"><b>Master Controls</b>
      <div class="ms-field"><label>Intensity <span id="ms-iv">100%</span></label><input id="ms-intensity" type="range" min="50" max="140" value="100"></div>
      <div class="ms-field"><label>Low Boost <span id="ms-lv">0 dB</span></label><input id="ms-low" type="range" min="-4" max="4" step=".5" value="0"></div>
      <div class="ms-field"><label>High Boost <span id="ms-hv">0 dB</span></label><input id="ms-high" type="range" min="-4" max="4" step=".5" value="0"></div>
      <div class="ms-field"><label>Stereo Width <span id="ms-wv">100%</span></label><input id="ms-width" type="range" min="80" max="125" value="100"></div>
    </div>
    <div class="ms-card"><b>Preview / Output</b><div class="ms-row"><button class="ms-btn" id="ms-build">Build Master</button><button class="ms-btn" id="ms-a">Play A</button><button class="ms-btn" id="ms-b">Play B</button><button class="ms-btn main" id="ms-commit">Use Mastered</button><button class="ms-btn" id="ms-export">Export WAV 24-bit</button></div><div class="ms-status" id="ms-style">Preset: Universal</div></div>
  </div>
  <div class="ms-meter"><div>Input Peak<br><b id="ms-ip">—</b></div><div>Input RMS<br><b id="ms-ir">—</b></div><div>Output Peak<br><b id="ms-op">—</b></div><div>Output RMS / Clip<br><b id="ms-or">—</b></div></div>
  <div id="ms-status" class="ms-status">IDLE</div><div id="ms-log" class="ms-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s);
  const presets=['universal','clarity','tape','punch','brightness','vinyl','spatial'];
  let selected='universal',source=null,mastered=null,audioCtx=null,audioNode=null;
  const log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#ms-log').appendChild(d);$('#ms-log').scrollTop=$('#ms-log').scrollHeight;};
  const status=t=>{$('#ms-status').textContent=t;log(t);};
  const stop=()=>{try{audioNode?.stop()}catch(_){}try{audioCtx?.close()}catch(_){}audioNode=null;audioCtx=null;};
  const play=buf=>{if(!buf)return;stop();audioCtx=new AudioContext();audioNode=audioCtx.createBufferSource();audioNode.buffer=buf;audioNode.connect(audioCtx.destination);audioNode.start();audioNode.onended=()=>{try{audioCtx.close()}catch(_){};audioCtx=null;audioNode=null;};};
  const renderPresets=()=>{$('#ms-presets').innerHTML=presets.map(p=>`<button class="ms-btn ${p===selected?'active':''}" data-p="${p}">${p[0].toUpperCase()+p.slice(1)}</button>`).join('');root.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{selected=b.dataset.p;renderPresets();$('#ms-style').textContent='Preset: '+b.textContent;});};
  const labels=()=>{$('#ms-iv').textContent=$('#ms-intensity').value+'%';$('#ms-lv').textContent=$('#ms-low').value+' dB';$('#ms-hv').textContent=$('#ms-high').value+' dB';$('#ms-wv').textContent=$('#ms-width').value+'%';};
  ['#ms-intensity','#ms-low','#ms-high','#ms-width'].forEach(id=>$(id).addEventListener('input',labels));labels();renderPresets();
  function meters(){
    if(source){const m=peakRms(source);$('#ms-ip').textContent=m.peakDb.toFixed(1)+' dBFS';$('#ms-ir').textContent=m.rmsDb.toFixed(1)+' dBFS';}
    if(mastered){const m=peakRms(mastered);$('#ms-op').textContent=m.peakDb.toFixed(1)+' dBFS';$('#ms-or').textContent=m.rmsDb.toFixed(1)+' dBFS • '+(m.clip?'CLIP':'OK');}
  }
  async function build(){
    const api=window.__masteringAPI;if(!api)throw new Error('Mastering API not available');
    source=await opts.getSource?.();if(!source)throw new Error('Load/process a track first');
    status('RUNNING: mastering '+selected);
    const intensity=Number($('#ms-intensity').value);
    const mode=intensity<85?'light':intensity>118?'heavy':'normal';
    const cfg={profile:'generic',style:selected,intensity:mode,gainMatch:false,eqLow:Number($('#ms-low').value),eqHigh:Number($('#ms-high').value),stereoWidth:Number($('#ms-width').value)};
    const r=await opts.renderCustom?.(source,cfg);
    if(!r?.buffer)throw new Error('Mastering render failed');
    mastered=r.buffer;window.__masteringStationLatest={...r,config:cfg};meters();status('DONE: '+selected+' master ready');return r;
  }
  $('#ms-build').onclick=async()=>{try{await build();}catch(e){status('ERROR: '+e.message);}};
  $('#ms-a').onclick=()=>{source?play(source):status('ERROR: Build Master first');};
  $('#ms-b').onclick=()=>{mastered?play(mastered):status('ERROR: Build Master first');};
  $('#ms-commit').onclick=async()=>{try{if(!mastered)await build();await window.__masteringAPI?.commit?.(mastered,window.__masteringStationLatest?.lufs??null);status('DONE: mastered audio set as current source');}catch(e){status('ERROR: '+e.message);}};
  $('#ms-export').onclick=async()=>{try{if(!mastered)await build();download24(mastered,'HumanDetect_mastered_24bit.wav');status('DONE: exported WAV 24-bit');}catch(e){status('ERROR: '+e.message);}};
  toggle.onclick=async()=>{root.style.display='block';toggle.style.display='none';source=await opts.getSource?.();meters();};
  $('.ms-close').onclick=()=>{stop();root.style.display='none';toggle.style.display='block';};
}
