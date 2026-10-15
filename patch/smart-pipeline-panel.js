import { analyzeAudioBuffer } from './human-detector-core.js';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function humanScore(buf){
  if(!buf)return null;
  const r=analyzeAudioBuffer(buf);
  return Number(r?.humanScore??r?.humanPct??0);
}

export function mountSmartPipeline(opts={}){
  if(window.__smartPipelineMounted)return;window.__smartPipelineMounted=true;
  const style=document.createElement('style');
  style.textContent=`.sp-toggle{position:fixed;right:18px;bottom:248px;z-index:99997;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.sp-panel{position:fixed;left:18px;bottom:18px;width:min(760px,calc(100vw - 36px));max-height:calc(100vh - 80px);overflow:auto;z-index:100006;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(18,18,24,.98);color:#f3f3f3;box-shadow:0 18px 50px #0009;font-family:system-ui;display:none}.sp-head{display:flex;justify-content:space-between}.sp-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;margin-top:10px}.sp-stage{padding:9px;border-radius:9px;background:#ffffff0d;border:1px solid #ffffff16;font-size:11px}.sp-stage b{display:block;margin-bottom:3px}.sp-stage[data-state=running]{outline:1px solid #a98cff}.sp-stage[data-state=done]{background:#1d3b2a}.sp-stage[data-state=error]{background:#4b2222}.sp-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.sp-btn{border:1px solid #ffffff2a;background:#ffffff10;color:inherit;border-radius:8px;padding:9px 11px}.sp-btn.main{background:#9d6cff;font-weight:700}.sp-btn:disabled{opacity:.45}.sp-progress{margin-top:10px;height:10px;background:#ffffff12;border-radius:999px;overflow:hidden}.sp-fill{height:100%;width:0;background:#a98cff;transition:width .2s}.sp-meta{font-size:11px;opacity:.75;margin-top:7px}.sp-log{margin-top:10px;max-height:130px;overflow:auto;background:#0005;border-radius:8px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.sp-close{background:none;border:0;color:inherit;font-size:18px}@media(max-width:760px){.sp-grid{grid-template-columns:1fr 1fr}.sp-panel{left:12px;right:12px;width:auto}}`;
  document.head.appendChild(style);

  const toggle=document.createElement('button');toggle.className='sp-toggle';toggle.textContent='Smart Pipeline';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='sp-panel';
  root.innerHTML=`<div class="sp-head"><div><b>Smart Pipeline</b><div class="sp-meta">v2.9 • Stem → Auto Select → Re-Performance → Auto Mastering → Commit</div></div><button class="sp-close">×</button></div>
  <div class="sp-grid">
    <div class="sp-stage" id="sp-s1" data-state="idle"><b>1. Stem Engine</b><span>IDLE</span></div>
    <div class="sp-stage" id="sp-s2" data-state="idle"><b>2. Separate</b><span>IDLE</span></div>
    <div class="sp-stage" id="sp-s3" data-state="idle"><b>3. Auto Select</b><span>IDLE</span></div>
    <div class="sp-stage" id="sp-s4" data-state="idle"><b>4. Re-Perform</b><span>IDLE</span></div>
    <div class="sp-stage" id="sp-s5" data-state="idle"><b>5. Mastering</b><span>IDLE</span></div>
    <div class="sp-stage" id="sp-s6" data-state="idle"><b>6. Commit</b><span>IDLE</span></div>
  </div>
  <div class="sp-row"><label><input type="checkbox" id="sp-skip" checked> Reuse existing stems if available</label><label><input type="checkbox" id="sp-commit" checked> Auto use result as current source</label></div>
  <div class="sp-row"><button class="sp-btn" id="sp-check">Check Prerequisites</button><button class="sp-btn main" id="sp-run">SMART PIPELINE</button></div>
  <div class="sp-progress"><div class="sp-fill" id="sp-fill"></div></div>
  <div class="sp-meta" id="sp-summary">IDLE • Load a track first.</div>
  <div class="sp-log" id="sp-log"></div>`;
  document.body.appendChild(root);

  const $=s=>root.querySelector(s);
  const stages=[1,2,3,4,5,6].map(i=>$('#sp-s'+i));
  const log=t=>{const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+t;$('#sp-log').appendChild(d);$('#sp-log').scrollTop=$('#sp-log').scrollHeight;};
  const setStage=(i,state,text)=>{const el=stages[i-1];el.dataset.state=state;el.querySelector('span').textContent=text||state.toUpperCase();};
  const progress=p=>{$('#sp-fill').style.width=clamp(p,0,100)+'%';};
  const reset=()=>{stages.forEach(s=>{s.dataset.state='idle';s.querySelector('span').textContent='IDLE';});progress(0);};
  async function waitApi(name,ms=2500){
    const started=Date.now();
    while(Date.now()-started<ms){
      const api=window[name];if(api)return api;
      await new Promise(r=>setTimeout(r,80));
    }
    return null;
  }
  async function checkPrerequisites(){
    const stem=await window.electronAPI?.stemStatus?.();
    const reperf=await window.electronAPI?.reperfStatus?.();
    setStage(1,stem?.available?'done':'error',stem?.available?'READY':'DEMUX MISSING');
    $('#sp-summary').textContent='Stem '+(stem?.available?'READY':'NOT READY')+' • Re-Performance '+(reperf?.available?'READY':'NOT READY');
    log('Prerequisites: Demucs='+(stem?.available?'ready':'missing')+', Re-Performance='+(reperf?.available?'ready':'missing'));
    return {stem,reperf};
  }
  $('#sp-check').onclick=async()=>{try{await checkPrerequisites();}catch(e){log('ERROR: '+e.message);}};

  $('#sp-run').onclick=async()=>{
    const btn=$('#sp-run');btn.disabled=true;reset();
    const original=await opts.getOriginalBuffer?.();
    try{
      if(!original)throw new Error('Load a track first.');
      const before=humanScore(original);
      log('START Smart Pipeline');
      $('#sp-summary').textContent='RUNNING • preparing engines…';

      setStage(1,'running','CHECKING');progress(5);
      const pre=await checkPrerequisites();
      if(!pre.stem?.available)throw new Error('Demucs is not ready. Open Stem Lab → Install/Update Demucs first.');
      if(!pre.reperf?.available)throw new Error('Re-Performance engine is not ready. Open Re-Performance → Setup Re-Performance first.');
      setStage(1,'done','READY');progress(15);

      let stemApi=await waitApi('__stemLabAPI');
      if(!stemApi)throw new Error('Stem Lab API not available.');
      const existing=window.__stemLabStemBuffers||{};
      const canReuse=$('#sp-skip').checked&&existing.bass&&existing.drums;
      setStage(2,'running',canReuse?'REUSING':'SEPARATING');
      if(canReuse){log('Stage 2: reuse existing separated stems');}
      else{log('Stage 2: Demucs separation started');await stemApi.separate();}
      setStage(2,'done','READY');progress(42);

      const rp=await waitApi('__reperformanceAPI');
      if(!rp)throw new Error('Re-Performance API not available.');
      setStage(3,'running','ANALYZING');log('Stage 3: analyzing profile and selecting instruments');
      const profile=await rp.autoSelect();
      setStage(3,'done',profile?.name||'SELECTED');progress(56);

      setStage(4,'running','BASS');log('Stage 4a: bass re-performance');await rp.buildBass();progress(69);
      setStage(4,'running','DRUMS');log('Stage 4b: drum re-performance');await rp.buildDrums();progress(82);
      setStage(4,'running','REMIX');log('Stage 4c: rebuilding remix');const remix=await rp.buildRemix();
      setStage(4,'done','READY');progress(78);

      const ma=await waitApi('__masteringAPI');
      if(!ma)throw new Error('Mastering API not available.');
      setStage(5,'running','MASTERING');log('Stage 5: auto mastering for '+(profile?.name||'Clean')+' profile');
      const master=await ma.applyAuto(remix,profile?.name||'Clean',false);
      setStage(5,'done',String(master.style||'MASTER').toUpperCase());progress(92);

      setStage(6,'running',$('#sp-commit').checked?'COMMITTING':'SKIPPED');
      if($('#sp-commit').checked){await ma.commit(master.buffer,master.lufs);log('Stage 6: mastered result set as current source');}
      setStage(6,'done',$('#sp-commit').checked?'CURRENT':'READY');progress(100);

      const after=humanScore(master.buffer);
      const delta=(after??0)-(before??0);
      const lufs=Number.isFinite(master.lufs)?' • '+master.lufs.toFixed(1)+' LUFS':'';
      $('#sp-summary').textContent=`DONE • ${profile?.name||'Auto'} → ${master.style} • D1 ${before?.toFixed(1)??'—'}% → ${after?.toFixed(1)??'—'}% (${delta>=0?'+':''}${delta.toFixed(1)})${lufs}`;
      log('DONE Smart Pipeline • '+master.style+' • D1 '+before.toFixed(1)+' → '+after.toFixed(1)+(Number.isFinite(master.lufs)?' • '+master.lufs.toFixed(1)+' LUFS':''));
    }catch(e){
      const active=stages.find(x=>x.dataset.state==='running');if(active){active.dataset.state='error';active.querySelector('span').textContent='ERROR';}
      $('#sp-summary').textContent='ERROR • '+e.message;log('ERROR: '+e.message);
    }finally{btn.disabled=false;}
  };

  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';};
  $('.sp-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
}
