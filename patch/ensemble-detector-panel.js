function humanProbFromExternal(r){
  if(!r) return null;
  const c=Math.max(0,Math.min(1,Number(r.confidence)||0));
  const label=String(r.label||'').toLowerCase();
  if(label==='real'||label==='human'||label==='nonai') return c*100;
  if(label==='fake'||label==='ai') return (1-c)*100;
  return null;
}
function calibration(){
  try{
    const c=window.__hdCalibrationV23||JSON.parse(localStorage.getItem('hd_calibration_v23')||'null');
    if(c) return c;
  }catch(_){}
  return {weights:{d1:.5,d2:.5},thresholds:{d1:50,d2:60}};
}
function combine(d1,d2){
  const c=calibration();
  const w1=Number(c.weights?.d1)||.5,w2=Number(c.weights?.d2)||.5;
  const sw=w1+w2||1;
  const human=(d1*w1+d2*w2)/sw;
  const spread=Math.abs(d1-d2);
  const agreement=Math.max(0,100-spread*3);
  const t1=Number(c.thresholds?.d1)||50,t2=Number(c.thresholds?.d2)||60;
  const votes=(d1>=t1?1:0)+(d2>=t2?1:0);
  const verdict=votes===2?'LIKELY HUMAN':votes===0?'LIKELY AI':'BORDERLINE / DISAGREE';
  const confidence=Math.max(0,Math.min(100,agreement));
  return {human,ai:100-human,spread,confidence,verdict,votes};
}
export function mountEnsembleDetectorPanel(opts={}){
  const style=document.createElement('style');
  style.textContent=`.ed-toggle{position:fixed;left:18px;bottom:66px;z-index:99995;border-radius:999px;padding:10px 14px;border:1px solid #555;background:#24242a;color:#fff}.ed-panel{position:fixed;left:18px;bottom:18px;width:min(500px,calc(100vw - 36px));max-height:calc(100vh - 90px);overflow:auto;z-index:100001;padding:14px;border:1px solid #444;border-radius:14px;background:rgba(20,21,25,.98);box-shadow:0 18px 50px #0009;color:#f2f2f2;font-family:system-ui}.ed-head{display:flex;justify-content:space-between;align-items:center}.ed-head small{display:block;opacity:.65}.ed-close{background:none;border:0;color:inherit;font-size:18px}.ed-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.ed-card{background:#ffffff0f;padding:9px;border-radius:9px}.ed-card small{display:block;opacity:.65}.ed-card b{font-size:17px}.ed-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px}.ed-btn{border:1px solid #ffffff2b;border-radius:8px;padding:8px 10px;background:#ffffff14;color:inherit;cursor:pointer}.ed-btn.main{background:#a8dcff;color:#101318;font-weight:700}.ed-btn:disabled{opacity:.45}.ed-status{font-size:11px;opacity:.78;line-height:1.4;margin-top:9px}.ed-final{margin-top:10px;padding:11px;border-radius:10px;background:#a8dcff18;border:1px solid #a8dcff55}.ed-final strong{font-size:22px;display:block}.ed-log{margin-top:8px;max-height:100px;overflow:auto;background:#0004;border:1px solid #ffffff16;border-radius:7px;padding:7px;font:11px/1.4 ui-monospace,Consolas,monospace}.ok{color:#64d98b}.warn{color:#ffd166}@media(max-width:760px){.ed-panel{left:12px;right:12px;width:auto}.ed-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const toggle=document.createElement('button');toggle.className='ed-toggle';toggle.textContent='Fast / Deep Check';document.body.appendChild(toggle);
  const root=document.createElement('section');root.className='ed-panel';root.style.display='none';
  root.innerHTML=`<div class="ed-head"><div><b>AI Music Detector</b><small>v2.3 • D1 Fast + D2 Deep</small></div><button class="ed-close">×</button></div>
  <div class="ed-grid">
    <div class="ed-card"><small>D1 • Fast Local DSP/FP</small><b id="ed-d1">—</b><small id="ed-d1m">Analyze Original first</small></div>
    <div class="ed-card"><small>D2 • Deep MS-CLAP</small><b id="ed-d2">—</b><small id="ed-d2m">offline model</small></div>
  </div>
  <div class="ed-final"><small>DEEP CHECK RESULT</small><strong id="ed-verdict">—</strong><div id="ed-final">—</div><div id="ed-conf" class="ed-status">Run D1 + D2.</div></div>
  <div class="ed-row"><span>D2 engine:</span><b id="ed-s2" class="warn">checking…</b><button class="ed-btn" id="ed-setup2">Setup D2</button></div>
  <div class="ed-row"><button class="ed-btn main" id="ed-run">RUN DEEP CHECK</button></div>
  <div class="ed-status" id="ed-status">IDLE</div><div id="ed-log" class="ed-log"></div>`;
  document.body.appendChild(root);
  const $=s=>root.querySelector(s); let d2=null;
  const stamp=()=>new Date().toLocaleTimeString();
  const log=t=>{const e=document.createElement('div');e.textContent='['+stamp()+'] '+t;$('#ed-log').appendChild(e);$('#ed-log').scrollTop=$('#ed-log').scrollHeight;};
  const status=t=>{$('#ed-status').textContent=t;log(t);};
  function refreshLocal(){const r=window.__localHumanDetectLatest;if(r){const h=Number(r.humanScore??r.humanPct);$('#ed-d1').textContent=`${h.toFixed(1)}% Human`;$('#ed-d1m').textContent=`DSP ${r.dspPct}% • FP ${r.fakePct}%`;return h;}$('#ed-d1').textContent='—';return null;}
  function render(){const p1=refreshLocal(),p2=humanProbFromExternal(d2);window.__ensembleLatest={d1:p1,d2:p2,raw2:d2};if(Number.isFinite(p2)){ $('#ed-d2').textContent=`${p2.toFixed(1)}% Human`;$('#ed-d2m').textContent=`${String(d2.label).toUpperCase()} • conf ${(Number(d2.confidence)*100).toFixed(0)}%`; }if(Number.isFinite(p1)&&Number.isFinite(p2)){const c=combine(p1,p2);window.__ensembleFinal=c;$('#ed-verdict').textContent=c.verdict;$('#ed-final').textContent=`${c.human.toFixed(1)}% Human-like / ${c.ai.toFixed(1)}% AI-like`;$('#ed-conf').textContent=`agreement ${c.confidence.toFixed(0)}% • spread ${c.spread.toFixed(1)} • calibrated thresholds`;}}
  async function check(){const s2=await window.electronAPI?.openDetectorStatus?.();$('#ed-s2').textContent=s2?.available?'ready':'not ready';$('#ed-s2').className=s2?.available?'ok':'warn';return{s2};}
  toggle.onclick=()=>{root.style.display='block';toggle.style.display='none';check();render();};root.querySelector('.ed-close').onclick=()=>{root.style.display='none';toggle.style.display='block';};
  $('#ed-setup2').onclick=async()=>{try{status('RUNNING: setup D2');const r=await window.electronAPI?.setupOpenDetector?.();if(!r?.success)throw new Error(r?.error||'D2 setup failed');status('DONE: D2 ready');await check();}catch(e){status('ERROR: '+e.message);}};
  $('#ed-run').onclick=async()=>{const b=$('#ed-run');b.disabled=true;try{const path=await opts.getOriginalPath?.();if(!path)throw new Error('Load an audio file first.');const p1=refreshLocal();if(!Number.isFinite(p1))throw new Error('Run Analyze Original first for D1.');status('RUNNING: D2 MS-CLAP');const r2=await window.electronAPI?.runOpenDetector?.(path);if(!r2?.success)throw new Error(r2?.error||'D2 failed');d2=r2;render();status('DONE: Deep Check complete');}catch(e){status('ERROR: '+e.message);}finally{b.disabled=false;}};
  check();return{root,toggle,check,render};
}
