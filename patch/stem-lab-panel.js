import { getStemEngineStatus, setupStemEngine } from './stem-engine.js';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function cloneBuffer(buf){
  const out=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});
  for(let c=0;c<buf.numberOfChannels;c++) out.copyToChannel(new Float32Array(buf.getChannelData(c)),c);
  return out;
}
function peakNormalize(buf,ceiling=.985){
  let p=0;
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));}
  if(p>ceiling){const g=ceiling/p;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}
  return buf;
}
function applyCleanup(buf,s){
  const out=cloneBuffer(buf),sr=out.sampleRate;
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c),copy=new Float32Array(d);
    let hp=0,prev=0,noise=0;
    for(let i=0;i<d.length;i++){
      let x=copy[i];
      if(s.denoise>0){
        const abs=Math.abs(x);noise=.9995*noise+.0005*abs;
        const gate=noise*(1.2+s.denoise*1.8);
        if(abs<gate)x*=1-s.denoise*.65;
      }
      if(s.dereverb>0){
        const a=Math.exp(-1/(sr*(.025+s.dereverb*.08)));
        hp=a*(hp+x-prev);prev=x;
        x=x*(1-s.dereverb*.22)+hp*s.dereverb*.22;
      }
      if(s.deecho>0){
        const dl=Math.floor(sr*(.06+s.deecho*.18));
        if(i>=dl)x-=copy[i-dl]*s.deecho*.18;
      }
      d[i]=x;
    }
  }
  return peakNormalize(out);
}
function applyDelayEcho(buf,s){
  const out=cloneBuffer(buf),sr=out.sampleRate;
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c),dry=new Float32Array(d);
    if(s.delayOn){
      const dl=Math.max(1,Math.floor(sr*s.delayTime/1000));
      for(let i=dl;i<d.length;i++){
        const wet=dry[i-dl]*(1-s.delayFeedback)+d[i-dl]*s.delayFeedback;
        d[i]=dry[i]*(1-s.delayMix)+wet*s.delayMix;
      }
    }
    if(s.echoOn){
      const dl=Math.max(1,Math.floor(sr*s.echoTime/1000));
      const damp=clamp(s.echoDamping/12000,.02,.95);
      let lp=0;
      for(let i=dl;i<d.length;i++){
        lp+=(dry[i-dl]-lp)*damp;
        const wet=lp*s.echoRepeats;
        d[i]=d[i]*(1-s.echoMix)+wet*s.echoMix;
      }
    }
  }
  return peakNormalize(out);
}
function applyReverb(buf,s){
  if(!s.reverbOn)return buf;
  const out=cloneBuffer(buf),sr=out.sampleRate;
  const taps=[.031,.047,.073,.109].map(x=>Math.floor(sr*x));
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c),dry=new Float32Array(d),wet=new Float32Array(d.length);
    for(let t=0;t<taps.length;t++){
      const dl=taps[t]+Math.floor(sr*s.reverbPredelay/1000);
      const g=(.45/(t+1))*clamp(s.reverbDecay/3,.25,1.6);
      for(let i=dl;i<d.length;i++)wet[i]+=dry[i-dl]*g;
    }
    for(let i=0;i<d.length;i++)d[i]=dry[i]*(1-s.reverbMix)+wet[i]*s.reverbMix;
  }
  return peakNormalize(out);
}
function applyLoFi(buf,s){
  if(!s.lofiOn)return buf;
  const out=cloneBuffer(buf),sr=out.sampleRate,levels=Math.max(4,2**Math.max(2,Math.round(s.lofiBits)));
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c);let lp=0;
    for(let i=0;i<d.length;i++){
      let x=d[i];
      x=Math.round(x*levels)/levels;
      const wob=1+Math.sin(i/sr*2*Math.PI*.35)*s.lofiWobble*.05;
      x*=wob;
      const a=clamp(s.lofiMuffle/12000,.01,.95);lp+=(x-lp)*a;
      d[i]=d[i]*(1-s.lofiAmount)+lp*s.lofiAmount;
    }
  }
  return peakNormalize(out);
}
export function processStemBuffer(buf,s){
  let out=applyCleanup(buf,s);
  out=applyDelayEcho(out,s);
  out=applyReverb(out,s);
  out=applyLoFi(out,s);
  return peakNormalize(out);
}
function mixBuffers(stems,settings){
  const ref=Object.values(stems).find(Boolean);if(!ref)return null;
  const out=new AudioBuffer({numberOfChannels:ref.numberOfChannels,length:ref.length,sampleRate:ref.sampleRate});
  for(const [name,buf] of Object.entries(stems)){
    if(!buf)continue;
    const processed=processStemBuffer(buf,settings[name]);
    const g=settings[name].gain;
    for(let c=0;c<out.numberOfChannels;c++){
      const d=out.getChannelData(c),s=processed.getChannelData(Math.min(c,processed.numberOfChannels-1));
      const n=Math.min(d.length,s.length);for(let i=0;i<n;i++)d[i]+=s[i]*g;
    }
  }
  return peakNormalize(out);
}
function wavBlob(buf){
  const ch=buf.numberOfChannels,sr=buf.sampleRate,len=buf.length,bytes=44+len*ch*2,ab=new ArrayBuffer(bytes),v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,bytes-8,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,len*ch*2,true);
  let o=44;for(let i=0;i<len;i++)for(let c=0;c<ch;c++){const x=clamp(buf.getChannelData(c)[i],-1,1);v.setInt16(o,x<0?x*32768:x*32767,true);o+=2;}
  return new Blob([ab],{type:'audio/wav'});
}
function downloadBuffer(buf,name){
  const url=URL.createObjectURL(wavBlob(buf)),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function defaultSettings(){return {gain:1,dereverb:0,deecho:0,denoise:0,delayOn:false,delayTime:180,delayFeedback:.22,delayMix:.18,echoOn:false,echoTime:380,echoRepeats:.5,echoDamping:3200,echoMix:.25,reverbOn:false,reverbDecay:1.8,reverbPredelay:30,reverbMix:.2,lofiOn:false,lofiBits:8,lofiMuffle:3400,lofiWobble:.3,lofiAmount:.5};}

export function mountStemLabPanel(opts={}){
  if(window.__stemLabMounted)return;window.__stemLabMounted=true;
  const style=document.createElement('style');
  style.textContent=`.sl-toggle{position:fixed;right:18px;bottom:110px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.sl-panel{position:fixed;left:18px;bottom:18px;width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100003;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.sl-head{display:flex;justify-content:space-between}.sl-tabs,.sl-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.sl-tabs{margin:10px 0}.sl-tabs button,.sl-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:8px 10px}.sl-tabs button.active,.sl-btn.main{background:#9d6cff;color:#fff}.sl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sl-card{background:#ffffff0d;border:1px solid #ffffff16;border-radius:10px;padding:10px}.sl-card h4{margin:0 0 8px}.sl-field{margin:7px 0}.sl-field label{display:flex;justify-content:space-between;font-size:11px;opacity:.8}.sl-field input[type=range]{width:100%}.sl-presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}.sl-presets button{font-size:11px}.sl-log{margin-top:10px;max-height:110px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.sl-status{font-size:11px;opacity:.75;margin-top:6px}.sl-btn:disabled{opacity:.4}.sl-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:760px){.sl-grid{grid-template-columns:1fr}.sl-panel{left:12px;right:12px;width:auto}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='sl-toggle';toggle.textContent='Stem Lab';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='sl-panel';
  root.innerHTML=`<div class="sl-head"><div><b>Stem Lab</b><div class="sl-status">v2.4 • Demucs • Cleanup • FX • Preview • Remix</div></div><button class="sl-close">×</button></div>
  <div class="sl-row"><button class="sl-btn" id="sl-check">Check Engine</button><button class="sl-btn" id="sl-setup">Install/Update Demucs</button><button class="sl-btn main" id="sl-sep">Separate Stems</button><span id="sl-engine" class="sl-status">checking…</span></div>
  <div class="sl-tabs" id="sl-tabs"></div>
  <div class="sl-presets"><button class="sl-btn" data-preset="clean">Clean & Dry</button><button class="sl-btn" data-preset="vocal">Vocal Space</button><button class="sl-btn" data-preset="slap">Slapback</button><button class="sl-btn" data-preset="cavern">Cavern Echo</button><button class="sl-btn" data-preset="lofi">Lo-Fi Tape</button></div>
  <div class="sl-grid">
    <div class="sl-card"><h4>Remove Effects</h4><div class="sl-field"><label>De-Reverb <span id="sl-v-dereverb">0%</span></label><input id="sl-dereverb" type="range" min="0" max="100" value="0"></div><div class="sl-field"><label>De-Echo <span id="sl-v-deecho">0%</span></label><input id="sl-deecho" type="range" min="0" max="100" value="0"></div><div class="sl-field"><label>De-Noise <span id="sl-v-denoise">0%</span></label><input id="sl-denoise" type="range" min="0" max="100" value="0"></div><div class="sl-row"><button class="sl-btn" id="sl-clean-vocal">De-Reverb Vocals</button><button class="sl-btn" id="sl-clean-light">Light Cleanup</button><button class="sl-btn" id="sl-clean-rescue">Full Rescue</button></div></div>
    <div class="sl-card"><h4>Add Effects</h4><div class="sl-row"><label><input id="sl-delay-on" type="checkbox"> Delay</label><label><input id="sl-echo-on" type="checkbox"> Echo</label><label><input id="sl-reverb-on" type="checkbox"> Reverb</label><label><input id="sl-lofi-on" type="checkbox"> Lo-Fi</label></div>
    <div class="sl-field"><label>Delay Time <span id="sl-v-delayTime">180 ms</span></label><input id="sl-delayTime" type="range" min="50" max="700" value="180"></div>
    <div class="sl-field"><label>Reverb Decay <span id="sl-v-reverbDecay">1.8 s</span></label><input id="sl-reverbDecay" type="range" min="4" max="50" value="18"></div>
    <div class="sl-field"><label>FX Mix <span id="sl-v-fxmix">20%</span></label><input id="sl-fxmix" type="range" min="0" max="100" value="20"></div></div>
  </div>
  <div class="sl-row" style="margin-top:10px"><button class="sl-btn" id="sl-preview">Preview Stem</button><button class="sl-btn" id="sl-export">Export Stem WAV</button><button class="sl-btn main" id="sl-remix">Remix All</button><button class="sl-btn" id="sl-use">Use Remix as Current Source</button></div>
  <div class="sl-status" id="sl-status">IDLE</div><div class="sl-log" id="sl-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s),names=['vocals','drums','bass','other'];
  const settings=Object.fromEntries(names.map(n=>[n,defaultSettings()]));let active='vocals',stems={},processedRemix=null,audio=null;
  const log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#sl-log').appendChild(d);$('#sl-log').scrollTop=$('#sl-log').scrollHeight;};
  const status=t=>{$('#sl-status').textContent=t;log(t);};
  const tabs=$('#sl-tabs');for(const n of names){const b=document.createElement('button');b.textContent=n[0].toUpperCase()+n.slice(1);b.onclick=()=>{active=n;renderSettings();[...tabs.children].forEach(x=>x.classList.toggle('active',x===b));};tabs.appendChild(b);}tabs.firstChild.classList.add('active');
  function renderSettings(){const s=settings[active];$('#sl-dereverb').value=s.dereverb*100;$('#sl-deecho').value=s.deecho*100;$('#sl-denoise').value=s.denoise*100;$('#sl-delay-on').checked=s.delayOn;$('#sl-echo-on').checked=s.echoOn;$('#sl-reverb-on').checked=s.reverbOn;$('#sl-lofi-on').checked=s.lofiOn;$('#sl-delayTime').value=s.delayTime;$('#sl-reverbDecay').value=s.reverbDecay*10;$('#sl-fxmix').value=Math.round(Math.max(s.delayMix,s.echoMix,s.reverbMix,s.lofiAmount)*100);updateLabels();}
  function updateLabels(){$('#sl-v-dereverb').textContent=$('#sl-dereverb').value+'%';$('#sl-v-deecho').textContent=$('#sl-deecho').value+'%';$('#sl-v-denoise').textContent=$('#sl-denoise').value+'%';$('#sl-v-delayTime').textContent=$('#sl-delayTime').value+' ms';$('#sl-v-reverbDecay').textContent=(Number($('#sl-reverbDecay').value)/10).toFixed(1)+' s';$('#sl-v-fxmix').textContent=$('#sl-fxmix').value+'%';}
  function sync(){const s=settings[active],mix=Number($('#sl-fxmix').value)/100;s.dereverb=Number($('#sl-dereverb').value)/100;s.deecho=Number($('#sl-deecho').value)/100;s.denoise=Number($('#sl-denoise').value)/100;s.delayOn=$('#sl-delay-on').checked;s.echoOn=$('#sl-echo-on').checked;s.reverbOn=$('#sl-reverb-on').checked;s.lofiOn=$('#sl-lofi-on').checked;s.delayTime=Number($('#sl-delayTime').value);s.reverbDecay=Number($('#sl-reverbDecay').value)/10;s.delayMix=s.echoMix=s.reverbMix=mix;s.lofiAmount=mix;updateLabels();}
  ['#sl-dereverb','#sl-deecho','#sl-denoise','#sl-delay-on','#sl-echo-on','#sl-reverb-on','#sl-lofi-on','#sl-delayTime','#sl-reverbDecay','#sl-fxmix'].forEach(id=>$(id).addEventListener('input',sync));
  function preset(p){const s=settings[active];Object.assign(s,defaultSettings());if(p==='vocal'){s.delayOn=true;s.delayTime=180;s.delayMix=.18;s.reverbOn=true;s.reverbDecay=1.8;s.reverbMix=.3;}if(p==='slap'){s.delayOn=true;s.delayTime=90;s.delayFeedback=.08;s.delayMix=.5;s.reverbOn=true;s.reverbDecay=.8;s.reverbMix=.15;}if(p==='cavern'){s.echoOn=true;s.echoTime=460;s.echoRepeats=.62;s.echoDamping=2200;s.echoMix=.55;s.reverbOn=true;s.reverbDecay=4.5;s.reverbPredelay=40;s.reverbMix=.4;}if(p==='lofi'){s.reverbOn=true;s.reverbDecay=.6;s.reverbMix=.12;s.lofiOn=true;s.lofiBits=7;s.lofiMuffle=3000;s.lofiWobble=.45;s.lofiAmount=1;}renderSettings();status('Preset '+p+' applied to '+active);}
  root.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
  $('#sl-clean-vocal').onclick=()=>{Object.assign(settings[active],{dereverb:.7,deecho:.15,denoise:.15});renderSettings();};
  $('#sl-clean-light').onclick=()=>{Object.assign(settings[active],{dereverb:.25,deecho:.15,denoise:.2});renderSettings();};
  $('#sl-clean-rescue').onclick=()=>{Object.assign(settings[active],{dereverb:.8,deecho:.65,denoise:.55});renderSettings();};
  async function engine(){const s=await getStemEngineStatus();$('#sl-engine').textContent=s.available?'ready':'not installed';return s;}
  $('#sl-check').onclick=engine;
  $('#sl-setup').onclick=async()=>{try{status('RUNNING: Installing/updating Demucs');const r=await setupStemEngine();if(!r?.success)throw new Error(r?.error||'setup failed');status('DONE: Demucs ready');await engine();}catch(e){status('ERROR: '+e.message);}};
  async function decodePath(path){const bytes=await window.electronAPI.readFileData(path),ctx=new AudioContext();try{return await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}finally{await ctx.close();}}
  $('#sl-sep').onclick=async()=>{try{const path=await opts.getOriginalPath?.();if(!path)throw new Error('Load a track first');status('RUNNING: Demucs separating vocals/drums/bass/other');const out=await window.electronAPI?.separateStems?.(path);if(!out?.success)throw new Error(out?.error||'separation failed');for(const n of names){if(out.stems?.[n]){status('RUNNING: decoding '+n);stems[n]=await decodePath(out.stems[n]);}}status('DONE: 4 stems ready');}catch(e){status('ERROR: '+e.message);}};
  $('#sl-preview').onclick=async()=>{try{if(!stems[active])throw new Error('Separate stems first');if(audio)try{audio.stop()}catch{};const b=processStemBuffer(stems[active],settings[active]),ctx=new AudioContext(),src=ctx.createBufferSource();src.buffer=b;src.connect(ctx.destination);src.start();audio=src;status('PLAYING: '+active+' preview');src.onended=()=>ctx.close();}catch(e){status('ERROR: '+e.message);}};
  $('#sl-export').onclick=()=>{try{if(!stems[active])throw new Error('Separate stems first');downloadBuffer(processStemBuffer(stems[active],settings[active]),active+'_processed.wav');status('DONE: exported '+active+'_processed.wav');}catch(e){status('ERROR: '+e.message);}};
  $('#sl-remix').onclick=()=>{try{if(!Object.keys(stems).length)throw new Error('Separate stems first');processedRemix=mixBuffers(stems,settings);status('DONE: processed stem remix ready');}catch(e){status('ERROR: '+e.message);}};
  $('#sl-use').onclick=async()=>{try{if(!processedRemix)throw new Error('Remix All first');await opts.commitSource?.(processedRemix);status('DONE: Stem Lab remix set as current source');}catch(e){status('ERROR: '+e.message);}};
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';engine();};$('.sl-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};renderSettings();engine();
}
