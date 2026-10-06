function humanProbFromExternal(r){
  if(!r) return null;
  const c=Math.max(0,Math.min(1,Number(r.confidence)||0));
  const label=String(r.label||'').toLowerCase();
  if(label==='real'||label==='human'||label==='nonai') return c*100;
  if(label==='fake'||label==='ai') return (1-c)*100;
  return null;
}
function consensus(values){
  const v=values.filter(Number.isFinite);
  if(!v.length) return null;
  const mean=v.reduce((a,b)=>a+b,0)/v.length;
  const spread=v.length>1?Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length):25;
  const confidence=Math.max(0,Math.min(100,100-spread*2))*(v.length/3);
  return {human:mean,ai:100-mean,confidence,count:v.length,spread};
}
export function mountEnsembleDetectorPanel(opts={}){
  const style=document.createElement('style');
  style.textContent=`.ed-toggle{position:fixed;left:18px;bottom:66px;z-index:99995;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.ed-panel{position:fixed;left:18px;bottom:18px;width:min(500px,calc(100vw - 36px));max-height:calc(100vh - 90px);overflow:auto;z-index:100001;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(20,21,25,.98);box-shadow:0 18px 50px #0009;color:#f2f2f2;font-family:system-ui}.ed-head{display:flex;justify-content:space-between;align-items:center}.ed-head small{display:block;opacity:.65}.ed-close{background:none;border:0;color:inherit;font-size:18px}.ed-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:10px}.ed-card{background:#ffffff0f;padding:9px;border-radius:9px}.ed-card small{display:block;opacity:.65}.ed-card b{font-size:17px}.ed-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px}.ed-btn{border:1px solid #ffffff2b;border-radius:8px;padding:8px 10px;background:#ffffff14;color:inherit;cursor:pointer}.ed-btn.main{background:#a8dcff;color:#101318;font-weight:700}.ed-status{font-size:11px;opacity:.78;line-height:1.4;margin-top:9px}.ed-final{margin-top:10px;padding:11px;border-radius:10px;background:#a8dcff18;border:1px solid #a8dcff55}.ed-final strong{font-size:22px}.ok{color:#64d98b}.warn{color:#ffd166}@media(max-width:760px){.ed-panel{left:12px;right:12px;width:auto}.ed-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='ed-toggle';toggle.textContent='3-Detector Ensemble';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='ed-panel';root.style.display='none';
  root.innerHTML=`<div class="ed-head"><div><b>AI Music Detector Ensemble</b><small>v2.1 • Local DSP + MS-CLAP + CLAP Hierarchical</small></div><button class="ed-close">×</button></div>
  <div class="ed-grid">
    <div class="ed-card"><small>Detector 1 • Local DSP/FP</small><b id="ed-d1">—</b><small id="ed-d1m">Analyze Original first</small></div>
    <div class="ed-card"><small>Detector 2 • MS-CLAP</small><b id="ed-d2">—</b><small id="ed-d2m">offline model</small></div>
    <div class="ed-card"><small>Detector 3 • lcros CLAP</small><b id="ed-d3">—</b><small id="ed-d3m">hierarchical vote</small></div>
  </div>
  <div class="ed-final"><small>ENSEMBLE FINAL SCORE</small><strong id="ed-final">—</strong><div id="ed-conf" class="ed-status">Run all available detectors.</div></div>
  <div class="ed-row"><span>Detector 2:</span><b id="ed-s2" class="warn">checking…</b><button class="ed-btn" id="ed-setup2">Setup D2</button></div>
  <div class="ed-row"><span>Detector 3:</span><b id="ed-s3" class="warn">checking…</b><button class="ed-btn" id="ed-setup3">Setup D3 (~2.35 GB model)</button></div>
  <div class="ed-row"><button class="ed-btn main" id="ed-run">RUN 3-DETECTOR CHECK</button></div>
  <div class="ed-status" id="ed-status">Scores are independent estimates. Ensemble is an equal-weight consensus, not proof of authorship.</div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s); let d2=null,d3=null;
  const status=t=>$('#ed-status').textContent=t;
  function refreshLocal(){const r=window.__localHumanDetectLatest;if(r){const h=Number(r.humanScore??r.humanPct);$('#ed-d1').textContent=`${h.toFixed(1)}% Human`;$('#ed-d1m').textContent=`DSP ${r.dspPct}% • FP ${r.fakePct}%`;return h;}$('#ed-d1').textContent='—';return null;}
  function render(){const p1=refreshLocal(),p2=humanProbFromExternal(d2),p3=humanProbFromExternal(d3);if(Number.isFinite(p2)){ $('#ed-d2').textContent=`${p2.toFixed(1)}% Human`;$('#ed-d2m').textContent=`${String(d2.label).toUpperCase()} • conf ${(Number(d2.confidence)*100).toFixed(0)}%`; }if(Number.isFinite(p3)){ $('#ed-d3').textContent=`${p3.toFixed(1)}% Human`;$('#ed-d3m').textContent=`${String(d3.label).toUpperCase()} • votes ${d3.ai_votes??'—'}/${d3.total_votes??'—'}`; }const c=consensus([p1,p2,p3]);if(c){$('#ed-final').textContent=`${c.human.toFixed(1)}% Human-like`;$('#ed-conf').textContent=`AI-like ${c.ai.toFixed(1)}% • consensus confidence ${c.confidence.toFixed(0)}% • ${c.count}/3 detectors available`;}}
  async function check(){const [s2,s3]=await Promise.all([window.electronAPI?.openDetectorStatus?.(),window.electronAPI?.lcrosDetectorStatus?.()]);$('#ed-s2').textContent=s2?.available?'ready':'not ready';$('#ed-s2').className=s2?.available?'ok':'warn';$('#ed-s3').textContent=s3?.available?'ready':'not ready';$('#ed-s3').className=s3?.available?'ok':'warn';return{s2,s3};}
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();render();};root.querySelector('.ed-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
  $('#ed-setup2').onclick=async()=>{try{status('Setting up Detector 2…');const r=await window.electronAPI?.setupOpenDetector?.();if(!r?.success)throw new Error(r?.error||'D2 setup failed');status('Detector 2 ready.');await check();}catch(e){status(e.message);}};
  $('#ed-setup3').onclick=async()=>{try{status('Setting up Detector 3 in isolated Python environment. The CLAP music checkpoint is about 2.35 GB and downloads once.');const r=await window.electronAPI?.setupLcrosDetector?.();if(!r?.success)throw new Error(r?.error||'D3 setup failed');status('Detector 3 ready.');await check();}catch(e){status('D3 setup failed: '+e.message);}};
  $('#ed-run').onclick=async()=>{const b=$('#ed-run');b.disabled=true;try{const path=await opts.getOriginalPath?.();if(!path)throw new Error('Load an audio file first.');refreshLocal();status('Running Detector 2…');const r2=await window.electronAPI?.runOpenDetector?.(path);if(r2?.success)d2=r2;else status('Detector 2 unavailable; continuing.');render();status('Running Detector 3 (CLAP model loading can take a while)…');const r3=await window.electronAPI?.runLcrosDetector?.(path);if(r3?.success)d3=r3;else status('Detector 3 unavailable: '+(r3?.error||'unknown'));render();status('Ensemble complete. Compare this consensus with the individual detectors, especially on known-human references.');}catch(e){status('Ensemble failed: '+e.message);}finally{b.disabled=false;}};
  check();return{root,toggle,check,render};
}
