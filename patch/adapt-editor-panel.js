import { applyHumanizeBoost } from './humanize-boost.js';
import { applyVirtualPerformance } from './virtual-performance.js';
import { analyzeAudioBuffer } from './human-detector-core.js';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function cloneBuffer(buf){
  const o=new AudioBuffer({numberOfChannels:buf.numberOfChannels,length:buf.length,sampleRate:buf.sampleRate});
  for(let c=0;c<buf.numberOfChannels;c++)o.copyToChannel(new Float32Array(buf.getChannelData(c)),c);
  return o;
}
function makeLike(ref){return new AudioBuffer({numberOfChannels:ref.numberOfChannels,length:ref.length,sampleRate:ref.sampleRate});}
function mixInto(dst,src,g=1){
  for(let c=0;c<dst.numberOfChannels;c++){
    const d=dst.getChannelData(c),s=src.getChannelData(Math.min(c,src.numberOfChannels-1)),n=Math.min(d.length,s.length);
    for(let i=0;i<n;i++)d[i]+=s[i]*g;
  }
}
function normalize(buf,ceiling=.985){
  let p=0;
  for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));}
  if(p>ceiling){const g=ceiling/p;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=g;}}
  return buf;
}
function score(buf){const r=analyzeAudioBuffer(buf);return Number(r?.humanScore??r?.humanPct??0);}
function parseClock(v){
  const a=String(v||'0').split(':').map(Number);if(a.some(x=>!Number.isFinite(x)))return 0;
  if(a.length===3)return a[0]*3600+a[1]*60+a[2];
  return (a[0]||0)*60+(a[1]||0);
}
function formatTime(s){
  s=Math.max(0,Math.round(s));const m=Math.floor(s/60),x=s%60;return m+':'+String(x).padStart(2,'0');
}
function styleCfg(style){
  return ({
    natural:{human:'medium',strength:'light',mix:20,room:true},
    upbeat:{human:'strong',strength:'strong',mix:34,room:false},
    warm:{human:'strong',strength:'medium',mix:25,room:true},
    cinematic:{human:'extreme',strength:'strong',mix:38,room:true}
  })[style]||{human:'medium',strength:'medium',mix:24,room:true};
}
function processLayer(buf,type,cfg,amount){
  if(!buf)return null;
  let out=buf;
  const mix=clamp(cfg.mix*amount/100,5,48);
  const drums=type==='drums',bass=type==='bass'||type==='other';
  out=applyVirtualPerformance(out,{strength:cfg.strength,mix,humanGroove:true,drums,bass,room:cfg.room});
  out=applyHumanizeBoost(out,cfg.human,{cleanup:true});
  return out;
}
function buildAdaptedMix(stems,enabled,style,amount,replacements={}){
  const ref=stems.vocals||stems.other||stems.bass||stems.drums;if(!ref)return null;
  const cfg=styleCfg(style),out=makeLike(ref);
  if(stems.vocals)mixInto(out,stems.vocals);
  if(stems.other)mixInto(out,enabled.other?processLayer(stems.other,'other',cfg,amount):stems.other);
  if(stems.bass){const b=replacements.bass||stems.bass;mixInto(out,enabled.bass?processLayer(b,'bass',cfg,amount):b);}
  if(stems.drums){const d=replacements.drums||stems.drums;mixInto(out,enabled.drums?processLayer(d,'drums',cfg,amount):d);}
  return normalize(out);
}
function spliceRegion(base,replacement,start,end,fadeSec=.035){
  const out=cloneBuffer(base),sr=out.sampleRate;
  const a=clamp(Math.floor(start*sr),0,out.length),b=clamp(Math.floor(end*sr),a,out.length),fade=Math.max(1,Math.floor(fadeSec*sr));
  for(let c=0;c<out.numberOfChannels;c++){
    const d=out.getChannelData(c),r=replacement.getChannelData(Math.min(c,replacement.numberOfChannels-1)),n=Math.min(b,r.length);
    for(let i=a;i<n;i++){
      let w=1;if(i<a+fade)w=(i-a)/fade;if(i>b-fade)w=Math.min(w,(b-i)/fade);w=clamp(w,0,1);
      d[i]=d[i]*(1-w)+r[i]*w;
    }
  }
  return normalize(out);
}
function drawLane(ctx,buf,x,y,w,h){
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
  ctx.globalAlpha=.72;ctx.strokeStyle='#b6a2ff';ctx.lineWidth=1;
  ctx.beginPath();const mid=y+h/2,step=Math.max(1,Math.floor((buf?.length||1)/w));
  for(let px=0;px<w;px++){
    let p=0;
    if(buf){const d=buf.getChannelData(0),s=px*step,e=Math.min(d.length,s+step);for(let i=s;i<e;i++)p=Math.max(p,Math.abs(d[i]));}
    const amp=p*h*.45;if(px===0)ctx.moveTo(x+px,mid-amp);else ctx.lineTo(x+px,mid-amp);
  }
  for(let px=w-1;px>=0;px--){
    let p=0;
    if(buf){const d=buf.getChannelData(0),s=px*step,e=Math.min(d.length,s+step);for(let i=s;i<e;i++)p=Math.max(p,Math.abs(d[i]));}
    const amp=p*h*.45;ctx.lineTo(x+px,mid+amp);
  }
  ctx.closePath();ctx.stroke();ctx.restore();
}

export function mountAdaptEditor(opts={}){
  if(window.__adaptEditorMounted)return;window.__adaptEditorMounted=true;
  const player=document.querySelector('.audio-player');if(!player)return;
  const style=document.createElement('style');
  style.textContent=`.adapt-editor{margin-top:12px;border:1px solid #3a3a44;background:#111116;border-radius:10px;overflow:hidden;color:#eee;font-family:system-ui}.ae-head,.ae-toolbar,.ae-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ae-head{padding:10px 12px;border-bottom:1px solid #30303a}.ae-head b{font-size:13px}.ae-sub{font-size:11px;opacity:.6}.ae-toolbar{padding:9px 12px;border-bottom:1px solid #25252d}.ae-toolbar select,.ae-toolbar input[type=number]{background:#202027;color:#eee;border:1px solid #3d3d49;border-radius:6px;padding:5px 7px}.ae-timeline{position:relative;padding:8px 12px 10px}.ae-scale{display:flex;justify-content:space-between;font-size:10px;opacity:.55;margin-left:122px}.ae-row{display:grid;grid-template-columns:116px 1fr;align-items:center;gap:6px;margin-top:5px}.ae-label{display:flex;align-items:center;gap:5px;font-size:11px;white-space:nowrap}.ae-label input{margin:0}.ae-canvas-wrap{position:relative;height:42px;border:1px solid #30303a;border-radius:5px;background:#0b0b0e;overflow:hidden}.ae-canvas{width:100%;height:100%;display:block}.ae-select{position:absolute;top:0;bottom:0;background:#9d6cff2b;border-left:1px solid #aa93ff;border-right:1px solid #aa93ff;pointer-events:none}.ae-playhead{position:absolute;top:0;bottom:0;width:1px;background:#f0eaff;opacity:.7;pointer-events:none}.ae-actions{padding:10px 12px;border-top:1px solid #25252d}.ae-btn{background:#24242c;color:#eee;border:1px solid #444451;border-radius:7px;padding:7px 10px}.ae-btn.main{background:#9d6cff;color:#fff;border-color:#9d6cff}.ae-btn:disabled{opacity:.4}.ae-range{font-size:11px;opacity:.72;margin-left:auto}.ae-status{font-size:11px;padding:0 12px 10px;opacity:.75}.ae-score{font-weight:700;color:#cabdff}.ae-meta-panel{display:none;padding:10px 12px;border-top:1px solid #25252d;background:#0d0d12}.ae-meta-panel.open{display:block}.ae-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ae-meta-grid label{font-size:10px;opacity:.8}.ae-meta-grid input,.ae-meta-grid textarea{width:100%;box-sizing:border-box;margin-top:3px;background:#1c1c23;color:#eee;border:1px solid #3a3a46;border-radius:6px;padding:6px}.ae-meta-grid textarea{min-height:58px;resize:vertical}.ae-meta-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.ae-meta-note{font-size:10px;opacity:.6;margin-top:7px}@media(max-width:800px){.ae-row{grid-template-columns:92px 1fr}.ae-scale{margin-left:98px}.ae-range{width:100%;margin-left:0}}`;
  document.head.appendChild(style);

  const root=document.createElement('section');root.className='adapt-editor';
  root.innerHTML=`<div class="ae-head"><div><b>Adapt Editor</b><div class="ae-sub">v3.6 • Adapt Editor + Metadata + Fingerprint Inspector</div></div></div>
  <div class="ae-toolbar">
    <button class="ae-btn" id="ae-stems">Prepare Stems</button>
    <label>Style <select id="ae-style"><option value="natural">Natural / Live</option><option value="upbeat">Upbeat / Energetic</option><option value="warm">Warm / Organic</option><option value="cinematic">Epic / Cinematic</option></select></label>
    <label>Strength <input id="ae-strength" type="range" min="25" max="100" value="70"></label>
    <span id="ae-strength-v">70%</span>
    <label><input id="ae-rebuild-bass" type="checkbox"> Rebuild Bass Notes</label>
    <label><input id="ae-rebuild-drums" type="checkbox"> Rebuild Drums</label>
  </div>
  <div class="ae-timeline">
    <div class="ae-scale"><span>0:00</span><span id="ae-mid">—</span><span id="ae-end">—</span></div>
    <div id="ae-rows"></div>
  </div>
  <div class="ae-actions">
    <button class="ae-btn" id="ae-preview-a">Preview Original</button>
    <button class="ae-btn" id="ae-preview-b">Preview Adapted</button>
    <button class="ae-btn" id="ae-stop">Stop Preview</button>
    <button class="ae-btn main" id="ae-apply">Apply Selected Range</button>
    <button class="ae-btn" id="ae-reset">Reset Range</button><button class="ae-btn" id="ae-meta-toggle">Edit Metadata</button><button class="ae-btn" id="ae-fp-toggle">Fingerprint Inspector</button>
    <span class="ae-range" id="ae-range">Select a region on the timeline</span>
  </div>
  <div class="ae-meta-panel" id="ae-meta-panel">
    <div class="ae-meta-grid">
      <label>Title<input id="ae-meta-title" type="text"></label>
      <label>Artist<input id="ae-meta-artist" type="text"></label>
      <label>Album<input id="ae-meta-album" type="text"></label>
      <label>Year<input id="ae-meta-year" type="text"></label>
      <label>Genre<input id="ae-meta-genre" type="text"></label>
      <label>Track<input id="ae-meta-track" type="text"></label>
      <label>Composer<input id="ae-meta-composer" type="text"></label>
      <label>Copyright<input id="ae-meta-copyright" type="text"></label>
      <label style="grid-column:span 3">Comment<textarea id="ae-meta-comment"></textarea></label>
    </div>
    <div class="ae-meta-actions">
      <button class="ae-btn" id="ae-meta-read">Read Source Metadata</button>
      <button class="ae-btn main" id="ae-meta-save-copy">Save Metadata Copy</button>
      <label style="font-size:11px"><input id="ae-meta-overwrite-ok" type="checkbox"> Allow overwrite source</label>
      <button class="ae-btn" id="ae-meta-save-source">Write to Source</button>
    </div>
    <div class="ae-meta-note" id="ae-meta-note">MP3/WAV supported in v3.4. Save as Copy is recommended.</div>
  </div>
  <div class="ae-meta-panel" id="ae-fp-panel">
    <div class="ae-meta-actions">
      <button class="ae-btn main" id="ae-fp-run">Inspect Source Fingerprint</button>
      <button class="ae-btn" id="ae-fp-current">Analyze Current Audio</button>
    </div>
    <div class="ae-meta-note" id="ae-fp-note">Read-only inspector. It does not modify or remove provenance/fingerprint data.</div>
    <div class="ae-meta-grid" style="margin-top:8px">
      <label>File SHA-256<input id="ae-fp-sha" type="text" readonly></label>
      <label>Container / Size<input id="ae-fp-file" type="text" readonly></label>
      <label>Provenance<input id="ae-fp-prov" type="text" readonly></label>
      <label>Internal D1<input id="ae-fp-d1" type="text" readonly></label>
      <label style="grid-column:span 2">Spectral Fingerprint<input id="ae-fp-spec" type="text" readonly></label>
    </div>
  </div>
  <div class="ae-status" id="ae-status">Load a track, prepare stems, then drag on any lane to select the section to adapt.</div>`;
  player.appendChild(root);

  const $=s=>root.querySelector(s),rows=$('#ae-rows');
  const laneDefs=[
    {key:'vocals',label:'Vocals',adapt:false,locked:true},
    {key:'other',label:'Melody / Instruments',adapt:true},
    {key:'bass',label:'Bass',adapt:true},
    {key:'drums',label:'Drums',adapt:true}
  ];
  const laneEls={};let selStart=0,selEnd=0,duration=0,dragging=false,previewCtx=null,previewSrc=null,lastAdapted=null,lastOutput=null;
  for(const lane of laneDefs){
    const row=document.createElement('div');row.className='ae-row';
    row.innerHTML=`<div class="ae-label"><input type="checkbox" data-adapt="${lane.key}" ${lane.adapt?'checked':''} ${lane.locked?'disabled':''}><span>${lane.label}</span></div><div class="ae-canvas-wrap"><canvas class="ae-canvas" data-lane="${lane.key}"></canvas><div class="ae-select"></div><div class="ae-playhead"></div></div>`;
    rows.appendChild(row);laneEls[lane.key]=row;
  }
  function getStems(){return window.__stemLabStemBuffers||{};}
  async function getSource(){return await opts.getSource?.()||null;}
  function enabled(){return {other:!!root.querySelector('[data-adapt="other"]').checked,bass:!!root.querySelector('[data-adapt="bass"]').checked,drums:!!root.querySelector('[data-adapt="drums"]').checked};}
  function updateRange(){
    $('#ae-range').textContent=(selEnd>selStart)?`${formatTime(selStart)} → ${formatTime(selEnd)} • ${(selEnd-selStart).toFixed(1)}s`:'Select a region on the timeline';
    for(const row of Object.values(laneEls)){
      const el=row.querySelector('.ae-select'),a=duration?selStart/duration*100:0,b=duration?selEnd/duration*100:0;
      el.style.left=a+'%';el.style.width=Math.max(0,b-a)+'%';
    }
  }
  function resizeDraw(){
    const stems=getStems();const source=window.__adaptEditorSource;
    const ref=source||stems.vocals||stems.other||stems.bass||stems.drums;if(ref)duration=ref.duration;
    $('#ae-mid').textContent=duration?formatTime(duration/2):'—';$('#ae-end').textContent=duration?formatTime(duration):'—';
    for(const lane of laneDefs){
      const cv=laneEls[lane.key].querySelector('canvas'),box=cv.parentElement.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
      cv.width=Math.max(1,Math.floor(box.width*dpr));cv.height=Math.max(1,Math.floor(box.height*dpr));
      const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,box.width,box.height);
      ctx.fillStyle='#0b0b0e';ctx.fillRect(0,0,box.width,box.height);
      drawLane(ctx,stems[lane.key]||source,0,0,box.width,box.height);
    }
    updateRange();
  }
  async function refreshSource(){window.__adaptEditorSource=await getSource();resizeDraw();}
  function posFromEvent(e,wrap){const r=wrap.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width,0,1)*duration;}
  for(const row of Object.values(laneEls)){
    const wrap=row.querySelector('.ae-canvas-wrap');
    wrap.addEventListener('mousedown',e=>{if(!duration)return;dragging=true;selStart=posFromEvent(e,wrap);selEnd=selStart;updateRange();});
    wrap.addEventListener('mousemove',e=>{if(!dragging)return;const p=posFromEvent(e,wrap);selEnd=Math.max(selStart,p);if(p<selStart){selEnd=selStart;selStart=p;}updateRange();});
  }
  window.addEventListener('mouseup',()=>{dragging=false;});
  function metadataForm(){
    return {
      title:$('#ae-meta-title').value.trim(),artist:$('#ae-meta-artist').value.trim(),album:$('#ae-meta-album').value.trim(),
      year:$('#ae-meta-year').value.trim(),genre:$('#ae-meta-genre').value.trim(),track:$('#ae-meta-track').value.trim(),
      composer:$('#ae-meta-composer').value.trim(),copyright:$('#ae-meta-copyright').value.trim(),comment:$('#ae-meta-comment').value.trim()
    };
  }
  function fillMetadata(m={}){
    $('#ae-meta-title').value=m.title||'';$('#ae-meta-artist').value=m.artist||'';$('#ae-meta-album').value=m.album||'';
    $('#ae-meta-year').value=m.year||'';$('#ae-meta-genre').value=m.genre||'';$('#ae-meta-track').value=m.track||'';
    $('#ae-meta-composer').value=m.composer||'';$('#ae-meta-copyright').value=m.copyright||'';$('#ae-meta-comment').value=m.comment||'';
  }
  async function sourcePath(){return await opts.getOriginalPath?.()||null;}
  function spectralFingerprint(buf){
    if(!buf)return '';
    const bins=24,acc=new Float64Array(bins),counts=new Uint32Array(bins),sr=buf.sampleRate;
    const step=Math.max(1,Math.floor(buf.length/(sr*30)));
    for(let i=0;i<buf.length;i+=step){
      let x=0;for(let c=0;c<buf.numberOfChannels;c++)x+=buf.getChannelData(c)[i]/buf.numberOfChannels;
      const a=Math.abs(x),slot=Math.min(bins-1,Math.floor((i/Math.max(1,buf.length))*bins));
      acc[slot]+=a;counts[slot]++;
    }
    const vals=[...acc].map((v,i)=>Math.round((v/Math.max(1,counts[i]))*1e6));
    let h=2166136261>>>0;
    for(const v of vals){h^=v;h=Math.imul(h,16777619)>>>0;}
    return 'SP-'+h.toString(16).padStart(8,'0')+'-'+vals.slice(0,8).map(v=>v.toString(16)).join('');
  }
  $('#ae-meta-toggle').onclick=()=>{$('#ae-meta-panel').classList.toggle('open');};
  $('#ae-fp-toggle').onclick=()=>{$('#ae-fp-panel').classList.toggle('open');};
  $('#ae-fp-run').onclick=async()=>{try{
    const p=await sourcePath();if(!p)throw new Error('Load a source file first');
    const r=await window.electronAPI?.fingerprintInspect?.(p);if(!r?.success)throw new Error(r?.error||'Fingerprint inspection failed');
    $('#ae-fp-sha').value=r.sha256||'';$('#ae-fp-file').value=(r.ext||'')+' • '+(r.size||0)+' bytes';
    $('#ae-fp-prov').value=r.provenance?.strong_source||((r.provenance?.matches||[]).length?'evidence found':'none');
    $('#ae-fp-note').textContent='Container fingerprint read successfully. Provenance is preserved and read-only.';
  }catch(e){$('#ae-fp-note').textContent='ERROR: '+e.message;}};
  $('#ae-fp-current').onclick=async()=>{try{
    const b=await getSource();if(!b)throw new Error('No current audio buffer');
    $('#ae-fp-d1').value=score(b).toFixed(1)+'% human-like';
    $('#ae-fp-spec').value=spectralFingerprint(b);
    $('#ae-fp-note').textContent='Current audio fingerprint analyzed. Use this to compare before/after substantive edits.';
  }catch(e){$('#ae-fp-note').textContent='ERROR: '+e.message;}};

  $('#ae-meta-read').onclick=async()=>{try{
    const p=await sourcePath();if(!p)throw new Error('Load a source file first');
    const r=await window.electronAPI?.audioMetadataRead?.(p);if(!r?.success)throw new Error(r?.error||'Could not read metadata');
    fillMetadata(r.metadata||{});$('#ae-meta-note').textContent='Loaded metadata from '+(r.path||p);
  }catch(e){$('#ae-meta-note').textContent='ERROR: '+e.message;}};
  $('#ae-meta-save-copy').onclick=async()=>{try{
    const p=await sourcePath();if(!p)throw new Error('Load a source file first');
    const r=await window.electronAPI?.audioMetadataWrite?.(p,metadataForm(),false);if(!r?.success)throw new Error(r?.error||'Could not write metadata');
    $('#ae-meta-note').textContent='Saved metadata copy: '+r.path;
  }catch(e){$('#ae-meta-note').textContent='ERROR: '+e.message;}};
  $('#ae-meta-save-source').onclick=async()=>{try{
    if(!$('#ae-meta-overwrite-ok').checked)throw new Error('Enable Allow overwrite source first');
    const p=await sourcePath();if(!p)throw new Error('Load a source file first');
    const r=await window.electronAPI?.audioMetadataWrite?.(p,metadataForm(),true);if(!r?.success)throw new Error(r?.error||'Could not write metadata');
    $('#ae-meta-note').textContent='Source metadata updated: '+r.path;
  }catch(e){$('#ae-meta-note').textContent='ERROR: '+e.message;}};

  $('#ae-strength').oninput=()=>{$('#ae-strength-v').textContent=$('#ae-strength').value+'%';};
  $('#ae-reset').onclick=()=>{selStart=0;selEnd=duration;updateRange();};
  $('#ae-stems').onclick=async()=>{try{$('#ae-status').textContent='Preparing stems…';let api=window.__stemLabAPI;if(!api)throw new Error('Stem Lab is not ready');const s=getStems();if(!s.vocals||!s.other||!s.bass||!s.drums)await api.separate();await refreshSource();selStart=0;selEnd=duration;updateRange();$('#ae-status').textContent='4 stems ready • drag timeline to choose a section.';}catch(e){$('#ae-status').textContent='ERROR: '+e.message;}};
  async function build(){
    const stems=getStems();if(!stems.vocals||!stems.other||!stems.bass||!stems.drums)throw new Error('Prepare Stems first');
    const amount=Number($('#ae-strength').value),style=$('#ae-style').value,replacements={};
    const rp=window.__reperformanceAPI;
    if($('#ae-rebuild-bass').checked){
      if(!rp)throw new Error('Re-Performance engine is not ready');
      $('#ae-status').textContent='Rebuilding bass notes…';await rp.buildBass();replacements.bass=rp.getBassOutput?.()||null;
    }
    if($('#ae-rebuild-drums').checked){
      if(!rp)throw new Error('Re-Performance engine is not ready');
      $('#ae-status').textContent='Rebuilding drum performance…';await rp.buildDrums();replacements.drums=rp.getDrumOutput?.()||null;
    }
    lastAdapted=buildAdaptedMix(stems,enabled(),style,amount,replacements);if(!lastAdapted)throw new Error('Could not build adapted mix');
    return lastAdapted;
  }
  function stopPreview(){try{previewSrc?.stop()}catch(_){}try{previewCtx?.close()}catch(_){}previewSrc=null;previewCtx=null;}
  async function preview(buf){
    stopPreview();if(!buf)throw new Error('No audio to preview');if(!(selEnd>selStart)){selStart=0;selEnd=Math.min(duration,20);updateRange();}
    previewCtx=new AudioContext();previewSrc=previewCtx.createBufferSource();previewSrc.buffer=buf;previewSrc.connect(previewCtx.destination);
    previewSrc.start(0,selStart,Math.max(.05,selEnd-selStart));previewSrc.onended=()=>{try{previewCtx?.close()}catch(_){}previewCtx=null;previewSrc=null;};
  }
  $('#ae-preview-a').onclick=async()=>{try{const src=await getSource();await preview(src);$('#ae-status').textContent='Previewing original selected range.';}catch(e){$('#ae-status').textContent='ERROR: '+e.message;}};
  $('#ae-preview-b').onclick=async()=>{try{const b=await build();await preview(b);$('#ae-status').textContent='Previewing adapted selected range • '+score(b).toFixed(1)+'% full-mix score.';}catch(e){$('#ae-status').textContent='ERROR: '+e.message;}};
  $('#ae-stop').onclick=()=>{stopPreview();$('#ae-status').textContent='Preview stopped.';};
  $('#ae-apply').onclick=async()=>{const btn=$('#ae-apply');btn.disabled=true;try{
    let src=await getSource();if(!src)throw new Error('Load a track first');if(!(selEnd>selStart)){selStart=0;selEnd=duration||src.duration;}
    const adapted=await build(),before=score(src);lastOutput=spliceRegion(src,adapted,selStart,selEnd);
    await opts.commitSource?.(lastOutput);window.__adaptEditorSource=lastOutput;const after=score(lastOutput);
    $('#ae-status').innerHTML=`Applied <b>${formatTime(selStart)}–${formatTime(selEnd)}</b> • <span class="ae-score">D1 ${before.toFixed(1)}% → ${after.toFixed(1)}%</span> • current source updated.`;
    resizeDraw();
  }catch(e){$('#ae-status').textContent='ERROR: '+e.message;}finally{btn.disabled=false;}};

  const cur=document.getElementById('currentTime');
  if(cur){new MutationObserver(()=>{const t=parseClock(cur.textContent);for(const row of Object.values(laneEls)){row.querySelector('.ae-playhead').style.left=(duration?clamp(t/duration*100,0,100):0)+'%';}}).observe(cur,{childList:true,subtree:true,characterData:true});}
  window.addEventListener('resize',()=>setTimeout(resizeDraw,80));
  window.__adaptEditorAPI={refresh:refreshSource,build,getOutput:()=>lastOutput,getSelection:()=>({start:selStart,end:selEnd})};
  setTimeout(refreshSource,250);
}
